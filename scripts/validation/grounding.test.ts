// Live grounding measurement (Phase 3 §12).
//
// The Phase 3 question is empirical: on the free NIM tier, does claim-level structured generation
// pass the grounding gate often enough to ship, or is the fallback rate so high the AI narrative is
// usually absent? This runs the REAL pipeline (explain → NIM → grounding) over the validation
// matrix and records, per case: the outcome (grounded / fallback + reason) and end-to-end latency.
//
// It writes docs/validation/grounding.{json,md} (gitignored). It is a MEASUREMENT, not a pass/fail
// gate — the test only asserts a report was produced for every case, so one bad roll never aborts
// the run. Requires NVIDIA_API_KEY; without it every case reports `not_configured` (harness smoke).

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getGeneFacts, getVariantFacts, type Facts } from "../../src/lib/facts";
import { buildEvidence } from "../../src/lib/evidence";
import { explain, clearExplanationCache } from "../../src/lib/explain";
import { matrix, type MatrixCase } from "./matrix";

type Outcome = "grounded" | "fallback";

type CaseMeasurement = {
  id: string;
  kind: MatrixCase["kind"];
  evidenceCount: number;
  outcome: Outcome;
  aiAvailable: boolean;
  fallbackReason: string | null;
  claimCount: number;
  latencyMs: number;
  error?: string;
  // A spot-checkable trace of what was shown (or why nothing was).
  claims?: string[];
};

async function measureCase(item: MatrixCase): Promise<CaseMeasurement> {
  const started = Date.now();
  try {
    const facts: Facts =
      item.kind === "gene" ? await getGeneFacts(item.id) : await getVariantFacts(item.id);
    const evidenceCount = buildEvidence(facts).length;

    const genStarted = Date.now();
    const result = await explain(facts);
    const latencyMs = Date.now() - genStarted;

    // Grounded means: the AI path was actually available AND it produced at least one verified
    // claim — not merely that the page would render (source-only fallback also renders fine).
    const grounded = result.aiAvailable && result.claims != null && result.claims.length > 0;
    return {
      id: item.id,
      kind: item.kind,
      evidenceCount,
      outcome: grounded ? "grounded" : "fallback",
      aiAvailable: result.aiAvailable,
      fallbackReason: result.fallbackReason,
      claimCount: result.claims?.length ?? 0,
      latencyMs,
      claims: result.claims?.map((c) => c.text),
    };
  } catch (error) {
    return {
      id: item.id,
      kind: item.kind,
      evidenceCount: 0,
      outcome: "fallback",
      aiAvailable: false,
      fallbackReason: "error",
      claimCount: 0,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function aggregate(results: CaseMeasurement[]) {
  const total = results.length;
  const grounded = results.filter((r) => r.outcome === "grounded").length;
  const byReason: Record<string, number> = {};
  for (const r of results.filter((r) => r.outcome === "fallback")) {
    const key = r.fallbackReason ?? "unknown";
    byReason[key] = (byReason[key] ?? 0) + 1;
  }
  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
  const mean = latencies.reduce((a, b) => a + b, 0) / (latencies.length || 1);
  return {
    total,
    grounded,
    groundedRate: total ? grounded / total : 0,
    fallbackByReason: byReason,
    latencyMs: {
      mean: Math.round(mean),
      median: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      max: latencies[latencies.length - 1] ?? 0,
    },
  };
}

function markdown(results: CaseMeasurement[], summary: ReturnType<typeof aggregate>): string {
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const lines: string[] = [
    "# Genclarus grounding measurement (Phase 3 §12)",
    "",
    `Generated: ${new Date().toISOString()}`,
    process.env.NVIDIA_API_KEY ? "" : "> ⚠️  NVIDIA_API_KEY not set — every case falls back to `not_configured`. This is a harness smoke run, not a real measurement.",
    "",
    "## Summary",
    "",
    `- Cases: **${summary.total}**`,
    `- Grounded (valid claims shown): **${summary.grounded}** (${pct(summary.groundedRate)})`,
    `- Fallback by reason: ${Object.entries(summary.fallbackByReason).map(([k, v]) => `\`${k}\` ×${v}`).join(", ") || "none"}`,
    `- Latency ms — mean ${summary.latencyMs.mean}, median ${summary.latencyMs.median}, p95 ${summary.latencyMs.p95}, max ${summary.latencyMs.max}`,
    "",
    "## Per-case",
    "",
    "| Case | Kind | Evidence | Outcome | Reason | Claims | Latency ms |",
    "| --- | --- | ---: | --- | --- | ---: | ---: |",
    ...results.map(
      (r) =>
        `| ${r.id} | ${r.kind} | ${r.evidenceCount} | ${r.outcome} | ${r.fallbackReason ?? "—"} | ${r.claimCount} | ${r.latencyMs} |`,
    ),
    "",
    "## Grounded claim traces",
    "",
  ];
  for (const r of results.filter((r) => r.claims?.length)) {
    lines.push(`### ${r.id}`, "", ...r.claims!.map((c) => `- ${c}`), "");
  }
  return lines.join("\n");
}

export async function runGroundingMatrix(): Promise<CaseMeasurement[]> {
  clearExplanationCache();
  const results: CaseMeasurement[] = [];
  // Sequential on purpose: concurrent requests trigger free-tier rate limiting, which would
  // distort the per-request latency this pass exists to measure.
  for (const item of matrix) {
    results.push(await measureCase(item));
  }
  const summary = aggregate(results);
  const out = resolve(process.cwd(), "docs", "validation");
  await mkdir(out, { recursive: true });
  await writeFile(
    resolve(out, "grounding.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), summary, results }, null, 2) + "\n",
  );
  await writeFile(resolve(out, "grounding.md"), markdown(results, summary));
  return results;
}

describe("live grounding measurement matrix", () => {
  it("writes a grounding report without aborting per-case failures", async () => {
    const results = await runGroundingMatrix();
    expect(results).toHaveLength(matrix.length);
  }, 1_800_000);
});

// Regression guard for the rs6025 (Factor V Leiden) class of bug: a variant offering many ClinVar
// conditions once overran max_tokens and fell back to source-only output DETERMINISTICALLY (fixed
// by capping conditions offered to the model — MAX_MODEL_CONDITIONS in src/lib/evidence.ts). The
// measurement pass above only records outcomes; it deliberately never fails the run on a bad roll,
// so a regression of that class would slip through unnoticed. These `mustGround` cases are
// different: they are known-good variants (matrix.ts) that are expected to reliably produce
// grounded AI claims, so this positive assertion actually fails when grounding stops working.
//
// Each case gets a few independent attempts to absorb the free NIM tier's occasional flakiness.
// This does not mask the original bug: that failure was deterministic across every attempt (all 15
// conditions were always sent, always overrunning max_tokens), so retries would not have hidden it
// — they only protect this guard from unrelated one-off provider hiccups.
const MUST_GROUND_ATTEMPTS = 3;
const mustGroundCases = matrix.filter((item) => item.mustGround);

async function attemptGrounding(item: MatrixCase): Promise<CaseMeasurement[]> {
  const attempts: CaseMeasurement[] = [];
  for (let attempt = 1; attempt <= MUST_GROUND_ATTEMPTS; attempt++) {
    const measurement = await measureCase(item);
    attempts.push(measurement);
    if (measurement.outcome === "grounded") break;
  }
  return attempts;
}

// Skipped (not failed) without NVIDIA_API_KEY: every attempt would report `not_configured`, which
// is a harness-smoke condition, not a grounding regression, and shouldn't be reported as one.
describe.skipIf(!process.env.NVIDIA_API_KEY)("live grounding — must-ground regression guard", () => {
  for (const item of mustGroundCases) {
    it(
      `${item.id} must produce grounded AI claims within ${MUST_GROUND_ATTEMPTS} attempt(s)`,
      async () => {
        const attempts = await attemptGrounding(item);
        const grounded = attempts.some((a) => a.outcome === "grounded");
        const trace = attempts
          .map(
            (a, i) =>
              `#${i + 1} outcome=${a.outcome} aiAvailable=${a.aiAvailable} reason=${a.fallbackReason ?? "n/a"} claims=${a.claimCount}`,
          )
          .join("; ");
        expect(
          grounded,
          `${item.id} (${item.why}) never grounded in ${attempts.length} attempt(s): ${trace}`,
        ).toBe(true);
      },
      1_800_000,
    );
  }
});
