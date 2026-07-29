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
import { parseSignificance, parseCondition, normalizeOrigin } from "./clinvar-significance";
import { afDisplay } from "./format-frequency";
import { resolveVariantGene } from "./gene-identity";

function starsPhrase(n: number): string {
  return `${n} review star${n === 1 ? "" : "s"}`;
}

// One classification claim for one condition, reproducing every GENUINELY-PRESENT tuple field:
// condition, classification, penetrance/uncertainty (via the significance label + parsed qualifiers),
// origin (germline/somatic), review confidence (star count — the faithful encoding of reviewStatus),
// and assertion date (lastEvaluated) when present. There is NO per-assertion source/accession id in
// the normalized ClinVar record, so none is asserted — provenance is record-level (factsHash + sources).
function conditionClaim(rsid: string, c: ConditionClassification, i: number): GroundedClaim {
  const sig = parseSignificance(c.rawSignificance || c.significance);
  const cond = parseCondition(c.condition);
  const origin = normalizeOrigin(c.origin);

  const quals: string[] = [];
  if (sig.lowPenetrance) quals.push("low penetrance");
  if (cond.toxicity || sig.toxicity) quals.push("toxicity");
  const qualStr = quals.length ? ` (${quals.join(", ")})` : "";
  const originStr = origin !== "unknown" ? `, ${origin}` : "";
  const dateStr = c.lastEvaluated ? `; last evaluated ${c.lastEvaluated}` : "";

  // Cite every fact the claim draws on (deterministic claims are not id-limited — the parse-layer
  // arity cap applies only to raw LLM output). This is what grounds the date's digits.
  const ids = [`var.cond.${i}.significance`, `var.cond.${i}.reviewStars`];
  if (origin !== "unknown") ids.push(`var.cond.${i}.origin`);
  if (c.lastEvaluated) ids.push(`var.cond.${i}.lastEvaluated`);

  return {
    text: `In ClinVar, ${rsid} is classified as ${c.significance}${qualStr} for ${cond.base} (${starsPhrase(c.reviewStars)}${originStr}${dateStr}).`,
    supportingFactIds: ids,
    claimType: "classification_context",
  };
}

// A deterministic conflict notice for a condition with divergent significances — lists them, never
// chooses. Cites each assertion's classification fact (all share the one condition, so §7 passes).
function conflictClaim(
  rsid: string,
  group: { c: ConditionClassification; i: number }[],
): GroundedClaim {
  const cond = parseCondition(group[0].c.condition).base;
  const sigs = group.map((g) => g.c.significance).join(" and ");
  return {
    text: `In ClinVar, ${rsid} has differing classifications for ${cond} across submissions: ${sigs}.`,
    supportingFactIds: group.map((g) => `var.cond.${g.i}.significance`),
    claimType: "condition_context",
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

  // Per-condition classifications — ALL of them (deterministic assertions are never truncated;
  // Stage-3 correction C). Group same-condition assertions; a condition with >1 distinct significance
  // becomes a conflict notice, never a chosen winner.
  const considered = v.conditionClassifications.map((c, i) => ({ c, i }));
  const byCondition = new Map<string, { c: ConditionClassification; i: number }[]>();
  for (const entry of considered) {
    const key = parseCondition(entry.c.condition).base.toLowerCase();
    const arr = byCondition.get(key);
    if (arr) arr.push(entry);
    else byCondition.set(key, [entry]);
  }
  for (const group of byCondition.values()) {
    const distinct = new Set(group.map((g) => g.c.significance.toLowerCase()));
    claims.push(distinct.size <= 1 ? conditionClaim(v.rsid, group[0].c, group[0].i) : conflictClaim(v.rsid, group));
  }

  return claims;
}
