// INDEPENDENT Stage-4 candidate integrity verification — does NOT trust the report summary. Reads
// candidates ONLY through CandidateCorpusStore (no containment, cannot read corpus/). Fails loudly with
// an explicit list on any violation. Run: npx tsx scripts/corpus/candidate-integrity.mts

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CandidateCorpusStore } from "../../src/lib/corpus/candidate-store";
import { validateCandidateRecord, validateCandidateManifest } from "../../src/lib/corpus/candidate-validate";
import { buildEvidence } from "../../src/lib/evidence";
import { claimRejectionReason } from "../../src/lib/grounding";
import { computeExplanationState } from "../../src/lib/explanation-state";
import { afDisplay } from "../../src/lib/format-frequency";
import { parseCondition } from "../../src/lib/clinvar-significance";
import type { CorpusRecordV2, CorpusManifest, CorpusIdentifiers } from "../../src/lib/corpus/types";
import type { VariantFacts } from "../../src/lib/facts";

const CWD = process.cwd();
const CAND = join(CWD, "corpus-candidate");
const store = new CandidateCorpusStore(CAND);
const CLINICAL = new Set(["classification_context", "condition_context", "frequency_context", "uncertainty"]);

const fails: string[] = [];
const fail = (id: string, rule: string, detail = "") => fails.push(`[${id}] ${rule}${detail ? " — " + detail : ""}`);

// Load all candidates via the store (proves they're readable through the isolated path).
const genes: CorpusRecordV2[] = [];
const variants: CorpusRecordV2[] = [];
for (const f of readdirSync(join(CAND, "gene")).filter((x) => x.endsWith(".json"))) {
  const r = await store.getGene(f.replace(/\.json$/, ""));
  if (r) genes.push(r); else fail(f, "unreadable_via_store");
}
for (const f of readdirSync(join(CAND, "variant")).filter((x) => x.endsWith(".json"))) {
  const r = await store.getVariant(f.replace(/\.json$/, ""));
  if (r) variants.push(r); else fail(f, "unreadable_via_store");
}
const all = [...genes, ...variants];

// Counts.
if (genes.length !== 67) fail("<counts>", "gene_count", `${genes.length} != 67`);
if (variants.length !== 106) fail("<counts>", "variant_count", `${variants.length} != 106`);
if (all.length !== 173) fail("<counts>", "total_count", `${all.length} != 173`);

// Duplicate + unexpected + coverage vs approved identifier list.
const ids = JSON.parse(readFileSync(join(CWD, "corpus", "identifiers.json"), "utf-8")) as CorpusIdentifiers;
const normGene = (s: string) => s.trim().toUpperCase();
const normRs = (s: string) => s.trim().toLowerCase();
const approvedGenes = new Set(ids.genes.map(normGene));
const approvedVariants = new Set(ids.variants.map(normRs));
const seen = new Set<string>();
for (const r of all) {
  const key = `${r.kind}/${r.id}`;
  if (seen.has(key)) fail(r.id, "duplicate_id");
  seen.add(key);
  const approved = r.kind === "gene" ? approvedGenes.has(normGene(r.id)) : approvedVariants.has(normRs(r.id));
  if (!approved) fail(r.id, "unexpected_id");
}
for (const g of approvedGenes) if (!genes.some((r) => normGene(r.id) === g)) fail(g, "missing_approved_gene");
for (const v of approvedVariants) if (!variants.some((r) => normRs(r.id) === v)) fail(v, "missing_approved_variant");

// Manifest counts match disk + independent manifest validation.
const manifest = JSON.parse(readFileSync(join(CAND, "manifest.json"), "utf-8")) as CorpusManifest;
if (manifest.counts.genes !== genes.length) fail("<manifest>", "manifest_gene_count", `${manifest.counts.genes} != ${genes.length}`);
if (manifest.counts.variants !== variants.length) fail("<manifest>", "manifest_variant_count", `${manifest.counts.variants} != ${variants.length}`);
if (manifest.records.length !== all.length) fail("<manifest>", "manifest_record_count", `${manifest.records.length} != ${all.length}`);
const withExpl = all.filter((r) => r.claims != null).length;
const srcOnly = all.filter((r) => r.claims == null).length;
if (manifest.counts.withExplanation !== withExpl) fail("<manifest>", "manifest_withExplanation", `${manifest.counts.withExplanation} != ${withExpl}`);
if (manifest.counts.sourceOnly !== srcOnly) fail("<manifest>", "manifest_sourceOnly", `${manifest.counts.sourceOnly} != ${srcOnly}`);
for (const i of validateCandidateManifest(manifest, all)) fail(i.id, "manifest:" + i.rule, i.detail);

// Per-record deep checks.
for (const r of all) {
  // Strict v2 (origin, state, provenance, versions, citations, state agreement).
  for (const i of validateCandidateRecord(r)) fail(r.id, i.rule, i.detail);

  // Explicit version pins (redundant with validator, checked directly per the spec).
  if (r.provenance.corpusSchemaVersion !== "2.0.0") fail(r.id, "corpus_version", r.provenance.corpusSchemaVersion);
  if (r.provenance.promptVersion !== "3.0.0") fail(r.id, "prompt_version", r.provenance.promptVersion);
  if (r.provenance.schemaVersion !== "3.0.0") fail(r.id, "schema_version", r.provenance.schemaVersion);
  if (!r.provenance.factsHash) fail(r.id, "missing_facts_hash");

  const claims = r.claims ?? [];
  // Every non-null claim has origin; state == computeExplanationState(origins).
  const origins = claims.map((c) => c.origin);
  if (claims.some((c) => c.origin !== "deterministic" && c.origin !== "llm")) fail(r.id, "claim_missing_origin");
  if (claims.length && computeExplanationState(origins) !== r.explanationState) fail(r.id, "state_disagree", `stored=${r.explanationState} computed=${computeExplanationState(origins)}`);

  // LLM claims identity/function only; clinical/frequency claims deterministic only.
  for (const c of claims) {
    if (c.origin === "llm" && c.claimType !== "identity" && c.claimType !== "function") fail(r.id, "llm_non_context", c.claimType);
    if (CLINICAL.has(c.claimType) && c.origin !== "deterministic") fail(r.id, "clinical_not_deterministic", c.claimType);
  }

  // No candidate claim fails the hardened validator (also covers population + LOC promotion).
  const evidence = buildEvidence(r.facts);
  const subject = r.kind === "gene" ? (r.facts as { symbol: string }).symbol : `${(r.facts as VariantFacts).rsid} ${(r.facts as VariantFacts).gene}`;
  for (const c of claims) {
    const rej = claimRejectionReason(evidence, c, subject, c.origin);
    if (rej) fail(r.id, "claim_rejected", `${rej}: ${c.text.slice(0, 60)}`);
    // Frequency/percentage canonical-formatter conformance + no 0.00% / bare scientific.
    if (/\b0\.00%/.test(c.text)) fail(r.id, "zero_pct", c.text.slice(0, 60));
    if (/\d\.\d+e-\d+/i.test(c.text) && !/allele fraction/i.test(c.text)) fail(r.id, "bare_scientific", c.text.slice(0, 60));
    for (const m of c.text.matchAll(/(\d+(?:\.\d+)?)\s*%/g)) {
      // Any percentage in a claim must be the canonical rendering of the record's gnomadAf.
      const af = (r.facts as VariantFacts).gnomadAf;
      if (af == null) fail(r.id, "pct_without_af", m[0]);
      else {
        const disp = afDisplay(af);
        const ok = disp.canonicalPercent != null && (m[1] === String(disp.canonicalPercent) || m[1] === String(Math.round(af * 100)));
        if (!ok) fail(r.id, "pct_not_canonical", `${m[0]} vs af ${af} → ${disp.display}`);
      }
    }
  }

  // No truncation: every DISTINCT source condition has a deterministic classification/condition claim.
  if (r.kind === "variant") {
    const vf = r.facts as VariantFacts;
    const distinct = new Set(vf.conditionClassifications.map((cc) => cc.condition.trim().toLowerCase()));
    const rendered = new Set(
      claims.filter((c) => c.origin === "deterministic" && (c.claimType === "classification_context" || c.claimType === "condition_context"))
        .map((c) => c.text),
    );
    if (rendered.size < distinct.size) fail(r.id, "truncated_assertions", `${rendered.size} rendered < ${distinct.size} distinct source conditions`);
  }
}

console.log("===== INDEPENDENT CANDIDATE INTEGRITY =====");
console.log(`genes=${genes.length} variants=${variants.length} total=${all.length} | grounded=${all.filter((r) => r.explanationState === "grounded").length} deterministic_only=${all.filter((r) => r.explanationState === "deterministic_only").length} source_only=${all.filter((r) => r.explanationState === "source_only").length}`);
console.log(`\nVIOLATIONS: ${fails.length}`);
for (const f of fails) console.log("  ✗ " + f);
if (fails.length === 0) console.log("  ✓ all integrity checks passed");
process.exitCode = fails.length ? 1 : 0;
