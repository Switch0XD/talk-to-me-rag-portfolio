import type { Citation, RagChunk, RagIndex } from "@/lib/types";

export const CHUNK_SIZE_TOKENS = 500;
export const CHUNK_OVERLAP_TOKENS = 80;

export function normalizeText(input: string): string {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/[\t ]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function redactPersonalPhoneNumbers(input: string): string {
  return input.replace(/\+?\d[\d\s().-]{8,}\d/g, "[phone number redacted]");
}

export function estimateTokens(input: string): number {
  return Math.ceil(normalizeText(input).length / 4);
}

type Section = { heading: string; body: string };

function sectionsFromText(text: string, fallbackHeading: string): Section[] {
  const lines = normalizeText(text).split("\n");
  const sections: Section[] = [];
  let heading = fallbackHeading;
  let body: string[] = [];

  const push = () => {
    const content = normalizeText(body.join("\n"));
    if (content) sections.push({ heading, body: content });
  };

  for (const line of lines) {
    const markdownHeading = line.match(/^#{1,6}\s+(.+)$/);
    if (markdownHeading) {
      push();
      heading = markdownHeading[1].trim();
      body = [];
      continue;
    }
    body.push(line);
  }
  push();
  return sections.length ? sections : [{ heading: fallbackHeading, body: normalizeText(text) }];
}

function withOverlap(previous: string): string {
  const maxCharacters = CHUNK_OVERLAP_TOKENS * 4;
  if (previous.length <= maxCharacters) return previous;
  const boundary = previous.lastIndexOf(" ", previous.length - maxCharacters);
  return previous.slice(boundary === -1 ? previous.length - maxCharacters : boundary + 1);
}

function splitLongParagraph(paragraph: string, maxCharacters: number): string[] {
  const words = paragraph.split(/\s+/).filter(Boolean);
  const pieces: string[] = [];
  let piece = "";
  for (const word of words) {
    const next = piece ? `${piece} ${word}` : word;
    if (next.length > maxCharacters && piece) {
      pieces.push(piece);
      piece = word;
    } else {
      piece = next;
    }
  }
  if (piece) pieces.push(piece);
  return pieces;
}

export function chunkDocument(text: string, fallbackHeading: string): Array<{ heading: string; text: string }> {
  const targetCharacters = CHUNK_SIZE_TOKENS * 4;
  const chunks: Array<{ heading: string; text: string }> = [];

  for (const section of sectionsFromText(text, fallbackHeading)) {
    const paragraphs = section.body
      .split(/\n\s*\n/)
      .flatMap((paragraph) => splitLongParagraph(normalizeText(paragraph), targetCharacters))
      .filter(Boolean);

    let current = "";
    for (const paragraph of paragraphs) {
      const next = current ? `${current}\n\n${paragraph}` : paragraph;
      if (estimateTokens(next) > CHUNK_SIZE_TOKENS && current) {
        chunks.push({ heading: section.heading, text: current });
        current = `${withOverlap(current)}\n\n${paragraph}`;
      } else {
        current = next;
      }
    }
    if (current) chunks.push({ heading: section.heading, text: current });
  }
  return chunks;
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length !== right.length || left.length === 0) return 0;
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] ** 2;
    rightMagnitude += right[index] ** 2;
  }
  if (!leftMagnitude || !rightMagnitude) return 0;
  return dot / Math.sqrt(leftMagnitude * rightMagnitude);
}

export function retrieve(index: RagIndex, queryEmbedding: number[], limit = 4) {
  return index.chunks
    .map((chunk) => ({ chunk, score: cosineSimilarity(queryEmbedding, chunk.embedding) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

export function citationsFor(chunks: RagChunk[]): Citation[] {
  const citations = new Map<string, Citation>();
  for (const chunk of chunks) {
    const citation = {
      sourceId: chunk.sourceId,
      title: chunk.sourceTitle,
      heading: chunk.heading,
    };
    citations.set(`${citation.sourceId}:${citation.heading}`, citation);
  }
  return [...citations.values()];
}
