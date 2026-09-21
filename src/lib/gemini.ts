import { GoogleGenAI } from "@google/genai";

function config() {
  return {
    embeddingModel: process.env.VERTEX_EMBEDDING_MODEL || "gemini-embedding-001",
    primaryModel: process.env.GEMINI_PRIMARY_MODEL || "gemini-2.5-flash-lite",
    fallbackModel: process.env.GEMINI_FALLBACK_MODEL || "gemini-2.5-flash",
    groqModel: process.env.GROQ_MODEL || "openai/gpt-oss-20b",
    vertexProject: process.env.VERTEX_AI_PROJECT || process.env.GOOGLE_CLOUD_PROJECT,
    vertexLocation: process.env.VERTEX_AI_LOCATION || process.env.GOOGLE_CLOUD_LOCATION || "us-central1",
    vertexCredentialsFile: process.env.VERTEX_AI_CREDENTIALS_FILE,
    vertexCredentials: process.env.VERTEX_AI_CREDENTIALS,
  };
}

let cachedVertexClient: GoogleGenAI | undefined;
let cachedVertexConfig: string | undefined;

export class ProviderUnavailableError extends Error {
  constructor(message = "The AI service is temporarily unavailable.") {
    super(message);
    this.name = "ProviderUnavailableError";
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function client() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new ProviderUnavailableError("The chat assistant has not been configured yet.");
  }
  return new GoogleGenAI({ apiKey });
}

function vertexClient() {
  const { vertexProject, vertexLocation, vertexCredentialsFile, vertexCredentials } = config();
  if (!vertexProject) {
    throw new ProviderUnavailableError("Vertex embeddings require VERTEX_AI_PROJECT.");
  }

  if (vertexCredentialsFile) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = vertexCredentialsFile;
  }

  let credentials: Record<string, unknown> | undefined;
  if (!vertexCredentialsFile && vertexCredentials) {
    try {
      credentials = JSON.parse(vertexCredentials) as Record<string, unknown>;
    } catch {
      throw new ProviderUnavailableError("VERTEX_AI_CREDENTIALS must contain valid one-line service-account JSON.");
    }
  }

  const clientConfig = `${vertexProject}:${vertexLocation}:${vertexCredentialsFile || "inline"}`;
  if (cachedVertexClient && cachedVertexConfig === clientConfig) return cachedVertexClient;

  cachedVertexClient = new GoogleGenAI({
    vertexai: true,
    project: vertexProject,
    location: vertexLocation,
    ...(credentials ? { googleAuthOptions: { credentials } } : {}),
  });
  cachedVertexConfig = clientConfig;
  return cachedVertexClient;
}

export function providerStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as { status?: unknown; response?: { status?: unknown }; error?: { code?: unknown } };
  if (typeof candidate.status === "number") return candidate.status;
  if (typeof candidate.response?.status === "number") return candidate.response.status;
  if (typeof candidate.error?.code === "number") return candidate.error.code;
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

/**
 * Embed several retrieval queries in one Vertex request. This is used by the
 * local evaluator so it does not consume one quota unit per test case.
 */
export async function embedQueries(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];

  const response = await vertexClient().models.embedContent({
    model: config().embeddingModel,
    contents: texts,
    config: {
      taskType: "RETRIEVAL_QUERY",
      outputDimensionality: 768,
    },
  });
  const vectors = response.embeddings?.map((embedding) => embedding.values || []) || [];
  if (vectors.length !== texts.length || vectors.some((vector) => !vector.length)) {
    throw new ProviderUnavailableError("Vertex returned incomplete query embeddings.");
  }
  return vectors;
}

export async function embedDocuments(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  const model = config().embeddingModel;

  // Batching 5 texts per call reduces total API invocations by 80%
  const batchSize = 5;
  const vectors: number[][] = [];

  for (let index = 0; index < texts.length; index += batchSize) {
    const batch = texts.slice(index, index + batchSize);

    let attempts = 0;
    let success = false;

    while (!success && attempts < 8) {
      try {
        attempts++;
        const response = await vertexClient().models.embedContent({
          model,
          contents: batch,
          config: {
            taskType: "RETRIEVAL_DOCUMENT",
            outputDimensionality: 768,
          },
        });

        const batchVectors = response.embeddings?.map((embedding) => embedding.values || []) || [];
        if (!batchVectors.length || batchVectors.length !== batch.length) {
          throw new ProviderUnavailableError("Vertex returned incomplete document embeddings.");
        }

        vectors.push(...batchVectors);
        success = true;
        console.log(
          `Embedded chunks ${index + 1}–${Math.min(index + batchSize, texts.length)} of ${texts.length}`,
        );
      } catch (err: unknown) {
        const status = providerStatus(err);
        if (status === 429 && attempts < 8) {
          // Back off by 5s, 10s, 20s... to let the RPM quota window recover
          const waitTime = Math.max(5000, Math.pow(2, attempts) * 1500);
          console.warn(`[Quota 429] Waiting ${waitTime / 1000}s before retrying batch...`);
          await sleep(waitTime);
        } else {
          throw err;
        }
      }
    }

    // Steady 3.5s cooldown between batches to stay under default Vertex RPM limits
    if (index + batchSize < texts.length) {
      await sleep(3500);
    }
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
