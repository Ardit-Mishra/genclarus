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
import { buildEvidence, isClinicalFact } from "./evidence";
import { messagesFor, extractJson } from "./prompt";
import { ground, validateClaims, type OriginatedClaim } from "./grounding";
import { renderClinicalClaims } from "./render-clinical";
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

// Cap on OPTIONAL LLM context claims only. Deterministic clinical assertions are NEVER capped or
// truncated (Stage-3 correction C) — every condition-specific assertion, conflict and qualifier is
// preserved in the record and API; the UI may collapse a long list, the data never discards it.
const MAX_LLM_CLAIMS = 2;

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
      aiAvailable: true,
      fallbackReason: null,
      cached: true,
      state: computeExplanationState(hit.map((c) => c.origin)),
    };

  const evidence = buildEvidence(facts);
  // The grounded-by-construction identifiers for this lookup (rsID + its gene, or the gene symbol).
  const subject = facts.kind === "gene" ? facts.symbol : `${facts.rsid} ${facts.gene}`;

  // DETERMINISTIC clinical claims (variants only) — built from typed facts, run through the IDENTICAL
  // gate as a self-check (a renderer bug fails closed, never open), then tagged origin "deterministic".
  const clinical: OriginatedClaim[] =
    facts.kind === "variant"
      ? validateClaims(evidence, renderClinicalClaims(facts as VariantFacts), subject, "deterministic").map(
          (c) => ({ ...c, origin: "deterministic" as const }),
        )
      : [];

  // Nothing citable at all (e.g. a gene with only a bare symbol) and no clinical statements.
  if (evidence.length === 0 && clinical.length === 0) {
    return { claims: null, aiAvailable: true, fallbackReason: "provider_no_content", cached: false, state: "source_only" };
  }

  const primary = primaryBackend();
  // No model configured → the deterministic clinical statements can still stand alone.
  if (!primary) {
    return clinical.length
      ? { claims: clinical, aiAvailable: false, fallbackReason: "not_configured", cached: false, state: "deterministic_only" }
      : { claims: null, aiAvailable: false, fallbackReason: "not_configured", cached: false, state: "source_only" };
  }

  // The LLM writes NON-CLINICAL context only, so it is shown (and validated against) a non-clinical
  // view of the evidence — it is never even offered a classification/frequency it is forbidden to
  // author. The "llm" source still rejects any clinical claim it manages to produce.
  const llmEvidence = evidence.filter((f) => !isClinicalFact(f));
  const runBackend = async (backend: Backend) => {
    let providerReason: FallbackReason | null = null;
    let providerAvailable = false;
    const generate = async (repair: boolean): Promise<string | null> => {
      const res = await synthesize(messagesFor(facts, llmEvidence, repair), backend);
      providerAvailable = res.aiAvailable;
      if (!res.explanation) {
        providerReason = res.fallbackReason;
        return null;
      }
      return extractJson(res.explanation);
    };
    const result = await ground(llmEvidence, generate, subject, "llm");
    return { result, providerReason, providerAvailable };
  };

  let outcome = await runBackend(primary);
  const escalation = escalationBackend();
  if (!outcome.result.ok && escalation) {
    const escalated = await runBackend(escalation);
    if (escalated.result.ok) outcome = escalated;
  }

  const { result, providerReason, providerAvailable } = outcome;
  // LLM context is OPTIONAL and capped; deterministic clinical assertions are ALL kept (correction C).
  const llmClaims: OriginatedClaim[] = (result.ok ? result.explanation.claims : [])
    .map((c) => ({ ...c, origin: "llm" as const }))
    .slice(0, MAX_LLM_CLAIMS);
  // Deterministic statements first (never truncated), then the capped LLM context; dedupe by text.
  const final = dedupeByText<OriginatedClaim>([...clinical, ...llmClaims]);

  if (final.length === 0) {
    // Nothing groundable of either kind → source-only, with the honest provider reason.
    if (!result.ok && result.reason === "no_output") {
      return { claims: null, aiAvailable: providerAvailable, fallbackReason: providerReason ?? "provider_unavailable", cached: false, state: "source_only" };
    }
    return { claims: null, aiAvailable: true, fallbackReason: "failed_grounding", cached: false, state: "source_only" };
  }

  // Authoritative state from explicit origins — never guessed from claimType (correction A).
  const state = computeExplanationState(final.map((c) => c.origin));
  const hasLlm = llmClaims.length > 0;

  // Only cache a FULLY grounded result (LLM contributed). A deterministic_only outcome (LLM flaked)
  // is left uncached so the LLM context can be added on a later request instead of being frozen out.
  if (state === "grounded") explanationCache.set(key, final);

  // When only deterministic clinical statements survived, surface WHY the LLM prose is absent.
  const fallbackReason = hasLlm
    ? null
    : !result.ok && result.reason === "no_output"
      ? providerReason ?? "provider_unavailable"
      : "failed_grounding";

  return { claims: final, aiAvailable: hasLlm || providerAvailable, fallbackReason, cached: false, state };
}
