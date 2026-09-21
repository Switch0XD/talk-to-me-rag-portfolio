import { existsSync } from "node:fs";
import path from "node:path";
import { env, pipeline } from "@huggingface/transformers";

export const LOCAL_EMBEDDING_MODEL = "onnx-community/all-MiniLM-L6-v2-ONNX";
const MODEL_DTYPE = "q4";
const localModelPath = path.join(process.cwd(), "src", "data", "local-models");
const modelConfigPath = path.join(localModelPath, LOCAL_EMBEDDING_MODEL, "config.json");

type EmbeddingOutput = { dims: number[]; data: ArrayLike<number> };
type FeatureExtractor = (texts: string[], options: { pooling: "mean"; normalize: boolean }) => Promise<EmbeddingOutput>;
const createFeatureExtractor = pipeline as unknown as (
  task: "feature-extraction",
  model: string,
  options: { dtype: string },
) => Promise<FeatureExtractor>;

let extractorPromise: Promise<FeatureExtractor> | undefined;

function extractor(): Promise<FeatureExtractor> {
  if (!existsSync(modelConfigPath)) {
    throw new Error("The local embedding model is missing. Restore src/data/local-models before deploying.");
  }

  env.allowLocalModels = true;
  env.allowRemoteModels = false;
  env.localModelPath = localModelPath;

  extractorPromise ??= createFeatureExtractor("feature-extraction", LOCAL_EMBEDDING_MODEL, { dtype: MODEL_DTYPE });
  return extractorPromise;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];

  const output = await (await extractor())(texts, { pooling: "mean", normalize: true });
  const [vectorCount, dimensions] = output.dims;
  if (vectorCount !== texts.length || !dimensions || output.data.length !== vectorCount * dimensions) {
    throw new Error("The local embedding model returned incomplete vectors.");
  }

  const values = Array.from(output.data);
  return texts.map((_, index) => values.slice(index * dimensions, (index + 1) * dimensions));
}

export async function embedText(text: string): Promise<number[]> {
  const [embedding] = await embedTexts([text]);
  if (!embedding?.length) throw new Error("The local embedding model returned an empty vector.");
  return embedding;
}

export function activeEmbeddingModel() {
  return `${LOCAL_EMBEDDING_MODEL}:${MODEL_DTYPE}`;
}
