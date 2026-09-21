import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { loadProjectEnv } from "./load-env";
import { activeEmbeddingModel, embedDocuments } from "../src/lib/gemini";
import { chunkDocument, normalizeText, redactPersonalPhoneNumbers } from "../src/lib/rag";
import type { RagChunk, RagIndex, SourceDocument } from "../src/lib/types";

const root = process.cwd();
const manifestPath = path.join(root, "content", "sources.json");
const sourceDirectory = path.join(root, "content", "source");
const outputPath = path.join(root, "src", "data", "rag-index.json");
const SUPPORTED_EXTENSIONS = new Set([".md", ".txt", ".pdf", ".docx"]);

type SourceManifest = { documents?: Array<{ path: string; title?: string }> };

function sourceId(filePath: string): string {
  return createHash("sha1").update(filePath.replaceAll("\\", "/").toLowerCase()).digest("hex").slice(0, 12);
}

function titleFromPath(filePath: string): string {
  return path
    .basename(filePath, path.extname(filePath))
    .replaceAll(/[-_]+/g, " ")
    .replaceAll(/\b\w/g, (letter) => letter.toUpperCase());
}

async function discoverFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return discoverFiles(entryPath);
      return SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase()) ? [entryPath] : [];
    }),
  );
  return files.flat();
}

async function configuredSources(): Promise<SourceDocument[]> {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as SourceManifest;
  const fromManifest = (manifest.documents || []).map((document) => {
    const absolutePath = path.resolve(root, document.path);
    return {
      id: sourceId(document.path),
      path: absolutePath,
      title: document.title || titleFromPath(document.path),
    };
  });

  const discovered = (await discoverFiles(sourceDirectory)).map((absolutePath) => {
    const relativePath = path.relative(root, absolutePath);
    return {
      id: sourceId(relativePath),
      path: absolutePath,
      title: titleFromPath(relativePath),
    };
  });

  const deduplicated = new Map<string, SourceDocument>();
  for (const document of [...discovered, ...fromManifest]) {
    deduplicated.set(path.normalize(document.path).toLowerCase(), document);
  }
  return [...deduplicated.values()];
}

async function extractText(document: SourceDocument): Promise<string> {
  const extension = path.extname(document.path).toLowerCase();
  const buffer = await readFile(document.path);
  let extracted: string;
  if (extension === ".md" || extension === ".txt") {
    extracted = buffer.toString("utf8");
  } else if (extension === ".docx") {
    const result = await mammoth.extractRawText({ buffer });
    extracted = result.value;
  } else if (extension === ".pdf") {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      extracted = result.text;
    } finally {
      await parser.destroy();
    }
  } else {
    throw new Error(`Unsupported source extension: ${extension}`);
  }
  return normalizeText(redactPersonalPhoneNumbers(extracted));
}

async function main() {
  loadProjectEnv(root);
  const documents = await configuredSources();
  if (!documents.length) throw new Error("No source documents found. Add files to content/source or content/sources.json.");

  const unembeddedChunks: Array<Omit<RagChunk, "embedding">> = [];
  for (const document of documents) {
    const text = await extractText(document);
    if (!text) throw new Error(`No readable text was extracted from ${path.relative(root, document.path)}.`);
    const chunks = chunkDocument(text, document.title);
    unembeddedChunks.push(
      ...chunks.map((chunk, index) => ({
        id: `${document.id}-${index + 1}`,
        sourceId: document.id,
        sourceTitle: document.title,
        heading: chunk.heading,
        text: chunk.text,
      })),
    );
    console.info(`Prepared ${chunks.length} chunks from ${path.relative(root, document.path)}`);
  }

  const embeddings = await embedDocuments(unembeddedChunks.map((chunk) => chunk.text));
  const chunks: RagChunk[] = unembeddedChunks.map((chunk, index) => ({ ...chunk, embedding: embeddings[index] }));
  const index: RagIndex = {
    version: 1,
    generatedAt: new Date().toISOString(),
    embeddingModel: activeEmbeddingModel(),
    dimensions: embeddings[0]?.length || 0,
    chunks,
  };

  await writeFile(outputPath, `${JSON.stringify(index)}\n`, "utf8");
  console.info(`Wrote ${chunks.length} chunks (${index.dimensions} dimensions) to ${path.relative(root, outputPath)}.`);
}

main().catch((error) => {
  console.error("Ingestion failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
