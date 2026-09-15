#!/usr/bin/env node
// Turn the gitignored measurement artifacts into ONE committed, publishable report.
//
// docs/ is gitignored (internal planning lives there), so the raw harness output cannot be read by
// a page at build time. This script trims it to what a reader needs and writes it into src/, where
// it is committed — which means the number on the public page and the number in the repo are the
// same object, and anyone can diff them.
//
// It REFUSES to publish rather than publishing something plausible:
//   * a missing artifact is an error, not an empty section
//   * an artifact older than MAX_AGE_DAYS is an error, because a stale metric presented as current
//     is the exact failure this whole project exists to prevent
// Run the harnesses first:  npm run measure:provenance  &&  npm run measure:retrieval

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";

const MAX_AGE_DAYS = 30;
const OUT = resolve(process.cwd(), "src/data/validation/report.json");

async function load(name) {
  const path = resolve(process.cwd(), "docs/validation", name);
  let raw;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    throw new Error(
      `missing artifact: ${path}\nRun the harness that produces it before publishing — ` +
        `an absent measurement must never become an empty section on the page.`,
    );
  }
  const parsed = JSON.parse(raw);
  const ageDays = (Date.now() - Date.parse(parsed.generatedAt)) / 86_400_000;
  if (!Number.isFinite(ageDays)) throw new Error(`${name}: unparseable generatedAt`);
  if (ageDays > MAX_AGE_DAYS) {
    throw new Error(
      `${name} is ${ageDays.toFixed(0)} days old (limit ${MAX_AGE_DAYS}). Re-measure before publishing.`,
    );
  }
  return parsed;
}

const provenance = await load("provenance.json");
const retrieval = await load("retrieval.json");

const report = {
  publishedAt: new Date().toISOString(),
  provenance: {
    generatedAt: provenance.generatedAt,
    ...provenance.summary,
    // Per-case counts only — the 244 individual claim texts stay out of the bundle. The full
    // detail lives in the harness output for anyone auditing locally.
    cases: provenance.results.map((r) => ({
      id: r.id,
      kind: r.kind,
      evidenceCount: r.evidenceCount,
      renderedCount: r.renderedCount,
      shippedCount: r.shippedCount,
      droppedCount: r.droppedCount,
    })),
  },
  retrieval: {
    generatedAt: retrieval.generatedAt,
    ...retrieval.summary,
    queries: retrieval.results.map((r) => ({
      query: r.query,
      relevantIds: r.relevantIds,
      rankOfFirstRelevant: r.rankOfFirstRelevant,
      hit: r.hit,
    })),
  },
};

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(report, null, 2) + "\n", "utf8");

console.log(`published -> ${OUT}`);
console.log(
  `  provenance: ${report.provenance.claimsShipped} claims shipped, ` +
    `${report.provenance.unboundShipped} unbound, ${report.provenance.llmAuthored} llm-authored`,
);
console.log(
  `  retrieval : Recall@${report.retrieval.k} ${report.retrieval.recallAtK}, MRR ${report.retrieval.mrr.toFixed(3)}`,
);
