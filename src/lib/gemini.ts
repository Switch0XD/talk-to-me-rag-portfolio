import { GoogleGenAI } from "@google/genai";

function config() {
  return {
    embeddingModel: process.env.VERTEX_EMBEDDING_MODEL || "gemini-embedding-001",
    primaryModel: process.env.GEMINI_PRIMARY_MODEL || "gemini-2.5-flash-lite",
    fallbackModel: process.env.GEMINI_FALLBACK_MODEL || "gemini-2.5-flash",
    groqModel: process.env.GROQ_MODEL || "openai/gpt-oss-20b",
    vertexProject: process.env.VERTEX_AI_PROJECT || process.env.GOOGLE_CLOUD_PROJECT,
    vertexLocation: process.env.VERTEX_AI_LOCATION || process.env.GOOGLE_CLOUD_LOCATION || "us-central1",
    vertexCredentials: process.env.VERTEX_AI_CREDENTIALS,
  };
}

export class ProviderUnavailableError extends Error {
  constructor(message = "The AI service is temporarily unavailable.") {
    super(message);
    this.name = "ProviderUnavailableError";
  }
}

function client() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new ProviderUnavailableError("The chat assistant has not been configured yet.");
  }
  return new GoogleGenAI({ apiKey });
}

function vertexClient() {
  const { vertexProject, vertexLocation, vertexCredentials } = config();
  if (!vertexProject) {
    throw new ProviderUnavailableError("Vertex embeddings require VERTEX_AI_PROJECT.");
  }

  let credentials: Record<string, unknown> | undefined;
  if (vertexCredentials) {
    try {
      credentials = JSON.parse(vertexCredentials) as Record<string, unknown>;
    } catch {
      throw new ProviderUnavailableError("VERTEX_AI_CREDENTIALS must contain valid one-line service-account JSON.");
    }
  }

  return new GoogleGenAI({
    vertexai: true,
    project: vertexProject,
    location: vertexLocation,
    apiVersion: "v1",
    ...(credentials ? { googleAuthOptions: { credentials } } : {}),
  });
}

export function providerStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as { status?: unknown; response?: { status?: unknown } };
  if (typeof candidate.status === "number") return candidate.status;
  if (typeof candidate.response?.status === "number") return candidate.response.status;
  return undefined;
}

export function shouldTryFallback(error: unknown): boolean {
  const status = providerStatus(error);
  return status === 429 || (typeof status === "number" && status >= 500);
}

export async function withModelFallback<T>(
  run: (model: string) => Promise<T>,
  primary = config().primaryModel,
  fallback = config().fallbackModel,
): Promise<{ result: T; model: string }> {
  try {
    return { result: await run(primary), model: primary };
  } catch (error) {
    if (!shouldTryFallback(error) || fallback === primary) throw error;
    try {
      return { result: await run(fallback), model: fallback };
    } catch (fallbackError) {
      throw new ProviderUnavailableError(
        `Both configured Gemini models are unavailable (${providerStatus(error) ?? "unknown"}/${providerStatus(fallbackError) ?? "unknown"}).`,
      );
    }
  }
}

export async function withProviderFallback<T>(
  runGemini: () => Promise<T>,
  runGroq: () => Promise<T>,
): Promise<T> {
  try {
    return await runGemini();
  } catch (geminiError) {
    try {
      return await runGroq();
    } catch (groqError) {
      throw new ProviderUnavailableError(
        `Gemini and Groq are unavailable (${providerStatus(geminiError) ?? "unknown"}/${providerStatus(groqError) ?? "unknown"}).`,
      );
    }
  }
}

export async function embedText(text: string, taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY") {
  const response = await vertexClient().models.embedContent({
    model: config().embeddingModel,
    contents: text,
    config: {
      taskType,
      outputDimensionality: 768,
    },
  });
  const vector = response.embeddings?.[0]?.values;
  if (!vector?.length) throw new ProviderUnavailableError("Gemini returned an empty embedding.");
  return vector;
}

export async function embedDocuments(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  const vectors: number[][] = [];
  for (const text of texts) {
    // Vertex's Gemini embedding endpoint accepts one gemini-embedding-001 input
    // at a time. Keeping this sequential also avoids bursting the free/shared quota.
    vectors.push(await embedText(text, "RETRIEVAL_DOCUMENT"));
  }
  return vectors;
}

export async function generateGroundedAnswer(prompt: string) {
  return withProviderFallback(
    async () => {
      const response = await withModelFallback(async (model) => {
        const result = await client().models.generateContent({
          model,
          contents: prompt,
          config: {
            temperature: 0,
            maxOutputTokens: 350,
          },
        });
        const text = result.text?.trim();
        if (!text) throw new ProviderUnavailableError("Gemini returned an empty answer.");
        return text;
      });
      return { answer: response.result, model: response.model };
    },
    async () => {
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) throw new ProviderUnavailableError("The Groq fallback has not been configured.");
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: config().groqModel,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.01,
          max_completion_tokens: 350,
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        const detail = await response.text();
        const error = Object.assign(new Error(`Groq request failed: ${detail}`), { status: response.status });
        throw error;
      }
      const data = (await response.json()) as { choices?: Array<{ message?: { content?: string | null } }> };
      const answer = data.choices?.[0]?.message?.content?.trim();
      if (!answer) throw new ProviderUnavailableError("Groq returned an empty answer.");
      return { answer, model: config().groqModel };
    },
  );
}

export function activeEmbeddingModel() {
  return config().embeddingModel;
}
