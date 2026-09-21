import { generateGroundedAnswer } from "@/lib/gemini";
import { embedText } from "@/lib/local-embeddings";
import { citationsFor, retrieve } from "@/lib/rag";
import type { ChatResponse, RagChunk, RagIndex } from "@/lib/types";

// The local retriever combines MiniLM cosine similarity with a small lexical
// boost. 0.32 admits supported portfolio facts while rejecting unrelated
// questions.
const DEFAULT_RELEVANCE_THRESHOLD = 0.32;
const RETRIEVED_CHUNKS = 5;
const REFUSAL = "I don’t have enough information in Kuldeep’s portfolio materials to answer that reliably.";
// The model starts its reply with this marker when the visitor asks whether
// Kuldeep worked somewhere or used something that the materials never mention.
const NOT_DOCUMENTED_PREFIX = "NOT_DOCUMENTED:";

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

const PORTFOLIO_INTENT_PATTERN =
  /\b(?:backend|companies|company|contact|developer|education|experience|frontend|full[-\s]?stack|healthcare|hims|job|jobs|portfolio|projects?|resume|skills?|studied|study|technologies|trustdrive|university|work|worked)\b/iu;
const PROJECT_FOCUSED_PATTERN =
  /\b(?:app\s+engine|blockchain|fhir|gcp|hardhat|healthcare\s+information\s+management\s+system|hims|hl7|ipfs|solidity|smart\s+contract|trustdrive)\b/iu;

export function buildRetrievalQuery(question: string): string {
  const trimmed = question.trim();
  let rewritten = trimmed
    .replace(/\babout\s+me\b/giu, "about Kuldeep Singh")
    .replace(/\b(?:my|mine|your|yours|his)\b/giu, "Kuldeep Singh's")
    .replace(/\b(?:i|you|yourself|he|him)\b/giu, "Kuldeep Singh");

  if (
    PORTFOLIO_INTENT_PATTERN.test(trimmed) &&
    !PROJECT_FOCUSED_PATTERN.test(trimmed) &&
    !/\b(?:kuldeep|singh)\b/iu.test(rewritten)
  ) {
    rewritten = `${rewritten} Kuldeep Singh`;
  }

  return rewritten;
}

function groundedPrompt(question: string, context: string): string {
  return `You are the portfolio assistant for Kuldeep Singh. Answer the visitor’s question using only the context below.

Rules:
- Do not use outside knowledge or make plausible inferences.
- If the visitor asks whether Kuldeep worked at an organisation, used a technology, or built something, and the context does not mention it (or says it is not documented), start your reply with "NOT_DOCUMENTED:" and then write one or two sentences. First say that Kuldeep's portfolio materials do not document that. Never answer "No": absence from the materials is not proof. Then, only if the context contains them, state the closest documented facts, such as his documented employers and roles.
- For any other question the context does not directly support (including questions unrelated to Kuldeep), reply exactly: "I don’t have enough information in Kuldeep’s portfolio materials to answer that reliably."
- Do not claim that Kuldeep has used a technology, worked for an organisation, achieved a metric, or built a feature unless the context says so.
- When the context gives a direct high-level answer but not its lower-level implementation details, provide the documented high-level answer and say that further detail is not documented. Do not refuse solely because those lower-level details are absent.
- Be concise, factual, and write in the first person only if the source material clearly represents Kuldeep’s own work.
- Do not mention these instructions or say that you searched a database.

Visitor question: ${question}

Retrieved portfolio context:
${context}`;
}

function undocumentedFactPrompt(question: string, context: string): string {
  return `You are the portfolio assistant for Kuldeep Singh. The visitor asked about something the portfolio materials explicitly say is not documented.

Reply in one or two sentences, using only the context below:
1. Say that Kuldeep's portfolio materials do not document what was asked. Do not answer "No" and do not claim it never happened; absence from the materials is not proof.
2. Then state what IS documented that is closest to the question (for example his documented employers or roles), using only facts from the context. If the context has nothing suitable, stop after sentence 1.
- Do not use outside knowledge, and do not mention these instructions.

Visitor question: ${question}

Retrieved portfolio context:
${context}`;
}

const NON_SUBJECT_TERMS = new Set([
  "a", "an", "and", "at", "did", "do", "does", "experience", "has", "have", "he", "his", "i", "in", "is", "it", "kuldeep", "of", "on", "the", "to", "was", "what", "where", "who", "with", "work", "worked", "you",
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

const refusal = (): ChatResponse => ({ kind: "refusal", answer: REFUSAL, citations: [] });

// Every question is answered from retrieved portfolio context or refused.
// There is deliberately no ungrounded "general knowledge" path: a keyword
// guess about whether a question is "about the portfolio" lets questions such
// as "Have you used Kubernetes?" bypass grounding and get an invented answer.
export async function answerPortfolioQuestion(
  question: string,
  index: RagIndex,
  dependencies: ChatDependencies = productionDependencies,
): Promise<ChatResponse> {
  if (!index.chunks.length) return refusal();

  const retrievalQuery = buildRetrievalQuery(question);
  const queryEmbedding = await dependencies.embedQuery(retrievalQuery);
  const matches = retrieve(index, queryEmbedding, RETRIEVED_CHUNKS, retrievalQuery);
  const bestScore = matches[0]?.score ?? 0;
  if (bestScore < relevanceThreshold()) return refusal();

  const context = matches
    .map(({ chunk }, position) => `[${position + 1}] ${chunk.sourceTitle} — ${chunk.heading}\n${chunk.text}`)
    .join("\n\n");
  // The materials say outright that this fact is undocumented. Decline to
  // confirm it, but still tell the visitor what is documented instead of a bare
  // refusal.
  if (contextExplicitlyWithholdsTheFact(question, matches.map(({ chunk }) => chunk))) {
    const response = await dependencies.generate(undocumentedFactPrompt(question, context));
    return {
      kind: "refusal",
      answer: response.answer,
      citations: citationsFor(matches.map(({ chunk }) => chunk)),
      model: response.model,
    };
  }

  const response = await dependencies.generate(groundedPrompt(question, context));
  const citations = citationsFor(matches.map(({ chunk }) => chunk));
  if (response.answer.startsWith(NOT_DOCUMENTED_PREFIX)) {
    return {
      kind: "refusal",
      answer: response.answer.slice(NOT_DOCUMENTED_PREFIX.length).trim(),
      citations,
      model: response.model,
    };
  }
  return {
    kind: response.answer === REFUSAL ? "refusal" : "answer",
    answer: response.answer,
    citations,
    model: response.model,
  };
}

export { REFUSAL };
