// Hybrid retrieval over the corpus — the single entry point both `/api/search` and the retrieval
// eval (scripts/validation/retrieval.test.ts) call, so the measured behavior IS the served
// behavior. Always computes BM25 (deterministic, always available). Additionally embeds the query
// via Ollama and computes cosine similarity against the committed per-doc embeddings when: the
// index was built with every doc embedded, AND the live embedding call succeeds. Otherwise this
// degrades to lexical-only and says so explicitly — never silently, and never by inventing a
// semantic score.

import { bm25Score } from "./bm25";
import { cosineSimilarity, embedText } from "./ollama-embeddings";
import { reciprocalRankFusion, type RankedList } from "./hybrid";
import { getRetrievalIndex, type IndexedDoc } from "./index-store";

export type SearchHit = { id: string; kind: IndexedDoc["kind"]; score: number };

export type SearchResult = {
  hits: SearchHit[];
  semanticAvailable: boolean;
  semanticReason: string | null;
};

export async function search(query: string, k = 5): Promise<SearchResult> {
  const trimmed = query.trim();
  const { file, bm25, semanticAvailable } = await getRetrievalIndex();
  const docById = new Map(file.docs.map((d) => [d.id, d] as const));

  const lexicalScores = trimmed ? bm25Score(bm25, trimmed) : new Map<string, number>();
  const lexicalList: RankedList = [...lexicalScores].map(([id, score]) => ({ id, score }));

  if (!trimmed) return { hits: [], semanticAvailable, semanticReason: null };

  let semanticReason: string | null = semanticAvailable ? null : "index_not_fully_embedded";
  let semanticList: RankedList = [];

  if (semanticAvailable) {
    const embedded = await embedText(trimmed);
    if ("reason" in embedded) {
      semanticReason = embedded.reason;
    } else {
      semanticList = file.docs
        .filter((d) => d.embedding !== null)
        .map((d) => ({ id: d.id, score: cosineSimilarity(embedded.embedding, d.embedding!) }))
        // A near-zero cosine similarity is noise, not a match — keeping every doc in the ranked
        // list would let RRF hand it a nonzero rank-based score purely for existing.
        .filter((d) => d.score > 0.15);
    }
  }

  const usedSemantic = semanticList.length > 0;
  const fused = usedSemantic
    ? reciprocalRankFusion([lexicalList, semanticList])
    : reciprocalRankFusion([lexicalList]);

  const hits: SearchHit[] = fused
    .slice(0, k)
    .map(({ id, score }) => {
      const doc = docById.get(id);
      return doc ? { id: doc.id, kind: doc.kind, score } : null;
    })
    .filter((h): h is SearchHit => h !== null);

  return { hits, semanticAvailable: usedSemantic, semanticReason: usedSemantic ? null : semanticReason };
}
