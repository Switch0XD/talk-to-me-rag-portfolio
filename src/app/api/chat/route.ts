import { z } from "zod";
import { answerPortfolioQuestion } from "@/lib/chat-service";
import { ProviderUnavailableError } from "@/lib/gemini";
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
    const response = await answerPortfolioQuestion(parsed.data.question, index);
    return Response.json(response);
  } catch (error) {
    console.error("Portfolio chat failed", error);
    const message =
      error instanceof ProviderUnavailableError
        ? "The assistant is temporarily unavailable. Please try again shortly."
        : "The assistant could not answer right now. Please try again shortly.";
    return Response.json({ error: message }, { status: 503 });
  }
}
