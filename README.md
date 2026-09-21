# HireStella — “Talk to Me” RAG Portfolio

A mobile-first personal portfolio for Kuldeep Singh with a small-corpus RAG assistant. Visitors click **Talk to Kuldeep** (bottom-right) and ask about his projects, experience or education. The assistant retrieves from his CV, two project write-ups and a short FAQ, and declines rather than invents when the material does not support an answer.

- **Live site:** https://talk-to-me-rag-portfolio.vercel.app/
- **Repository:** https://github.com/Switch0XD/talk-to-me-rag-portfolio

## How it works

1. `npm run ingest` reads the source documents, splits them into heading-aware chunks, embeds each chunk locally and writes `src/data/rag-index.json`.
2. A question arrives at `POST /api/chat` (a server route; no key ever reaches the browser). The route validates it, applies a per-IP rate limit and embeds the question.
3. The five most similar chunks are retrieved from the index.
4. If nothing is relevant enough, the route refuses without calling a model. Otherwise the model receives only those chunks and is instructed to answer from them or say the material does not cover it.
5. The widget shows the answer (or a refusal, or an error) as a chat bubble.

## Stack and design choices

- **App and hosting:** Next.js App Router, TypeScript, Tailwind CSS, Vercel Hobby.
- **Embeddings:** local open-source `onnx-community/all-MiniLM-L6-v2-ONNX` (384 dimensions, 4-bit weights) via transformers.js. The model is checked in under `src/data/local-models` and runs in the Node.js route, so embeddings cost nothing and have no rate limit.
- **Vector store:** a checked-in JSON file with in-memory cosine similarity. For a corpus of about 64 chunks this avoids a database, a paid service and a network hop, and is still genuine embedding-based retrieval. A pgvector table would be the next step if the corpus grew into the thousands of chunks.
- **Chunking:** heading-aware chunks of about 500 tokens with an 80-token overlap.
- **Retrieval score:** cosine similarity, plus a small lexical boost for query terms found in a chunk, plus a larger boost when a distinctive name (an employer or project that appears in at most two section headings) matches a heading. FAQ entries that say “not documented” are penalised unless the question is about what their heading names. Chunks scoring below `0.32` are treated as irrelevant.
- **Generation:** Gemini `gemini-3.5-flash-lite`, then `gemini-3.6-flash` on 429, 404 or 5xx, then Groq `openai/gpt-oss-20b`, then OpenRouter free models tried in order (`OPENROUTER_MODEL`, a comma-separated list; default `nvidia/nemotron-3-super-120b-a12b:free`, then `google/gemma-4-31b-it:free`). Each provider is tried only if the previous one failed, and a provider without a key is skipped. A visitor sees an error only if every configured provider fails.

## Refusal behaviour

There is intentionally no “general knowledge” mode. Every question is answered from retrieved context or declined:

- **Unrelated question** (for example “What is the weather in Paris?”): the best chunk scores under the threshold, and the route returns a fixed refusal without calling a model.
- **Something the materials never mention** (for example “Have you worked at Google?” or “Have you used Kubernetes?”): the model is told to say the materials do not document it, never to answer “No” (absence from the materials is not proof), and to state the closest documented facts, such as his real employers. These appear as a decline-style bubble.
- **Something the materials explicitly mark as undocumented** (the FAQ entries for Google and LangGraph): handled the same way, but detected before generation so the outcome does not depend on the model.

An earlier version answered non-portfolio questions from general knowledge, chosen by a keyword check. That let questions like “Have you used Kubernetes?” bypass grounding, so it was removed.

## Run locally

1. Use Node.js 20 or newer, then install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and set `GEMINI_API_KEY`, `GROQ_API_KEY` and, optionally, `OPENROUTER_API_KEY` (free key, no card, from https://openrouter.ai/keys). Embeddings need no key. Never prefix secrets with `NEXT_PUBLIC_` or commit them.

3. Rebuild the index from the source documents:

   ```bash
   npm run ingest
   ```

4. Run the site:

   ```bash
   npm run dev
   ```

The chat route returns a clear setup message until the index is built.

## Portfolio content

`content/sources.json` lists the public-safe Markdown CV and the two project write-ups. Add any further public-safe `.md`, `.txt`, `.pdf` or `.docx` files to `content/source/`; the next `npm run ingest` picks them up. The original PDF résumé is git-ignored because it contains a phone number, and ingestion also redacts phone-number patterns before embedding or writing the index.

The profile and project cards live in `src/content/profile.ts`. The source material has no public HIMS link, so the page says so instead of inventing one.

## Quality checks

```bash
npm run typecheck
npm run lint
npm test            # unit tests (Vitest)
npm run test:e2e    # widget tests in desktop and 375px mobile Chrome (Playwright)
npm run eval:rag    # live evaluation, see below
```

`npm run eval:rag` runs 15 questions through the real retrieval and generation pipeline. It checks that supported questions cite the expected source and contain expected terms, and that unsupported ones (LangGraph, Google, Microsoft, Kubernetes, and an unrelated weather question) are declined. It needs a built index and at least one working provider key. Because it calls live models, it can stop early if a free tier is rate-limited; wait and rerun.

## Deploy to Vercel

1. Push the repository to GitHub and import it into a Vercel Hobby project.
2. Add `GEMINI_API_KEY`, `GROQ_API_KEY` and `OPENROUTER_API_KEY` for Preview and Production. Optionally add the model and threshold variables from `.env.example`. Environment variables only apply to deployments made after they are added, so redeploy after changing them.
3. Run `npm run ingest` locally and commit `src/data/rag-index.json`. Vercel serves the prebuilt index and does not ingest during the build.
4. After deploying, test the public URL in an incognito window: a supported question, `Have you worked at Google?`, and an unrelated question. Try it right after a cold start, because the local embedding model loads on the first request.

### Troubleshooting a failing chat

- A provider outage shows “The assistant is temporarily unavailable”. Any other failure shows “The assistant could not answer right now”.
- To see the underlying error, set `CHAT_DEBUG=1` on the deployment and redeploy. Failed `/api/chat` responses then include a `detail` field. Remove the variable afterwards, since it exposes internal error text.
- The same error is written to the function logs under `Portfolio chat failed`.

## Known limitations and unfinished work

- **No streaming.** An answer appears once the whole response has arrived.
- **No citations in the UI.** The API still returns `citations` (source and section) but the widget hides them to keep the bubbles clean. Showing them again is a small change in `src/components/chat-widget.tsx`.
- **Single-turn answers.** The widget shows a chat thread, but each question is sent on its own and the assistant does not see earlier messages, so a follow-up such as “tell me more” does not work. Fixing it means sending recent messages and rewriting the follow-up into a standalone question before retrieval.
- **HIMS has no public link.** The source material did not include one.
- **Rate limiting is best-effort.** `/api/chat` allows 10 requests per minute per IP, tracked in memory per serverless instance (`src/lib/rate-limit.ts`). It curbs casual abuse of the free quotas but is not a guarantee; a shared store such as Upstash Redis would make it one.
- **Retrieval is hand-tuned.** The lexical boost, the distinctive-heading bonus, the “not documented” penalty and the `0.32` threshold were tuned by hand against this small corpus and the 15-question eval. Re-run the eval and re-tune when the corpus changes. Wording of questions the eval does not cover may still be answered less well than it deserves.
- **Chunks may be longer than the embedding model reads.** Chunks target about 500 tokens, but MiniLM-L6 is designed for shorter inputs (about 256 tokens), so the tail of a long chunk may contribute little to its embedding. I have not measured the effect. Smaller chunks would be the first thing to try.
- **Voice is inconsistent.** Answers drawn from the résumé can come out in the first person and answers drawn from the FAQ in the third.
- **Corpus is small.** About 2,900 words (CV, two write-ups, FAQ), at the low end of the suggested range.
- **Deployment size.** The checked-in ONNX model adds roughly 55 MB to the repository and to the server function, trading cold-start time and size for zero embedding cost.
- **Free-tier fallbacks change.** Gemini model names get retired, and OpenRouter’s free model list and daily cap move often. Check `GEMINI_*_MODEL` and `OPENROUTER_MODEL` before relying on them.
