// Provenance measurement — the metric this product actually stands on.
//
// WHY THIS EXISTS, AND WHY grounding.test.ts DOES NOT ANSWER IT
// -------------------------------------------------------------
// grounding.test.ts asks a Phase-3 question: "does the LLM's structured output pass the gate often
// enough to ship?" Stage 5 removed the LLM from the factual path entirely, so that harness now
// reports groundedRate 0 on a system that is working exactly as designed — the number measures an
// arm that no longer exists. Publishing it would be actively misleading.
//
// The question that matters NOW is narrower and much stronger:
//
//   Every sentence the site renders cites fact ids. Does each cited id actually resolve to a fact
//   the pipeline really fetched, and would the validator still accept that sentence against that
//   evidence?
//
// So this harness runs the REAL deterministic pipeline over the validation matrix, then re-derives
// every shipped claim's verdict from scratch via claimRejectionReason(). Three numbers come out:
//
//   * unboundShipped  — claims that SHIPPED but cite a fact id that does not resolve, or that the
//                       validator would now reject. This is the silent-failure metric. Target: 0.
//                       Any other value is a defect, and the test fails.
//   * dropped         — claims the renderer produced that the gate REMOVED. Non-zero is not a bug;
//                       it is the gate doing its job (fails closed, never open). But the rate and
//                       its per-rule attribution are worth knowing, so they are recorded.
//   * llmAuthored     — claims whose origin is the language model. Structurally must be 0 post-
//                       Stage-5; it is measured rather than assumed, because "we removed the LLM"
//                       is the single claim a reader is most entitled to see checked.
//
// No API key, no network model call — it exercises what actually ships, so it can run in CI.
// Writes docs/validation/provenance.json (full, gitignored). `node scripts/validation/publish.mjs`
// turns that into the committed, publishable summary.

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getGeneFacts, getVariantFacts, type Facts, type GeneFacts, type VariantFacts } from "../../src/lib/facts";
import { buildEvidence } from "../../src/lib/evidence";
import { explain, clearExplanationCache } from "../../src/lib/explain";
import { renderClinicalClaims } from "../../src/lib/render-clinical";
import { renderGeneClaims } from "../../src/lib/render-gene";
import { claimRejectionReason } from "../../src/lib/grounding";
import { resolveVariantGene } from "../../src/lib/gene-identity";
import { matrix, type MatrixCase } from "./matrix";

type ClaimAudit = {
  text: string;
  claimType: string;
  origin: string;
  supportingFactIds: string[];
  unresolvedIds: string[];
  rejectionReason: string | null;
};

type CaseMeasurement = {
  id: string;
  kind: MatrixCase["kind"];
  evidenceCount: number;
  renderedCount: number;
  shippedCount: number;
  droppedCount: number;
  unboundShippedCount: number;
  llmAuthoredCount: number;
  droppedReasons: string[];
  shipped: ClaimAudit[];
  error?: string;
};

// The subject string the live pipeline uses. Duplicated deliberately rather than exported from
// explain.ts: if these two ever drift, the audit is checking a different subject than the one that
// shipped, and a subject mismatch is precisely the kind of thing this harness must be able to see.
function subjectFor(facts: Facts): string {
  if (facts.kind === "gene") return (facts as GeneFacts).symbol;
  const v = facts as VariantFacts;
  const id = resolveVariantGene(v.gene, v.preferredName);
  return `${v.rsid}${id.status === "resolved" ? ` ${id.symbol}` : ""}`;
}

async function measureCase(item: MatrixCase): Promise<CaseMeasurement> {
  const base = { id: item.id, kind: item.kind } as const;
  try {
    const facts: Facts =
      item.kind === "gene" ? await getGeneFacts(item.id) : await getVariantFacts(item.id);
    const evidence = buildEvidence(facts);
    const evidenceIds = new Set(evidence.map((f) => f.id));
    const subject = subjectFor(facts);

    // What the renderer produced, before the gate.
    const rendered =
      facts.kind === "variant"
        ? renderClinicalClaims(facts as VariantFacts)
        : renderGeneClaims(facts as GeneFacts);

    // What actually ships, through the real pipeline.
    clearExplanationCache();
    const result = await explain(facts);
    const shipped = result.claims ?? [];

    // Re-derive every shipped claim's verdict from scratch. A claim that ships must still be
    // acceptable when audited independently — otherwise something between the gate and the page
    // let an unbound sentence through.
    const audits: ClaimAudit[] = shipped.map((c) => ({
      text: c.text,
      claimType: c.claimType,
      origin: c.origin,
      supportingFactIds: c.supportingFactIds,
      unresolvedIds: c.supportingFactIds.filter((fid) => !evidenceIds.has(fid)),
      rejectionReason: claimRejectionReason(evidence, c, subject, "deterministic"),
    }));

    const shippedTexts = new Set(shipped.map((c) => c.text));
    const droppedReasons = rendered
      .filter((c) => !shippedTexts.has(c.text))
      .map((c) => claimRejectionReason(evidence, c, subject, "deterministic") ?? "deduplicated");

    return {
      ...base,
      evidenceCount: evidence.length,
      renderedCount: rendered.length,
      shippedCount: shipped.length,
      droppedCount: droppedReasons.length,
      unboundShippedCount: audits.filter(
        (a) => a.unresolvedIds.length > 0 || a.rejectionReason !== null,
      ).length,
      llmAuthoredCount: audits.filter((a) => a.origin !== "deterministic").length,
      droppedReasons,
      shipped: audits,
    };
  } catch (error) {
    // An error is recorded as an error. It is never folded into a zero, because a case that threw
    // and a case with nothing to say are different facts about the system.
    return {
      ...base,
      evidenceCount: 0,
      renderedCount: 0,
      shippedCount: 0,
      droppedCount: 0,
      unboundShippedCount: 0,
      llmAuthoredCount: 0,
      droppedReasons: [],
      shipped: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

describe("provenance measurement", () => {
  it("audits every shipped claim against the evidence it cites", async () => {
    const results: CaseMeasurement[] = [];
    for (const item of matrix) {
      results.push(await measureCase(item));
    }

    const errored = results.filter((r) => r.error);
    const sum = (pick: (r: CaseMeasurement) => number) => results.reduce((a, r) => a + pick(r), 0);
    const shippedTotal = sum((r) => r.shippedCount);

    const reasonCounts: Record<string, number> = {};
    for (const r of results) {
      for (const reason of r.droppedReasons) {
        reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
      }
    }

    const report = {
      generatedAt: new Date().toISOString(),
      summary: {
        cases: results.length,
        casesErrored: errored.length,
        evidenceFacts: sum((r) => r.evidenceCount),
        claimsRendered: sum((r) => r.renderedCount),
        claimsShipped: shippedTotal,
        claimsDropped: sum((r) => r.droppedCount),
        // The three headline numbers.
        unboundShipped: sum((r) => r.unboundShippedCount),
        llmAuthored: sum((r) => r.llmAuthoredCount),
        citationsResolved: shippedTotal
          ? 1 - sum((r) => r.unboundShippedCount) / shippedTotal
          : null, // null, not 1.0 — no claims measured is not a perfect score
        droppedByReason: reasonCounts,
      },
      results,
    };

    const dir = resolve(process.cwd(), "docs/validation");
    await mkdir(dir, { recursive: true });
    await writeFile(resolve(dir, "provenance.json"), JSON.stringify(report, null, 2), "utf8");

    // Report first, assert second, so a failure still leaves the evidence on disk to read.
    expect(errored, `cases threw: ${errored.map((e) => `${e.id}: ${e.error}`).join("; ")}`).toEqual([]);
    expect(shippedTotal).toBeGreaterThan(0);

    // The invariant the product rests on. Not a soft metric — a gate.
    const offenders = results
      .flatMap((r) => r.shipped.map((s) => ({ case: r.id, ...s })))
      .filter((s) => s.unresolvedIds.length > 0 || s.rejectionReason !== null)
      .map((s) => `${s.case}: "${s.text}" (${s.rejectionReason ?? "unresolved ids"})`);
    expect(report.summary.unboundShipped, `ungrounded claims shipped:\n${offenders.join("\n")}`).toBe(0);

    // Post-Stage-5 the language model authors no factual claim. Measured, not assumed.
    expect(report.summary.llmAuthored).toBe(0);
  });
});
