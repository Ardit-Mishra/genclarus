// Builds the committed retrieval index (corpus/retrieval-index.json) from the corpus's own
// manifest — reproducible and idempotent: re-running over an unchanged corpus with a reachable
// embedder produces the same document text and (modulo the embedding model's own determinism) the
// same vectors. Local-only step: run this on a machine with Ollama running (`ollama serve`) and
// `nomic-embed-text` pulled. If Ollama is unreachable, the index is still written — every doc gets
// `embedding: null` and the index honestly reports `embeddingModel: null`, which makes every
// consumer (search.ts, the retrieval eval) fall back to lexical-only rather than inventing vectors.
//
// Run: npm run retrieval:build-index

import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { buildDocText } from "../../src/lib/retrieval/doc-text";
import { embedText, EMBEDDING_MODEL } from "../../src/lib/retrieval/ollama-embeddings";
import type { CorpusRecord, CorpusManifest } from "../../src/lib/corpus/types";
import type { IndexedDoc, RetrievalIndexFile } from "../../src/lib/retrieval/index-store";

const ROOT = resolve(process.cwd(), "corpus");
const OUT_PATH = resolve(ROOT, "retrieval-index.json");
const SCHEMA_VERSION = "1.0.0";
// Gentle on the local model — sequential calls, small pause, matches the throttle style already
// used for NIM in scripts/corpus/generate.ts (courtesy, not a hard rate limit Ollama enforces).
const EMBED_THROTTLE_MS = 30;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf-8")) as T;
}

async function main() {
  const manifest = await readJson<CorpusManifest>(join(ROOT, "manifest.json"));
  console.log(`[retrieval] building index for ${manifest.records.length} corpus records…`);

  const docs: IndexedDoc[] = [];
  let embedFailures = 0;
  let firstFailureReason: string | null = null;

  for (const entry of manifest.records) {
    const record = await readJson<CorpusRecord>(join(ROOT, entry.kind, `${entry.id}.json`));
    const text = buildDocText(record);

    let embedding: number[] | null = null;
    const embedded = await embedText(text);
    if ("embedding" in embedded && embedded.embedding) {
      embedding = embedded.embedding;
    } else {
      embedFailures++;
      firstFailureReason ??= "reason" in embedded ? embedded.reason : "unknown";
    }
    docs.push({ id: entry.id, kind: entry.kind, text, embedding });
    await sleep(EMBED_THROTTLE_MS);
  }

  const allEmbedded = embedFailures === 0 && docs.length > 0;
  const file: RetrievalIndexFile = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    embeddingModel: allEmbedded ? EMBEDDING_MODEL : null,
    docCount: docs.length,
    docs,
  };

  await writeFile(OUT_PATH, JSON.stringify(file) + "\n");

  if (embedFailures > 0) {
    console.warn(
      `[retrieval] ${embedFailures}/${docs.length} documents did NOT embed (first reason: ${firstFailureReason}). ` +
        `embeddingModel written as null — search will run lexical-only (BM25) until this is re-run ` +
        `with Ollama reachable and "${EMBEDDING_MODEL}" pulled.`,
    );
  } else {
    console.log(`[retrieval] wrote ${OUT_PATH} — ${docs.length} docs, all embedded with ${EMBEDDING_MODEL}.`);
  }
}

main().catch((err) => {
  console.error("[retrieval] index build failed:", err);
  process.exitCode = 1;
});
