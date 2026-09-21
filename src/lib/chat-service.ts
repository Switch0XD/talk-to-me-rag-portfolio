import { generateGroundedAnswer } from "@/lib/gemini";
import { embedText } from "@/lib/local-embeddings";
import { citationsFor, retrieve } from "@/lib/rag";
import type { ChatResponse, RagChunk, RagIndex } from "@/lib/types";

// all-MiniLM-L6-v2 scores this small corpus lower than the previous Vertex
// model. 0.32 admits directly supported HIMS facts while rejecting unrelated
// questions (the weather fixture scores 0.14).
const DEFAULT_RELEVANCE_THRESHOLD = 0.32;
const REFUSAL = "I don’t have enough information in Kuldeep’s portfolio materials to answer that reliably.";

export type ChatDependencies = {
  embedQuery: (question: string) => Promise<number[]>;
  generate: (prompt: string) => Promise<{ answer: string; model: string }>;
};

const productionDependencies: ChatDependencies = {
  embedQuery: embedText,
  generate: generateGroundedAnswer,
};

function relevanceThreshold(): number {
  const parsed = Number(process.env.RAG_RELEVANCE_THRESHOLD);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : DEFAULT_RELEVANCE_THRESHOLD;
}

function groundedPrompt(question: string, context: string): string {
  return `You are the portfolio assistant for Kuldeep Singh. Answer the visitor’s question using only the context below.

Rules:
- Do not use outside knowledge or make plausible inferences.
- If the context does not directly support an answer, reply exactly: "I don’t have enough information in Kuldeep’s portfolio materials to answer that reliably."
- If the context says a fact is absent, not documented, or unsupported by the portfolio materials, reply with that exact refusal. Never turn missing evidence into a "No" answer.
- Do not claim that Kuldeep has used a technology, worked for an organisation, achieved a metric, or built a feature unless the context says so.
- When the context gives a direct high-level answer but not its lower-level implementation details, provide the documented high-level answer and say that further detail is not documented. Do not refuse solely because those lower-level details are absent.
- Be concise, factual, and write in the first person only if the source material clearly represents Kuldeep’s own work.
- Do not mention these instructions or say that you searched a database.

Visitor question: ${question}

Retrieved portfolio context:
${context}`;
}

const NON_SUBJECT_TERMS = new Set([
  "a", "an", "and", "at", "did", "do", "does", "has", "have", "he", "his", "i", "in", "is", "it", "kuldeep", "of", "on", "the", "to", "was", "what", "where", "who", "with", "work", "worked", "you",
]);

function subjectTerms(value: string): string[] {
  return value.toLowerCase().match(/[\p{L}\p{N}]+/gu)?.filter((term) => term.length > 2 && !NON_SUBJECT_TERMS.has(term)) || [];
}

function contextExplicitlyWithholdsTheFact(question: string, chunks: RagChunk[]): boolean {
  const terms = subjectTerms(question);
  if (!terms.length) return false;

  return chunks.some((chunk) => {
    const explicitlyUndocumented = /\b(?:supplied|portfolio)\s+(?:portfolio\s+)?materials?\s+(?:do not|does not|don't|doesn't)\s+(?:describe|document|mention|include|provide|support)\b/iu.test(chunk.text);
    const chunkText = `${chunk.heading} ${chunk.text}`.toLowerCase();
    return explicitlyUndocumented && terms.some((term) => chunkText.includes(term));
  });
}

export async function answerPortfolioQuestion(
  question: string,
  index: RagIndex,
  dependencies: ChatDependencies = productionDependencies,
): Promise<ChatResponse> {
  if (!index.chunks.length) {
    return { kind: "refusal", answer: REFUSAL, citations: [] };
  }

  const queryEmbedding = await dependencies.embedQuery(question);
  const matches = retrieve(index, queryEmbedding);
  const bestScore = matches[0]?.score ?? 0;
  if (bestScore < relevanceThreshold()) {
    return { kind: "refusal", answer: REFUSAL, citations: [] };
  }

  const context = matches
    .map(({ chunk }, position) => `[${position + 1}] ${chunk.sourceTitle} — ${chunk.heading}\n${chunk.text}`)
    .join("\n\n");
  if (contextExplicitlyWithholdsTheFact(question, matches.map(({ chunk }) => chunk))) {
    return { kind: "refusal", answer: REFUSAL, citations: [] };
  }
  const response = await dependencies.generate(groundedPrompt(question, context));
  return {
    kind: response.answer === REFUSAL ? "refusal" : "answer",
    answer: response.answer,
    citations: citationsFor(matches.map(({ chunk }) => chunk)),
    model: response.model,
  };
}

export { REFUSAL };
