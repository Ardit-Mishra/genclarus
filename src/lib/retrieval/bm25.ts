// Okapi BM25 over the corpus's document text. Pure and deterministic — no network, no model — so
// it is always available as the lexical half of hybrid retrieval, and as the sole ranking signal
// when the semantic (embedding) side is unavailable (see search.ts).
//
// Standard BM25 with the "+1" IDF variant (Robertson/Sparck-Jones as popularized by Lucene/ES),
// which keeps IDF non-negative even for terms that appear in more than half the corpus — a real
// risk here since the corpus is only 173 documents.

import { tokenize } from "./tokenize";

export type Bm25Doc = { id: string; text: string };

export type Bm25Index = {
  k1: number;
  b: number;
  avgDocLen: number;
  docCount: number;
  // Per-document token counts, keyed by doc id.
  docTermFreq: Map<string, Map<string, number>>;
  docLen: Map<string, number>;
  // Number of documents containing each term at least once.
  docFreq: Map<string, number>;
};

const DEFAULT_K1 = 1.5;
const DEFAULT_B = 0.75;

export function buildBm25Index(docs: Bm25Doc[], k1 = DEFAULT_K1, b = DEFAULT_B): Bm25Index {
  const docTermFreq = new Map<string, Map<string, number>>();
  const docLen = new Map<string, number>();
  const docFreq = new Map<string, number>();

  for (const doc of docs) {
    const tokens = tokenize(doc.text);
    docLen.set(doc.id, tokens.length);
    const freq = new Map<string, number>();
    for (const tok of tokens) freq.set(tok, (freq.get(tok) ?? 0) + 1);
    docTermFreq.set(doc.id, freq);
    for (const term of freq.keys()) docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
  }

  const totalLen = [...docLen.values()].reduce((a, n) => a + n, 0);
  const avgDocLen = docs.length ? totalLen / docs.length : 0;

  return { k1, b, avgDocLen, docCount: docs.length, docTermFreq, docLen, docFreq };
}

function idf(index: Bm25Index, term: string): number {
  const n = index.docFreq.get(term) ?? 0;
  return Math.log(1 + (index.docCount - n + 0.5) / (n + 0.5));
}

// Scores every document against a query, returning only documents with a nonzero score (a query
// term that never appears in the corpus contributes nothing, and a doc that matches none of the
// query terms is simply absent from the result rather than scored 0 among thousands).
export function bm25Score(index: Bm25Index, query: string): Map<string, number> {
  const queryTerms = tokenize(query);
  const scores = new Map<string, number>();
  if (!queryTerms.length || !index.docCount) return scores;

  for (const [docId, termFreq] of index.docTermFreq) {
    const len = index.docLen.get(docId) ?? 0;
    let score = 0;
    for (const term of queryTerms) {
      const f = termFreq.get(term);
      if (!f) continue;
      const numerator = f * (index.k1 + 1);
      const denominator = f + index.k1 * (1 - index.b + (index.b * len) / (index.avgDocLen || 1));
      score += idf(index, term) * (numerator / denominator);
    }
    if (score > 0) scores.set(docId, score);
  }
  return scores;
}
