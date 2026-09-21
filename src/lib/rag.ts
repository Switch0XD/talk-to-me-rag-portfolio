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

const RETRIEVAL_STOP_TERMS = new Set([
  "about", "after", "also", "and", "are", "been", "can", "did", "does", "for", "from", "has", "have", "his", "how",
  "into", "kuldeep", "mine", "portfolio", "resume", "singh", "that", "the", "their", "this", "what", "when", "where",
  "which", "who", "why", "with", "you", "your",
]);

function retrievalTerms(query: string): string[] {
  return query.toLowerCase().match(/[\p{L}\p{N}]+/gu)?.filter((term) => term.length > 2 && !RETRIEVAL_STOP_TERMS.has(term)) || [];
}

function variantsFor(term: string): string[] {
  const variants = new Set([term]);
  if (term.endsWith("ies") && term.length > 4) variants.add(`${term.slice(0, -3)}y`);
  if (term.endsWith("ed") && term.length > 4) variants.add(term.slice(0, -2));
  if (term.endsWith("s") && term.length > 3) variants.add(term.slice(0, -1));
  return [...variants];
}

function hasTerm(haystack: string, term: string): boolean {
  return variantsFor(term).some((variant) => haystack.includes(variant));
}

function lexicalBoost(query: string, chunk: RagChunk): number {
  const terms = retrievalTerms(query);
  if (!terms.length) return 0;

  const heading = `${chunk.sourceTitle} ${chunk.heading}`.toLowerCase();
  const body = chunk.text.toLowerCase();
  const headingMatches = terms.filter((term) => hasTerm(heading, term)).length;
  const bodyMatches = terms.filter((term) => hasTerm(body, term)).length;
  return (headingMatches / terms.length) * 0.16 + (bodyMatches / terms.length) * 0.12;
}

const ABSENCE_GENERIC_TERMS = new Set([
  "assistant", "describe", "developer", "experience", "frameworks", "infer", "materials", "other", "roles", "should",
  "supplied", "tools", "work", "worked",
]);

function absencePenalty(query: string, chunk: RagChunk): number {
  const absenceText = `${chunk.heading} ${chunk.text}`;
  if (!/\bportfolio\s+materials?\s+(?:do not|does not|don't|doesn't)\s+(?:describe|document|mention|include|provide|support)\b/iu.test(absenceText)) {
    return 0;
  }

  const queryTermSet = new Set(retrievalTerms(query));
  const specificTerms = retrievalTerms(absenceText).filter((term) => !ABSENCE_GENERIC_TERMS.has(term));
  return specificTerms.some((term) => queryTermSet.has(term)) ? 0 : -0.3;
}

export function retrieve(index: RagIndex, queryEmbedding: number[], limit = 4, query?: string) {
  return index.chunks
    .map((chunk) => {
      const vectorScore = cosineSimilarity(queryEmbedding, chunk.embedding);
      return { chunk, score: vectorScore + (query ? lexicalBoost(query, chunk) + absencePenalty(query, chunk) : 0) };
    })
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
