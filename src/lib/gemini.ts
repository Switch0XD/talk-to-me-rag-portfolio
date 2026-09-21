import { GoogleGenAI } from "@google/genai";

function config() {
  return {
    primaryModel: process.env.GEMINI_PRIMARY_MODEL || "gemini-3.5-flash-lite",
    fallbackModel: process.env.GEMINI_FALLBACK_MODEL || "gemini-3.6-flash",
    groqModel: process.env.GROQ_MODEL || "openai/gpt-oss-20b",
    openRouterModel: process.env.OPENROUTER_MODEL || "openai/gpt-oss-20b:free",
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
  // 404 covers a retired model name, so the fallback model still gets a try.
  return status === 404 || status === 429 || (typeof status === "number" && status >= 500);
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

// Tries each provider in order and returns the first success. Only when every
// provider fails does it throw, so one rate-limited free tier never reaches the
// visitor as an error.
export async function withProviderFallback<T>(...providers: Array<() => Promise<T>>): Promise<T> {
  const failures: unknown[] = [];
  for (const run of providers) {
    try {
      return await run();
    } catch (error) {
      failures.push(error);
    }
  }
  throw new ProviderUnavailableError(
    `All configured AI providers are unavailable (${failures.map((error) => providerStatus(error) ?? "unknown").join("/")}).`,
  );
}

type ChatCompletionOptions = {
  url: string;
  apiKey: string | undefined;
  missingKeyMessage: string;
  model: string;
  prompt: string;
  maxTokens: number;
  extraHeaders?: Record<string, string>;
};

// Groq and OpenRouter both speak the OpenAI chat-completions protocol.
async function chatCompletion({ url, apiKey, missingKeyMessage, model, prompt, maxTokens, extraHeaders }: ChatCompletionOptions) {
  if (!apiKey) throw new ProviderUnavailableError(missingKeyMessage);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.01,
      max_tokens: maxTokens,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw Object.assign(new Error(`${new URL(url).host} request failed: ${detail}`), { status: response.status });
  }
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string | null } }> };
  const answer = data.choices?.[0]?.message?.content?.trim();
  if (!answer) throw new ProviderUnavailableError(`${new URL(url).host} returned an empty answer.`);
  return { answer, model };
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
    () =>
      chatCompletion({
        url: "https://api.groq.com/openai/v1/chat/completions",
        apiKey: process.env.GROQ_API_KEY,
        missingKeyMessage: "The Groq fallback has not been configured.",
        model: config().groqModel,
        prompt,
        maxTokens: 350,
      }),
    () =>
      chatCompletion({
        url: "https://openrouter.ai/api/v1/chat/completions",
        apiKey: process.env.OPENROUTER_API_KEY,
        missingKeyMessage: "The OpenRouter fallback has not been configured.",
        model: config().openRouterModel,
        prompt,
        // Reasoning models spend part of this budget thinking before they answer.
        maxTokens: 700,
        extraHeaders: { "X-Title": "HireStella portfolio assistant" },
      }),
  );
}
