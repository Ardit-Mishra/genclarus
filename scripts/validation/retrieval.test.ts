// Live retrieval-quality measurement (npm run measure:retrieval).
//
// Deliberately separate from measure:grounding. Grounding asks "given the right record, does the
// AI narrative stay faithful to it?" — this asks the prior question: "does hybrid search find the
// right record at all?" Conflating the two into one number is exactly what most portfolios do; this
// keeps them apart on purpose.
//
// Calls the REAL `search()` (src/lib/retrieval/search.ts) against the REAL committed index
// (corpus/retrieval-index.json) over a small hand-written golden set (retrieval-golden.ts). If the
// local Ollama embedder is unreachable, `search()` itself degrades to lexical-only and says so
// (`semanticAvailable`/`semanticReason`) — this eval reports that fact rather than masking it, and
// still produces a real BM25-only measurement rather than skipping.
//
// It writes docs/validation/retrieval.{json,md} (gitignored). Like measure:grounding, this is a
// MEASUREMENT, not a pass/fail gate on quality — the numbers are reported honestly even if
// unflattering. The single assertion is a harness smoke check: a report was produced for every
// golden query.

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { search } from "../../src/lib/retrieval/search";
import { goldenQueries, type GoldenQuery } from "./retrieval-golden";

const K = 10; // generous enough to distinguish "wrong ranking" from "not retrieved at all"

type QueryMeasurement = {
  query: string;
  relevantIds: string[];
  why: string;
  hitIds: string[];
  semanticAvailable: boolean;
  semanticReason: string | null;
  // 1-based rank of the first relevant id among hitIds, or null if none of hitIds is relevant.
  rankOfFirstRelevant: number | null;
  reciprocalRank: number;
  hit: boolean; // recall@K for this single query
};

async function measureQuery(golden: GoldenQuery): Promise<QueryMeasurement> {
  const result = await search(golden.query, K);
  const hitIds = result.hits.map((h) => h.id);
  const relevantSet = new Set(golden.relevantIds);

  let rankOfFirstRelevant: number | null = null;
  for (let i = 0; i < hitIds.length; i++) {
    if (relevantSet.has(hitIds[i])) {
      rankOfFirstRelevant = i + 1;
      break;
    }
  }

  return {
    query: golden.query,
    relevantIds: golden.relevantIds,
    why: golden.why,
    hitIds,
    semanticAvailable: result.semanticAvailable,
    semanticReason: result.semanticReason,
    rankOfFirstRelevant,
    reciprocalRank: rankOfFirstRelevant ? 1 / rankOfFirstRelevant : 0,
    hit: rankOfFirstRelevant !== null,
  };
}

function aggregate(results: QueryMeasurement[]) {
  const total = results.length;
  const hits = results.filter((r) => r.hit).length;
  const mrr = results.reduce((sum, r) => sum + r.reciprocalRank, 0) / (total || 1);
  const semanticUsedCount = results.filter((r) => r.semanticAvailable).length;
  return {
    total,
    recallAtK: total ? hits / total : 0,
    k: K,
    mrr,
    retrievalFailureRate: total ? (total - hits) / total : 0,
    semanticUsedCount,
    semanticUsedRate: total ? semanticUsedCount / total : 0,
  };
}

function markdown(results: QueryMeasurement[], summary: ReturnType<typeof aggregate>): string {
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const lines: string[] = [
    "# Genclarus retrieval measurement",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "Measures hybrid retrieval quality (BM25 + Ollama `nomic-embed-text` semantic, fused via " +
      "Reciprocal Rank Fusion) over a hand-written golden query set, independent of generation " +
      "quality (see measure:grounding for that).",
    "",
    "## Summary",
    "",
    `- Golden queries: **${summary.total}**`,
    `- Recall@${summary.k}: **${summary.recallAtK.toFixed(3)}** (${pct(summary.recallAtK)})`,
    `- MRR: **${summary.mrr.toFixed(3)}**`,
    `- Retrieval-failure rate (relevant record absent from top ${summary.k}): **${pct(summary.retrievalFailureRate)}**`,
    `- Semantic (embedding) ranking actually used: **${summary.semanticUsedCount}/${summary.total}** queries (${pct(summary.semanticUsedRate)})` +
      (summary.semanticUsedCount < summary.total
        ? " — remaining queries fell back to lexical-only (BM25); see per-query `semanticReason` below."
        : ""),
    "",
    "## Per-query",
    "",
    "| Query | Expected | Rank found | RR | Semantic used | Top hits |",
    "| --- | --- | ---: | ---: | --- | --- |",
    ...results.map((r) => {
      const rank = r.rankOfFirstRelevant ?? `not in top ${K}`;
      const semantic = r.semanticAvailable ? "yes" : `no (${r.semanticReason ?? "n/a"})`;
      return `| ${r.query} | ${r.relevantIds.join(", ")} | ${rank} | ${r.reciprocalRank.toFixed(3)} | ${semantic} | ${r.hitIds.slice(0, 5).join(", ")} |`;
    }),
    "",
    "## Misses",
    "",
    ...(results.filter((r) => !r.hit).length
      ? results
          .filter((r) => !r.hit)
          .map((r) => `- **"${r.query}"** (expected ${r.relevantIds.join(" or ")}, ${r.why}) — got: ${r.hitIds.join(", ") || "(no hits)"}`)
      : ["None."]),
  ];
  return lines.join("\n");
}

export async function runRetrievalEval(): Promise<QueryMeasurement[]> {
  const results: QueryMeasurement[] = [];
  // Sequential: each query issues a live embedding call to the local Ollama server, and running
  // them concurrently would just add contention noise to a run this small.
  for (const golden of goldenQueries) {
    results.push(await measureQuery(golden));
  }
  const summary = aggregate(results);
  const out = resolve(process.cwd(), "docs", "validation");
  await mkdir(out, { recursive: true });
  await writeFile(
    resolve(out, "retrieval.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), summary, results }, null, 2) + "\n",
  );
  await writeFile(resolve(out, "retrieval.md"), markdown(results, summary));
  return results;
}

describe("live retrieval measurement (golden query set)", () => {
  it("writes a retrieval report for every golden query", async () => {
    const results = await runRetrievalEval();
    expect(results).toHaveLength(goldenQueries.length);
  }, 120_000);
});
