// Loads the committed retrieval index (corpus/retrieval-index.json) — the reproducible artifact
// `npm run retrieval:build-index` produces (see scripts/retrieval/build-index.ts). Mirrors the
// FileCorpusStore pattern in src/lib/corpus/file-store.ts: a plain committed file, read once and
// cached in memory for the life of the process, with RETRIEVAL_INDEX_PATH as a test-only override.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildBm25Index, type Bm25Index } from "./bm25";

export type IndexedDoc = {
  id: string;
  kind: "gene" | "variant";
  text: string;
  // null when the doc's embedding could not be generated at build time (Ollama unreachable) —
  // that doc simply never contributes to the semantic ranking, never a fabricated vector.
  embedding: number[] | null;
};

export type RetrievalIndexFile = {
  schemaVersion: string;
  generatedAt: string;
  embeddingModel: string | null;
  docCount: number;
  docs: IndexedDoc[];
};

export type LoadedIndex = {
  file: RetrievalIndexFile;
  bm25: Bm25Index;
  // true only if EVERY doc carries an embedding — a partially-embedded index still degrades to
  // lexical-only for honesty (a semantic ranking over a subset of the corpus would silently bias
  // results toward whichever half happened to embed).
  semanticAvailable: boolean;
};

function indexPath(): string {
  return process.env.RETRIEVAL_INDEX_PATH || join(process.cwd(), "corpus", "retrieval-index.json");
}

let cached: Promise<LoadedIndex> | null = null;

async function load(): Promise<LoadedIndex> {
  const raw = await readFile(indexPath(), "utf-8");
  const file = JSON.parse(raw) as RetrievalIndexFile;
  const bm25 = buildBm25Index(file.docs.map((d) => ({ id: d.id, text: d.text })));
  const semanticAvailable = file.docs.length > 0 && file.docs.every((d) => d.embedding !== null);
  return { file, bm25, semanticAvailable };
}

// Cached per process; test suites that swap RETRIEVAL_INDEX_PATH should call clearIndexCache().
export function getRetrievalIndex(): Promise<LoadedIndex> {
  if (!cached) cached = load();
  return cached;
}

export function clearIndexCache(): void {
  cached = null;
}
