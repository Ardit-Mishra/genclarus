// Deterministic clinical renderer (incident 2026-07-28). Builds EVERY frequency / classification /
// condition / drug-response+toxicity / review statement straight from the normalized facts — no LLM.
// Each statement corresponds to exactly ONE normalized assertion and reproduces its full tuple
// (condition · classification · qualifiers · origin · review status); it never infers, summarizes,
// reconciles, or picks a "best" among conflicting assertions. A condition with divergent significances
// yields a deterministic conflict notice. Frequencies go through the ONE canonical formatter. Every
// claim is pre-bound to its exact cited fact ids and passes the hardened gate by construction. Pure.

import type { VariantFacts } from "./facts";
import type { ConditionClassification } from "./clinvar";
import type { GroundedClaim } from "./grounding";
import { parseSignificance, parseCondition, normalizeOrigin, displayOrigin } from "./clinvar-significance";
import { afDisplay } from "./format-frequency";
import { resolveVariantGene } from "./gene-identity";

function starsPhrase(n: number): string {
  return `${n} review star${n === 1 ? "" : "s"}`;
}

// The significance of one assertion WITH every qualifier that must survive per §8: low penetrance,
// risk factor, PGx outcome (toxicity/efficacy/dosage), and (since a conflict notice has no separate
// origin clause) somatic. Uncertainty is already carried by the significance label itself
// ("Uncertain significance"/"Conflicting…"). Every qualifier here is independently required by the gate.
function sigWithQuals(c: ConditionClassification, includeOrigin: boolean): string {
  const sig = parseSignificance(c.rawSignificance || c.significance);
  const cond = parseCondition(c.condition);
  const lc = (c.significance || "").toLowerCase();
  const quals: string[] = [];
  const add = (q: string) => { if (!lc.includes(q)) quals.push(q); }; // never duplicate a word already in the label
  if (sig.lowPenetrance) add("low penetrance");
  if (sig.riskFactor) add("risk factor");
  if (cond.toxicity || sig.toxicity) add("toxicity");
  if (cond.efficacy) add("efficacy");
  if (cond.dosage) add("dosage");
  if (includeOrigin && normalizeOrigin(c.origin) === "somatic") add("somatic");
  return `${c.significance}${quals.length ? ` (${quals.join(", ")})` : ""}`;
}

// One classification claim for one condition, reproducing every GENUINELY-PRESENT tuple field:
// condition, classification, penetrance/uncertainty/toxicity qualifiers, origin (germline/somatic),
// review confidence (star count — the faithful encoding of reviewStatus), and assertion date
// (lastEvaluated) when present. There is NO per-assertion source/accession id in the normalized
// ClinVar record, so none is asserted — provenance is record-level (factsHash + sources).
function conditionClaim(rsid: string, c: ConditionClassification, i: number): GroundedClaim {
  const cond = parseCondition(c.condition);
  const origin = displayOrigin(c.origin); // germline/somatic/maternal/inherited/… verbatim, or null
  const originStr = origin ? `, ${origin}` : "";
  const dateStr = c.lastEvaluated ? `; last evaluated ${c.lastEvaluated}` : "";

  // Cite every fact the claim draws on (deterministic claims are not id-limited — the parse-layer
  // arity cap applies only to raw LLM output). This is what grounds the date's digits.
  const ids = [`var.cond.${i}.significance`, `var.cond.${i}.reviewStars`];
  if (origin) ids.push(`var.cond.${i}.origin`);
  if (c.lastEvaluated) ids.push(`var.cond.${i}.lastEvaluated`);

  return {
    text: `In ClinVar, ${rsid} is classified as ${sigWithQuals(c, false)} for ${cond.base} (${starsPhrase(c.reviewStars)}${originStr}${dateStr}).`,
    supportingFactIds: ids,
    claimType: "classification_context",
  };
}

export function renderClinicalClaims(v: VariantFacts): GroundedClaim[] {
  const claims: GroundedClaim[] = [];

  // Variant gene identity — ONLY when curated sources agree. A LOC placeholder or a disagreement
  // yields no identity claim (the gene is never asserted), matching the fail-safe policy.
  const identity = resolveVariantGene(v.gene, v.preferredName);
  if (identity.status === "resolved") {
    claims.push({
      text: `${v.rsid} is a genetic variant located in the ${identity.symbol} gene.`,
      supportingFactIds: ["var.gene"],
      claimType: "identity",
    });
  }

  // Allele frequency — canonical, always-labelled, cites only the gnomAD fact, no population. A very
  // small value is stated as an explicit allele fraction, never an unlabelled "0.00%" percentage.
  if (v.gnomadAf != null) {
    const af = afDisplay(v.gnomadAf);
    const text =
      af.unit === "percent"
        ? `In gnomAD, ${v.rsid} has an overall allele frequency of ${af.display}.`
        : `In gnomAD, ${v.rsid} has a very low overall allele fraction of ${af.rawFraction}.`;
    claims.push({ text, supportingFactIds: ["var.gnomadAf"], claimType: "frequency_context" });
  }

  // Per-condition classifications — render EVERY entry as its own assertion (root cause A fix).
  // ClinVar routinely holds several DISTINCT submissions for the same condition name that differ in
  // origin, review stars, or evaluation date; the previous name-grouping rendered only the first of
  // each same-significance group and silently dropped the rest (understating submissions, erasing the
  // only somatic entry, dropping 10 of 36 on rs334). One claim per entry can never drop a submission:
  // each carries its own full tuple (significance · qualifiers · origin · stars · date) and cites its
  // own facts. Entries that are byte-identical across all rendered fields render identical text and are
  // collapsed downstream by dedupeByText — so genuine duplicates don't double, distinct ones all survive.
  // Deterministic assertions are never truncated (Stage-3 correction C); the parse-layer arity cap is
  // LLM-only, and the MAX_CLAIMS gate applies only to parsed LLM output, not this deterministic list.
  v.conditionClassifications.forEach((c, i) => claims.push(conditionClaim(v.rsid, c, i)));

  return claims;
}
