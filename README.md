# HireStella — “Talk to Me” RAG Portfolio

A mobile-first personal portfolio for Kuldeep Singh with a genuine, small-corpus RAG assistant. The chat assistant retrieves from the supplied CV, two project write-ups, and a short FAQ; it does not rely on a pasted CV or browser-side API key.

## Stack and design choices

- **App and hosting:** Next.js App Router, TypeScript, Tailwind CSS, and Vercel Hobby.
- **Generation:** Gemini `gemini-2.5-flash-lite`, retrying eligible 429/5xx requests with `gemini-2.5-flash`, then falling back to Groq `openai/gpt-oss-20b` for any remaining Gemini failure.
- **Embeddings:** Local open-source `onnx-community/all-MiniLM-L6-v2-ONNX` at 384 dimensions, using 4-bit ONNX weights. The model runs in the Node.js route handler; it is checked in under `src/data/local-models` and makes no embedding API request.
- **Retrieval:** a checked-in JSON vector index with in-memory cosine similarity. It is appropriate for this roughly 5–8-page corpus, avoids a paid database, and remains genuine embedding-based RAG.
- **Chunking:** heading-aware chunks of approximately 500 tokens with an 80-token overlap. The ingestion script is deliberately independent of the web build.

## Run locally

1. Use Node.js 20 or newer, then install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local`. Set `GEMINI_API_KEY` and `GROQ_API_KEY` for answer generation. Embeddings run locally and require neither a key nor a cloud account. Do not prefix secrets with `NEXT_PUBLIC_` or commit them.

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

`content/sources.json` lists a public-safe Markdown version of the CV and the two supplied project write-ups. Add future public-safe `.md`, `.txt`, `.pdf`, or `.docx` files to `content/source/`; they are discovered automatically on the next `npm run ingest`. The original supplied PDF is ignored because it contains a phone number. Ingestion also redacts phone-number patterns before calling the embedding API or writing the index.

The public profile and project-card copy live in `src/content/profile.ts`. The source material did not include a public HIMS link, so the page says that explicitly rather than fabricating one. The public page intentionally omits the phone number that appears in the CV.

## Quality checks

```bash
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run eval:rag
```

The eval command runs ten questions against the live RAG pipeline, including source selection, expected answer terms, the LangGraph refusal, and the required Google-employment refusal. It needs a built index and Gemini key.

## Deploy to Vercel

1. Push this repository to GitHub and import it into a personal Vercel Hobby project.
2. Add `GEMINI_API_KEY` and `GROQ_API_KEY` to Vercel for both Preview and Production. No Vertex variables or service-account JSON are needed. Optionally add the answer-model and relevance-threshold variables shown in `.env.example`.
3. Run `npm run ingest` locally and commit the generated `src/data/rag-index.json` before deploying. Vercel serves the prebuilt index; it does not ingest private documents during a production build.
4. Deploy, then test the public URL in an incognito window, including a supported project question, `Have you worked at Google?`, and a question unrelated to the portfolio.

## Known limitations

- The assistant is intentionally single-turn and does not retain conversation history.
- Citations identify the source document and section; they do not link to raw source files, because the index can be built from public-safe documents without publishing every original file.
- The local embedding model uses a calibrated cosine relevance threshold of `0.32`. Tune it with `npm run eval:rag` whenever the corpus grows; the assistant is designed to refuse rather than stretch weak evidence into an answer.
- Groq is used only for answer generation. The checked-in local ONNX model adds roughly 55 MB to the repository and server function, trading deployment size and cold-start time for zero embedding API cost and no embedding rate limits.
