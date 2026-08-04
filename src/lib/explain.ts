// Narrative generation, kept strictly downstream of the fact layer and now GROUNDED (Phase 3).
//
// The model no longer writes prose. It is handed the deterministic EvidenceFact list — the same
// list the validator checks against — and must return claim-level structured JSON: each claim one
// sentence, citing 1-3 fact ids. The output passes through the grounding gate (parse + deterministic
// validation, one repair retry) before anything is cached or shown. Any failure returns null and
// the page renders the verified facts alone. Clinical data never comes from the LLM.

import { createHash } from "node:crypto";
import { type FallbackReason } from "./nim";
import { PROMPT_VERSION, MODEL_ID, OUTPUT_SCHEMA_VERSION } from "./version";
import { TtlCache } from "./cache";
import { buildEvidence } from "./evidence";
import { validateClaims, type GroundedClaim, type OriginatedClaim } from "./grounding";
import { renderClinicalClaims } from "./render-clinical";
import { renderGeneClaims } from "./render-gene";
import { resolveVariantGene } from "./gene-identity";
import { computeExplanationState, type ExplanationState } from "./explanation-state";
import type { Facts, GeneFacts, VariantFacts } from "./facts";

export type { ExplanationState } from "./explanation-state";
export type { OriginatedClaim } from "./grounding";

export type Explanation = {
  claims: OriginatedClaim[] | null;
  aiAvailable: boolean;
  fallbackReason: FallbackReason | null;
  cached: boolean;
  state: ExplanationState;
};

function dedupeByText<T extends { text: string }>(claims: T[]): T[] {
  const seen = new Set<string>();
  return claims.filter((c) => (seen.has(c.text) ? false : (seen.add(c.text), true)));
}

const EXPLANATION_TTL_MS = 24 * 60 * 60 * 1000;
const explanationCache = new TtlCache<OriginatedClaim[]>(EXPLANATION_TTL_MS, 500);

export function clearExplanationCache(): void {
  explanationCache.clear();
}

// Only the facts the model actually sees go into the hash — so a change that cannot alter the
// narrative (a fresh retrievedAt stamp, a new source link) does not needlessly evict it, while
// any change that CAN alter it does.
function modelFacts(facts: Facts): Record<string, unknown> {
  if (facts.kind === "gene") {
    const g = facts as GeneFacts;
    return {
      symbol: g.symbol,
      name: g.name,
      type: g.type,
      summary: g.summary,
      aliases: g.aliases,
      location: g.location,
    };
  }
  const v = facts as VariantFacts;
  return {
    rsid: v.rsid,
    gene: v.gene,
    variantType: v.variantType,
    consequence: v.consequence,
    proteinChange: v.proteinChange,
    preferredName: v.preferredName,
    // ALL conditions (no cap): the deterministic renderer now renders every condition, so the cache
    // key must track every one — a change to any condition can change the rendered clinical claims.
    clinvarByCondition: v.conditionClassifications.map((c) => ({
      condition: c.condition,
      significance: c.significance,
      rawSignificance: c.rawSignificance,
      reviewStars: c.reviewStars,
      origin: c.origin,
    })),
    gnomadAlleleFrequency: v.gnomadAf,
    hasClinvar: v.hasClinvar,
  };
}

export function factsHash(facts: Facts): string {
  return createHash("sha256").update(JSON.stringify(modelFacts(facts))).digest("hex").slice(0, 16);
}

// Identifier + fact hash + prompt version + model id + schema version. A cached narrative must
// not outlive a ClinVar update, a prompt edit, a model swap, or a schema change — each of those
// can make yesterday's wording wrong rather than merely stale.
export function cacheKey(facts: Facts): string {
  const id = facts.kind === "gene" ? facts.symbol : facts.rsid;
  return [
    facts.kind,
    id,
    factsHash(facts),
    PROMPT_VERSION,
    MODEL_ID,
    OUTPUT_SCHEMA_VERSION,
  ].join("|");
}

export async function explain(facts: Facts): Promise<Explanation> {
  const key = cacheKey(facts);
  const hit = explanationCache.get(key);
  if (hit)
    return {
      claims: hit,
      aiAvailable: false,
      fallbackReason: null,
      cached: true,
      state: computeExplanationState(hit.map((c) => c.origin)),
    };

  const evidence = buildEvidence(facts);
  // Grounded-by-construction subject. For a variant the gene is included ONLY when identity resolves —
  // an unresolved/conflicting gene (e.g. an antisense "HFE-AS1" vs the curated "HFE") must NOT be
  // licensed as a groundable entity through the subject (root cause D).
  const subject =
    facts.kind === "gene"
      ? facts.symbol
      : (() => {
          const id = resolveVariantGene(facts.gene, facts.preferredName);
          return `${facts.rsid}${id.status === "resolved" ? ` ${id.symbol}` : ""}`;
        })();

  // FULLY DETERMINISTIC claims for BOTH kinds — variant clinical/identity from render-clinical, gene
  // identity from render-gene — each run through the IDENTICAL hardened gate as a self-check (a renderer
  // bug fails closed, never open) and tagged origin "deterministic". The LLM is NO LONGER consulted for
  // any claim (Stage-5 final, 2026-08-03): it repeatedly hallucinated ungrounded identity/function facts
  // (wrong chromosome, a pseudogene stated as an enzyme, an intergenic label treated as one gene), so
  // the explanation is now deterministic + sourced only. The authoritative NCBI gene summary/name and
  // all facts are still served alongside the claims; `aiAvailable` is therefore always false.
  const rendered: GroundedClaim[] =
    facts.kind === "variant" ? renderClinicalClaims(facts as VariantFacts) : renderGeneClaims(facts as GeneFacts);
  const final = dedupeByText<OriginatedClaim>(
    validateClaims(evidence, rendered, subject, "deterministic").map((c) => ({ ...c, origin: "deterministic" as const })),
  );

  if (final.length === 0) {
    // Nothing groundable → source-only (facts + sources are still served by the caller).
    return { claims: null, aiAvailable: false, fallbackReason: "provider_no_content", cached: false, state: "source_only" };
  }

  const state = computeExplanationState(final.map((c) => c.origin)); // deterministic_only, by construction
  explanationCache.set(key, final);
  return { claims: final, aiAvailable: false, fallbackReason: null, cached: false, state };
}
