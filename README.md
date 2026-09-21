# HireStella — “Talk to Me” RAG Portfolio

A mobile-first personal portfolio for Kuldeep Singh with a genuine, small-corpus RAG assistant. The chat assistant retrieves from the supplied CV, two project write-ups, and a short FAQ; it does not rely on a pasted CV or browser-side API key. Anything the retrieved material does not support gets a refusal, not a guess.

## Stack and design choices

- **App and hosting:** Next.js App Router, TypeScript, Tailwind CSS, and Vercel Hobby.
- **Generation:** Gemini `gemini-3.5-flash-lite`, retrying eligible 429/5xx requests with `gemini-3.6-flash`, then falling back to Groq `openai/gpt-oss-20b`, then to an OpenRouter free model (`OPENROUTER_MODEL`, default `openai/gpt-oss-20b:free`). Each provider is tried only if the previous one failed, and providers without a key are skipped.
- **Embeddings:** Local open-source `onnx-community/all-MiniLM-L6-v2-ONNX` at 384 dimensions, using 4-bit ONNX weights. The model runs in the Node.js route handler; it is checked in under `src/data/local-models` and makes no embedding API request.
- **Retrieval:** a checked-in JSON vector index with in-memory cosine similarity. It is appropriate for this roughly 5–8-page corpus, avoids a paid database, and remains genuine embedding-based RAG.
- **Chunking:** heading-aware chunks of approximately 500 tokens with an 80-token overlap. The ingestion script is deliberately independent of the web build.

## Run locally

1. Use Node.js 20 or newer, then install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local`. Set `GEMINI_API_KEY`, `GROQ_API_KEY` and (optionally) `OPENROUTER_API_KEY` for answer generation. Embeddings run locally and require neither a key nor a cloud account. Do not prefix secrets with `NEXT_PUBLIC_` or commit them.

3. Rebuild the index from the source documents:

   ```bash
   npm run ingest
   ```

4. Run the site:

   ```bash
   npm run dev
   ```

The chat route returns a clear setup message until the index is built. For answer generation, it tries both configured Gemini models and then Groq; it shows a clear retryable state only if every configured provider is unavailable.

## Portfolio content

`content/sources.json` lists a public-safe Markdown version of the CV and the two supplied project write-ups. Add future public-safe `.md`, `.txt`, `.pdf`, or `.docx` files to `content/source/`; they are discovered automatically on the next `npm run ingest`. The original supplied PDF is ignored because it contains a phone number. Ingestion also redacts phone-number patterns before embedding or writing the index.

The public profile and project-card copy live in `src/content/profile.ts`. The source material did not include a public HIMS link, so the page says that explicitly rather than fabricating one. The public page intentionally omits the phone number that appears in the CV.

## Quality checks

```bash
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run eval:rag
```

The eval command runs 15 questions against the live RAG pipeline: source selection, expected answer terms, and refusals for LangGraph, Google and Microsoft employment, Kubernetes, and an unrelated weather question. It needs a built index and a Gemini or Groq key.

## Deploy to Vercel

1. Push this repository to GitHub and import it into a personal Vercel Hobby project.
2. Add `GEMINI_API_KEY`, `GROQ_API_KEY` and `OPENROUTER_API_KEY` to Vercel for both Preview and Production. No Vertex variables or service-account JSON are needed. Optionally add the answer-model and relevance-threshold variables shown in `.env.example`.
3. Run `npm run ingest` locally and commit the generated `src/data/rag-index.json` before deploying. Vercel serves the prebuilt index; it does not ingest private documents during a production build.
4. Deploy, then test the public URL in an incognito window, including a supported project question, `Have you worked at Google?`, and a question unrelated to the portfolio (both should refuse). Confirm the first request after a cold start still answers, since the local embedding model loads on demand.

## Refusal behaviour

Every question goes through retrieval. If the best chunk scores below the relevance threshold, or the retrieved chunk explicitly says the fact is undocumented (as the FAQ does for Google and LangGraph), the route refuses **without calling the model**. Otherwise the model receives only the retrieved chunks and is instructed to refuse when they do not directly support an answer. There is intentionally no "general knowledge" mode: an earlier version had one, chosen by a keyword check, and questions like "Have you used Kubernetes?" could slip past grounding.

## Known limitations and unfinished work

- **No streaming.** Answers appear once the full response arrives.
- **No citations in the UI.** The API still returns `citations` (source and section), but the widget does not show them. I hid them to keep the widget compact; restoring them is a small change in `chat-widget.tsx`.
- **HIMS has no public link.** The source material did not include one, and the page says so rather than inventing a URL.
- **Single-turn answers.** The widget shows a chat-style thread, but each question is sent on its own; the assistant does not see earlier messages, so follow-ups like "tell me more" do not work.
- **Rate limiting is best-effort.** `/api/chat` allows 10 requests per minute per IP, tracked in memory per serverless instance (`src/lib/rate-limit.ts`). It protects the free LLM quota from casual abuse but is not a guarantee. A shared store such as Upstash Redis would fix that.
- **The refusal heuristics are lexical.** The lexical boost, the "explicitly undocumented" check and the 0.32 threshold were tuned by hand against a small corpus and the eval set. Re-run `npm run eval:rag` and re-tune whenever the corpus grows.
- **Local embedding model size.** The checked-in ONNX model adds roughly 55 MB to the repository and server function, trading deployment size and cold-start time for zero embedding cost and no embedding rate limits.
- **Corpus size.** The corpus is about 2,900 words (CV, two project write-ups, FAQ), at the small end of the suggested range.
- **Groq and OpenRouter are used only for answer generation**, as fallbacks when the provider before them fails. OpenRouter's free model list and daily cap change, so check `OPENROUTER_MODEL` before relying on it.
