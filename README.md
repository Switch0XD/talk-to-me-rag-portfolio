# HireStella — “Talk to Me” RAG Portfolio

A mobile-first personal portfolio for Kuldeep Singh with a genuine, small-corpus RAG assistant. The chat assistant retrieves from the supplied CV, two project write-ups, and a short FAQ; it does not rely on a pasted CV or browser-side API key.

## Stack and design choices

- **App and hosting:** Next.js App Router, TypeScript, Tailwind CSS, and Vercel Hobby.
- **Generation:** Gemini `gemini-2.5-flash-lite`, retrying eligible 429/5xx requests with `gemini-2.5-flash`, then falling back to Groq `openai/gpt-oss-20b` for any remaining Gemini failure.
- **Embeddings:** Vertex AI `text-embedding-005` at 768 dimensions. This English text model accepts five document inputs per request, keeping the small-corpus ingestion practical under shared Vertex quota.
- **Retrieval:** a checked-in JSON vector index with in-memory cosine similarity. It is appropriate for this roughly 5–8-page corpus, avoids a paid database, and remains genuine embedding-based RAG.
- **Chunking:** heading-aware chunks of approximately 500 tokens with an 80-token overlap. The ingestion script is deliberately independent of the web build.

## Run locally

1. Use Node.js 20 or newer, then install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local`. Set `GEMINI_API_KEY`, `GROQ_API_KEY`, `VERTEX_AI_PROJECT`, and `VERTEX_AI_LOCATION`. For local ingestion, either authenticate with `gcloud auth application-default login` or set `VERTEX_AI_CREDENTIALS_FILE` to the ignored service-account JSON filename. For Vercel, set `VERTEX_AI_CREDENTIALS` to one-line service-account JSON. Do not prefix secrets with `NEXT_PUBLIC_` or commit them.

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
2. Add `GEMINI_API_KEY`, `GROQ_API_KEY`, `VERTEX_AI_PROJECT`, `VERTEX_AI_LOCATION`, and one-line `VERTEX_AI_CREDENTIALS` to Vercel for both Preview and Production. Optionally add the model and relevance-threshold variables shown in `.env.example`.
3. Run `npm run ingest` locally and commit the generated `src/data/rag-index.json` before deploying. Vercel serves the prebuilt index; it does not ingest private documents during a production build.
4. Deploy, then test the public URL in an incognito window, including a supported project question, `Have you worked at Google?`, and a question unrelated to the portfolio.

## Known limitations

- The assistant is intentionally single-turn and does not retain conversation history.
- Citations identify the source document and section; they do not link to raw source files, because the index can be built from public-safe documents without publishing every original file.
- Semantic thresholds should be tuned with `npm run eval:rag` whenever the corpus grows. The assistant is designed to refuse rather than stretch weak evidence into an answer.
- Groq is used only for answer generation. Embeddings now use Vertex AI and require a billing-enabled Google Cloud project, the Vertex AI API, and service-account or application-default credentials.
