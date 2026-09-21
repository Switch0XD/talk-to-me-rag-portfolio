import { readFile } from "node:fs/promises";
import path from "node:path";
import { answerPortfolioQuestion, REFUSAL } from "../src/lib/chat-service";
import type { RagIndex } from "../src/lib/types";
import { loadProjectEnv } from "./load-env";

type EvalCase = {
  question: string;
  expectedSource?: string;
  expectedTerms?: string[];
  expectRefusal?: boolean;
};

async function main() {
  const root = process.cwd();
  loadProjectEnv(root);
  const index = JSON.parse(await readFile(path.join(root, "src", "data", "rag-index.json"), "utf8")) as RagIndex;
  const cases = JSON.parse(await readFile(path.join(root, "evals", "rag-evals.json"), "utf8")) as EvalCase[];
  if (!index.generatedAt || !index.chunks.length) throw new Error("Build the index first with npm run ingest.");

  let passed = 0;
  for (const test of cases) {
    const response = await answerPortfolioQuestion(test.question, index);
    const answer = response.answer.toLowerCase();
    const refusalMatches = test.expectRefusal ? response.answer === REFUSAL : response.kind === "answer";
    const sourceMatches = test.expectedSource ? response.citations.some((citation) => citation.title === test.expectedSource) : true;
    const termsMatch = test.expectedTerms
      ? test.expectedTerms.some((term) => answer.includes(term.toLowerCase()))
      : true;
    const success = refusalMatches && sourceMatches && termsMatch;
    if (success) passed += 1;
    console.info(`${success ? "PASS" : "FAIL"} — ${test.question}`);
    if (!success) console.info(`  Received: ${response.answer}`);
  }

  console.info(`\n${passed}/${cases.length} evaluations passed.`);
  if (passed !== cases.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error("Evaluation failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
