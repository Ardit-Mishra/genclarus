// Stage-4 candidate report + validation (READ-ONLY over corpus-candidate/, compared to corpus/).
// Uses the CandidateCorpusStore (no containment, cannot read corpus/) for the RAW candidate view, and
// reads the live corpus/ + production containment set for the "current production view". Produces the
// per-record report and summary the Stage-4 spec requires, and runs validation checks 6–13.
//
// Run: npx tsx scripts/corpus/candidate-report.mts

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CandidateCorpusStore } from "../../src/lib/corpus/candidate-store";
import { validateCandidateRecord, validateCandidateManifest } from "../../src/lib/corpus/candidate-validate";
import { CONTAINED_GENE_IDS, CONTAINED_VARIANT_IDS } from "../../src/lib/corpus/containment";
import { buildEvidence } from "../../src/lib/evidence";
import { claimRejectionReason } from "../../src/lib/grounding";
import { computeExplanationState } from "../../src/lib/explanation-state";
import { afDisplay } from "../../src/lib/format-frequency";
import { parseCondition } from "../../src/lib/clinvar-significance";
import type { CorpusRecordV2, CorpusManifest } from "../../src/lib/corpus/types";
import type { VariantFacts } from "../../src/lib/facts";

const CWD = process.cwd();
const PROD = join(CWD, "corpus");
const CAND = join(CWD, "corpus-candidate");
const cand = new CandidateCorpusStore(CAND);

function readJson<T>(p: string): T | null { try { return JSON.parse(readFileSync(p, "utf-8")) as T; } catch { return null; } }
function isContained(kind: string, id: string): boolean {
  return (kind === "gene" ? CONTAINED_GENE_IDS : CONTAINED_VARIANT_IDS).has(id);
}

type Row = {
  id: string; kind: string;
  productionContained: boolean;
  oldRawState: string; candidateRawState: string;
  currentProductionView: string; proposedPostPromotion: string;
  oldClaimCount: number; candidateDetClaims: number; candidateLlmClaims: number;
  origins: string[]; storedState: string; computedState: string;
  factsHashChanged: boolean; oldFactsHash: string; candFactsHash: string;
  validationFailures: string[]; sourceOnlyReason: string | null;
  added: string[]; removed: string[]; changed: boolean;
  sourceConditionCount: number; distinctSourceConditionCount: number; renderedDetConditionCount: number;
};

const rows: Row[] = [];
const candRecords: CorpusRecordV2[] = [];

for (const kind of ["gene", "variant"] as const) {
  let files: string[] = [];
  try { files = readdirSync(join(CAND, kind)).filter((f) => f.endsWith(".json")); } catch { /* none */ }
  for (const file of files) {
    const id = file.replace(/\.json$/, "");
    const c = kind === "gene" ? await cand.getGene(id) : await cand.getVariant(id);
    if (!c) continue;
    candRecords.push(c);
    const old = readJson<{ claims: { text: string; origin?: string }[] | null; explanationState?: string; provenance: { factsHash: string } }>(join(PROD, kind, file));

    // Validation (checks 6, 8): strict v2 + stored-state agreement.
    const failures = validateCandidateRecord(c).map((i) => i.rule);

    // Check 9/10: clinical claims only from deterministic; llm only identity/function.
    const clinicalTypes = new Set(["classification_context", "condition_context", "frequency_context", "uncertainty"]);
    const det = (c.claims ?? []).filter((cl) => cl.origin === "deterministic");
    const llm = (c.claims ?? []).filter((cl) => cl.origin === "llm");
    for (const cl of llm) if (clinicalTypes.has(cl.claimType)) failures.push("llm_authored_clinical");
    for (const cl of det) if (!clinicalTypes.has(cl.claimType) && cl.claimType !== "identity") failures.push("det_non_clinical");

    // Check 7/12 (variants): every DISTINCT source condition is rendered (no truncation). Conditions
    // are deduped by base name — a condition with divergent significances yields ONE conflict claim, so
    // rendered condition-claims should equal the number of distinct source conditions.
    let srcConds = 0, distinctSrcConds = 0, renderedConds = 0;
    if (c.kind === "variant") {
      const vf = c.facts as VariantFacts;
      srcConds = vf.conditionClassifications.length;
      distinctSrcConds = new Set(vf.conditionClassifications.map((cc) => cc.condition.trim().toLowerCase())).size;
      renderedConds = det.filter((cl) => cl.claimType === "classification_context" || cl.claimType === "condition_context").length;
      if (renderedConds < distinctSrcConds) failures.push("truncated_assertions");
    }

    // Check 11: re-run the hardened validator over every candidate claim (should be zero rejections).
    const evidence = buildEvidence(c.facts);
    const subject = c.kind === "gene" ? (c.facts as { symbol: string }).symbol : `${(c.facts as VariantFacts).rsid} ${(c.facts as VariantFacts).gene}`;
    for (const cl of c.claims ?? []) {
      const rej = claimRejectionReason(evidence, cl, subject, cl.origin);
      if (rej) failures.push(`claim_rejected:${rej}`);
    }

    // Check 13: no small frequency renders as 0.00% or bare scientific notation.
    for (const cl of c.claims ?? []) {
      if (/\b0\.00%/.test(cl.text)) failures.push("zero_pct");
      if (/\b\d\.\d+e-\d+\b/i.test(cl.text) && !/allele fraction/i.test(cl.text)) failures.push("bare_scientific");
    }
    // Sanity: exercise afDisplay so an import stays meaningful even for records without frequency.
    if (c.kind === "variant" && (c.facts as VariantFacts).gnomadAf != null) void afDisplay((c.facts as VariantFacts).gnomadAf!);

    const origins = (c.claims ?? []).map((cl) => cl.origin);
    const computed = computeExplanationState(origins);
    const candidateRawState = c.explanationState;
    const oldRaw = old?.explanationState ?? (old?.claims && old.claims.length ? "grounded(legacy)" : "source_only(legacy)");
    const oldTexts = new Set((old?.claims ?? []).map((cl) => cl.text));
    const candTexts = new Set((c.claims ?? []).map((cl) => cl.text));
    const added = [...candTexts].filter((t) => !oldTexts.has(t));
    const removed = [...oldTexts].filter((t) => !candTexts.has(t));

    rows.push({
      id: c.id, kind: c.kind,
      productionContained: isContained(c.kind, c.id),
      oldRawState: oldRaw,
      candidateRawState,
      // Preflight item 4: the three distinct states.
      currentProductionView: isContained(c.kind, c.id) ? "source_only (contained)" : oldRaw,
      proposedPostPromotion: candidateRawState, // what production WOULD serve once promoted + containment lifted
      oldClaimCount: old?.claims?.length ?? 0,
      candidateDetClaims: det.length, candidateLlmClaims: llm.length,
      origins, storedState: candidateRawState, computedState: computed,
      factsHashChanged: (old?.provenance?.factsHash ?? "") !== c.provenance.factsHash,
      oldFactsHash: old?.provenance?.factsHash ?? "-", candFactsHash: c.provenance.factsHash,
      validationFailures: [...new Set(failures)], sourceOnlyReason: c.claims === null ? c.fallbackReason : null,
      added, removed, changed: added.length > 0 || removed.length > 0,
      sourceConditionCount: srcConds, distinctSourceConditionCount: distinctSrcConds, renderedDetConditionCount: renderedConds,
    });
  }
}

// Manifest validation (check 6/preflight 2).
const manifest = readJson<CorpusManifest>(join(CAND, "manifest.json"));
const manifestIssues = manifest ? validateCandidateManifest(manifest, candRecords).map((i) => `${i.id}:${i.rule}`) : ["manifest_missing"];

const S = (st: string) => rows.filter((r) => r.candidateRawState === st).length;
const summary = {
  records: rows.length,
  grounded: S("grounded"), deterministic_only: S("deterministic_only"), source_only: S("source_only"),
  validationRejections: rows.filter((r) => r.validationFailures.length > 0).length,
  changedFactsHash: rows.filter((r) => r.factsHashChanged).length,
  changedClinicalOutput: rows.filter((r) => r.changed).length,
  moreThanFiveDetAssertions: rows.filter((r) => r.candidateDetClaims > 5).length,
  previouslyContainedNowPassing: rows.filter((r) => r.productionContained && r.validationFailures.length === 0).length,
  stateDisagreements: rows.filter((r) => r.storedState !== r.computedState).length,
  truncatedAssertions: rows.filter((r) => r.kind === "variant" && r.renderedDetConditionCount < r.distinctSourceConditionCount).length,
  manifestIssues,
};

writeFileSync(join(CWD, "docs", "qa", "candidate-report.json"), JSON.stringify({ summary, rows }, null, 2));

// Control 7: the overall candidate GATE FAILS if even one record has any violation.
const gatePass =
  summary.validationRejections === 0 &&
  summary.stateDisagreements === 0 &&
  summary.truncatedAssertions === 0 &&
  manifestIssues.length === 0;

console.log("===== STAGE 4 CANDIDATE REPORT =====");
console.log(JSON.stringify(summary, null, 2));
console.log(`\nvalidation failures (records): ${summary.validationRejections}`);
for (const r of rows.filter((x) => x.validationFailures.length > 0)) console.log(`  ✗ [${r.kind}] ${r.id}: ${r.validationFailures.join(", ")}`);
console.log(`\nstate disagreements: ${summary.stateDisagreements}`);
for (const r of rows.filter((x) => x.storedState !== x.computedState)) console.log(`  ✗ [${r.kind}] ${r.id}: stored=${r.storedState} computed=${r.computedState}`);
console.log(`truncated deterministic assertions: ${summary.truncatedAssertions}`);
for (const r of rows.filter((x) => x.kind === "variant" && x.renderedDetConditionCount < x.distinctSourceConditionCount)) console.log(`  ✗ [${r.kind}] ${r.id}: ${r.renderedDetConditionCount} rendered < ${r.distinctSourceConditionCount} distinct`);
console.log(`manifest issues: ${manifestIssues.length ? manifestIssues.join(", ") : "none"}`);
console.log(`\npreviously-contained records now passing candidate rules: ${summary.previouslyContainedNowPassing} / ${rows.filter((r) => r.productionContained).length}`);
console.log(`records with >5 deterministic assertions: ${summary.moreThanFiveDetAssertions}`);
console.log(`facts-hash changes vs production: ${summary.changedFactsHash}`);
console.log(`clinical-output changes vs production: ${summary.changedClinicalOutput}`);
console.log(`\nfull per-record report -> docs/qa/candidate-report.json`);
console.log(`\n===== CANDIDATE GATE: ${gatePass ? "PASS" : "FAIL"} =====`);
process.exitCode = gatePass ? 0 : 1;
