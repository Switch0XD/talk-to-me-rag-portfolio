export type SourceDocument = {
  id: string;
  path: string;
  title: string;
};

export type RagChunk = {
  id: string;
  sourceId: string;
  sourceTitle: string;
  heading: string;
  text: string;
  embedding: number[];
};

export type RagIndex = {
  version: 1;
  generatedAt: string | null;
  embeddingModel: string;
  dimensions: number;
  chunks: RagChunk[];
};

export type Citation = {
  sourceId: string;
  title: string;
  heading: string;
};

export type ChatResponse = {
  kind: "answer" | "refusal";
  answer: string;
  citations: Citation[];
  model?: string;
};
