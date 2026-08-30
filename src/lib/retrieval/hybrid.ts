// Combines two ranked lists (lexical, semantic) into one via Reciprocal Rank Fusion (RRF). Chosen
// over a weighted sum of raw scores because BM25 and cosine similarity live on incomparable
// scales (BM25 is unbounded and corpus-size-dependent; cosine is in [-1, 1]) — normalizing either
// onto the other's scale is an extra hidden assumption. RRF instead combines RANKS, which are
// already scale-free, and is the standard hybrid-search combiner for exactly this reason.
//
// score(doc) = sum over each ranking the doc appears in of 1 / (k + rank), rank is 1-based.
// A doc absent from a ranking contributes 0 for that ranking — it is not penalized further, since
// "never made this list" already caps its rank-based contribution at effectively last place.

export type RankedList = { id: string; score: number }[];

const DEFAULT_K = 60; // standard RRF constant (Cormack et al. 2009); flattens the impact of any
// single ranker's noisy tail while still rewarding a top rank strongly.

function toRankMap(list: RankedList): Map<string, number> {
  const sorted = [...list].sort((a, b) => b.score - a.score);
  const ranks = new Map<string, number>();
  sorted.forEach((item, i) => ranks.set(item.id, i + 1));
  return ranks;
}

export function reciprocalRankFusion(
  lists: RankedList[],
  k: number = DEFAULT_K,
): { id: string; score: number }[] {
  const combined = new Map<string, number>();
  for (const list of lists) {
    const ranks = toRankMap(list);
    for (const [id, rank] of ranks) {
      combined.set(id, (combined.get(id) ?? 0) + 1 / (k + rank));
    }
  }
  return [...combined.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}
