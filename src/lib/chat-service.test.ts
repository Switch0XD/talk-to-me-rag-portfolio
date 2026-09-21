import { describe, expect, it } from "vitest";
import { answerPortfolioQuestion, buildRetrievalQuery, REFUSAL } from "@/lib/chat-service";
import type { RagIndex } from "@/lib/types";

const index: RagIndex = {
  version: 1,
  generatedAt: "2026-01-01T00:00:00.000Z",
  embeddingModel: "test",
  dimensions: 2,
  chunks: [
    {
      id: "hims-1",
      sourceId: "hims",
      sourceTitle: "HIMS",
      heading: "Healthcare standard",
      text: "HIMS included HL7 FHIR R4-compliant REST APIs.",
      embedding: [1, 0],
    },
  ],
};

describe("portfolio answer service", () => {
  it("rewrites natural portfolio pronouns for retrieval", () => {
    expect(buildRetrievalQuery("What is your experience?")).toBe("What is Kuldeep Singh's experience?");
    expect(buildRetrievalQuery("projects")).toBe("projects Kuldeep Singh");
    expect(buildRetrievalQuery("What interoperability standard did HIMS use?")).toBe("What interoperability standard did HIMS use?");
    expect(buildRetrievalQuery("Tell me a joke")).toBe("Tell me a joke");
  });

  it("returns a grounded answer and source citation", async () => {
    const response = await answerPortfolioQuestion("Which healthcare standard?", index, {
      embedQuery: async () => [1, 0],
      generate: async () => ({ answer: "HIMS used HL7 FHIR R4.", model: "test-model" }),
    });
    expect(response.kind).toBe("answer");
    expect(response.citations).toEqual([{ sourceId: "hims", title: "HIMS", heading: "Healthcare standard" }]);
  });

  it("falls back to general knowledge for simple non-portfolio questions", async () => {
    let generated = false;
    const response = await answerPortfolioQuestion("What is the weather in Paris?", index, {
      embedQuery: async () => [-1, 0],
      generate: async (prompt) => {
        generated = true;
        expect(prompt).toContain("User question: What is the weather in Paris?");
        return { answer: "It is usually mild and sunny.", model: "test-model" };
      },
    });
    expect(response).toEqual({
      kind: "answer",
      answer: "It is usually mild and sunny.",
      citations: [],
      model: "test-model",
    });
    expect(generated).toBe(true);
  });

  it("refuses without generation when retrieved material explicitly says a fact is undocumented", async () => {
    const unsupportedIndex: RagIndex = {
      ...index,
      chunks: [{
        ...index.chunks[0],
        text: "The supplied portfolio materials do not describe work with LangGraph.",
      }],
    };
    let generated = false;
    const response = await answerPortfolioQuestion("Has Kuldeep worked with LangGraph?", unsupportedIndex, {
      embedQuery: async () => [1, 0],
      generate: async () => {
        generated = true;
        return { answer: "No", model: "test-model" };
      },
    });
    expect(response).toEqual({ kind: "refusal", answer: REFUSAL, citations: [] });
    expect(generated).toBe(false);
  });
});
