// Narrative generation, kept strictly downstream of the fact layer and now GROUNDED (Phase 3).
//
// The model no longer writes prose. It is handed the deterministic EvidenceFact list — the same
// list the validator checks against — and must return claim-level structured JSON: each claim one
// sentence, citing 1-3 fact ids. The output passes through the grounding gate (parse + deterministic
// validation, one repair retry) before anything is cached or shown. Any failure returns null and
// the page renders the verified facts alone. Clinical data never comes from the LLM.

import { createHash } from "node:crypto";
import {
  synthesize,
  primaryBackend,
  escalationBackend,
  type Backend,
  type FallbackReason,
} from "./nim";
import { PROMPT_VERSION, MODEL_ID, OUTPUT_SCHEMA_VERSION } from "./version";
import { TtlCache } from "./cache";
import { buildEvidence } from "./evidence";
import { messagesFor, extractJson } from "./prompt";
import { ground, type GroundedClaim } from "./grounding";
import type { Facts, GeneFacts, VariantFacts } from "./facts";

export type Explanation = {
  claims: GroundedClaim[] | null;
  aiAvailable: boolean;
  fallbackReason: FallbackReason | null;
  cached: boolean;
};

const EXPLANATION_TTL_MS = 24 * 60 * 60 * 1000;
const explanationCache = new TtlCache<GroundedClaim[]>(EXPLANATION_TTL_MS, 500);

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
    clinvarByCondition: v.conditionClassifications.slice(0, 8).map((c) => ({
      condition: c.condition,
      significance: c.significance,
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
  if (hit) return { claims: hit, aiAvailable: true, fallbackReason: null, cached: true };

  const evidence = buildEvidence(facts);
  // Nothing citable (e.g. a gene with only a bare symbol) — there is no honest claim to generate.
  if (evidence.length === 0) {
    return { claims: null, aiAvailable: true, fallbackReason: "provider_no_content", cached: false };
  }

  const primary = primaryBackend();
  // Nothing configured at all → no synthesis is possible; report it honestly, don't pretend outage.
  if (!primary) {
    return { claims: null, aiAvailable: false, fallbackReason: "not_configured", cached: false };
  }

  // The generation thunk the grounding orchestrator drives, bound to one backend. It records the
  // provider's own fallback reason so a genuine outage stays distinguishable from a grounding
  // rejection.
  let providerReason: FallbackReason | null = null;
  let providerAvailable = false;
  const generateWith = (backend: Backend) => async (repair: boolean): Promise<string | null> => {
    const res = await synthesize(messagesFor(facts, evidence, repair), backend);
    providerAvailable = res.aiAvailable;
    if (!res.explanation) {
      providerReason = res.fallbackReason;
      return null;
    }
    return extractJson(res.explanation);
  };

  // The grounded-by-construction identifiers for this lookup: for a variant that is the rsID AND
  // the gene it sits in (both are the subject of nearly every claim and cannot be "invented").
  const subject = facts.kind === "gene" ? facts.symbol : `${facts.rsid} ${facts.gene}`;

  // Primary (fast, free) first. Escalate to the stronger free model ONLY when the primary produced
  // nothing groundable — a provider outage OR output the validator rejected wholesale. This spends
  // the scarce escalation quota exactly on the hard cases; ~83% never escalate.
  let result = await ground(evidence, generateWith(primary), subject);
  const escalation = escalationBackend();
  if (!result.ok && escalation) {
    result = await ground(evidence, generateWith(escalation), subject);
  }
  if (result.ok) {
    explanationCache.set(key, result.explanation.claims);
    return { claims: result.explanation.claims, aiAvailable: true, fallbackReason: null, cached: false };
  }

  // The provider never produced usable text → surface its reason. It produced text we could not
  // verify → `failed_grounding`, stated honestly so the UI can explain why there's no narrative.
  if (result.reason === "no_output") {
    return {
      claims: null,
      aiAvailable: providerAvailable,
      fallbackReason: providerReason ?? "provider_unavailable",
      cached: false,
    };
  }
  return { claims: null, aiAvailable: true, fallbackReason: "failed_grounding", cached: false };
}
