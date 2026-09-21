import { describe, expect, it } from "vitest";
import { CHUNK_SIZE_TOKENS, chunkDocument, citationsFor, cosineSimilarity, normalizeText, redactPersonalPhoneNumbers, retrieve } from "@/lib/rag";
import type { RagIndex } from "@/lib/types";

describe("RAG helpers", () => {
  it("normalizes whitespace before ingesting", () => {
    expect(normalizeText("A  line \r\n\r\n\r\n B")).toBe("A line\n\n B");
  });

  it("redacts phone numbers from the indexable corpus", () => {
    expect(redactPersonalPhoneNumbers("Call +1 555 010 2030 for details.")).toBe("Call [phone number redacted] for details.");
  });

  it("keeps markdown headings with their chunks", () => {
    const chunks = chunkDocument("# Architecture\n\n" + "word ".repeat(CHUNK_SIZE_TOKENS * 5), "Fallback");
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.heading === "Architecture")).toBe(true);
  });

  it("ranks vectors by cosine similarity and emits distinct citations", () => {
    const index: RagIndex = {
      version: 1,
      generatedAt: "2026-01-01T00:00:00.000Z",
      embeddingModel: "test",
      dimensions: 2,
      chunks: [
        { id: "one", sourceId: "resume", sourceTitle: "Resume", heading: "Skills", text: "Node", embedding: [1, 0] },
        { id: "two", sourceId: "resume", sourceTitle: "Resume", heading: "Skills", text: "Express", embedding: [0.9, 0] },
        { id: "three", sourceId: "project", sourceTitle: "Project", heading: "Architecture", text: "FHIR", embedding: [0, 1] },
      ],
    };
    const matches = retrieve(index, [1, 0]);
    expect(matches[0].chunk.id).toBe("one");
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    expect(citationsFor(matches.map((match) => match.chunk))).toHaveLength(2);
  });
});
