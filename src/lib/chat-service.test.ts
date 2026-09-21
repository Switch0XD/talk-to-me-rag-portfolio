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

  it("refuses unrelated and unkeyworded questions without calling the model", async () => {
    for (const question of ["What is the weather in Paris?", "Have you used Kubernetes?", "Has she built with LangGraph?"]) {
      let generated = false;
      const response = await answerPortfolioQuestion(question, index, {
        embedQuery: async () => [-1, 0],
        generate: async () => {
          generated = true;
          return { answer: "invented", model: "test-model" };
        },
      });
      expect(response).toEqual({ kind: "refusal", answer: REFUSAL, citations: [] });
      expect(generated).toBe(false);
    }
  });

  it("refuses when the index is empty", async () => {
    const response = await answerPortfolioQuestion("What is TrustDrive?", { ...index, chunks: [] });
    expect(response).toEqual({ kind: "refusal", answer: REFUSAL, citations: [] });
  });

  it("declines to confirm an undocumented fact but still says what is documented", async () => {
    const unsupportedIndex: RagIndex = {
      ...index,
      chunks: [{
        ...index.chunks[0],
        text: "The supplied portfolio materials do not describe work at Google. His documented employers are Acme and Beta.",
      }],
    };
    let prompt = "";
    const response = await answerPortfolioQuestion("Has Kuldeep worked at Google?", unsupportedIndex, {
      embedQuery: async () => [1, 0],
      generate: async (received) => {
        prompt = received;
        return { answer: "The materials don't document work at Google. He has worked at Acme and Beta.", model: "test-model" };
      },
    });
    expect(response.kind).toBe("refusal");
    expect(response.answer).toContain("Acme and Beta");
    expect(prompt).toContain("explicitly say is not documented");
  });

  it("turns a NOT_DOCUMENTED reply into a refusal without the marker", async () => {
    const response = await answerPortfolioQuestion("Has he worked at Microsoft?", index, {
      embedQuery: async () => [1, 0],
      generate: async () => ({
        answer: "NOT_DOCUMENTED: The materials do not document work at Microsoft. He has worked at Acme.",
        model: "test-model",
      }),
    });
    expect(response.kind).toBe("refusal");
    expect(response.answer).toBe("The materials do not document work at Microsoft. He has worked at Acme.");
  });
});
