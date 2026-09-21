import { z } from "zod";
import ragIndexData from "@/data/rag-index.json";
import { clientKey, isRateLimited } from "@/lib/rate-limit";
import type { RagIndex } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  question: z.string().trim().min(2).max(600),
});

export async function POST(request: Request) {
  if (isRateLimited(clientKey(request))) {
    return Response.json(
      { error: "Too many questions in a short time. Please wait a minute and try again." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send a JSON body with a question." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Ask one question between 2 and 600 characters." }, { status: 400 });
  }

  const index = ragIndexData as RagIndex;
  if (!index.generatedAt || !index.chunks.length) {
    return Response.json(
      { error: "The portfolio index has not been built yet. Run npm run ingest before chatting." },
      { status: 503 },
    );
  }

  try {
    // Loaded lazily so that a failure while loading the native embedding
    // runtime is caught below and reported, instead of crashing the function
    // with an empty 500 before this handler runs.
    const { answerPortfolioQuestion } = await import("@/lib/chat-service");
    const response = await answerPortfolioQuestion(parsed.data.question, index);
    return Response.json(response);
  } catch (error) {
    console.error("Portfolio chat failed", error);
    const unavailable = error instanceof Error && error.name === "ProviderUnavailableError";
    const body: { error: string; detail?: string } = {
      error: unavailable
        ? "The assistant is temporarily unavailable. Please try again shortly."
        : "The assistant could not answer right now. Please try again shortly.",
    };
    // Set CHAT_DEBUG=1 in the deployment environment to see the underlying cause.
    if (process.env.CHAT_DEBUG === "1") {
      body.detail = (error instanceof Error ? `${error.name}: ${error.message}` : String(error)).slice(0, 600);
    }
    return Response.json(body, { status: 503 });
  }
}
