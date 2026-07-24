// Narrative generation, kept strictly downstream of the fact layer.
//
// The model is handed a hand-picked subset of server-derived facts serialized as inert JSON —
// never raw upstream text, never anything the browser sent. Clinical classifications stay
// per-condition all the way into the prompt, because a model given a collapsed verdict will
// faithfully repeat it.

import { createHash } from "node:crypto";
import { synthesize, type FallbackReason } from "./nim";
import { PROMPT_VERSION, MODEL_ID, OUTPUT_SCHEMA_VERSION } from "./version";
import { TtlCache } from "./cache";
import type { Facts, GeneFacts, VariantFacts } from "./facts";

export type Explanation = {
  explanation: string | null;
  aiAvailable: boolean;
  fallbackReason: FallbackReason | null;
  cached: boolean;
};

const EXPLANATION_TTL_MS = 24 * 60 * 60 * 1000;
const explanationCache = new TtlCache<string>(EXPLANATION_TTL_MS, 500);

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

function genePrompt(g: GeneFacts) {
  const facts = JSON.stringify(modelFacts(g));
  return [
    {
      role: "system" as const,
      content:
        "You are a careful science communicator explaining human genes to curious non-specialists. Use ONLY the provided facts. Never invent gene functions, disease associations, numbers, or clinical claims. Do not give medical advice or diagnostic interpretation. detailed thinking off",
    },
    {
      role: "user" as const,
      content:
        `Explain the human gene ${g.symbol}${g.name ? ` (${g.name})` : ""} for a curious non-specialist, using only these facts:\n\n${facts}\n\n` +
        "Write exactly three short markdown sections with these headers:\n## What it does\n## Why it matters\n## Key facts\n" +
        "Keep it under ~170 words total. If the summary is empty, say only what the name and gene type support, and note that detailed curated summary data is limited for this gene.",
    },
  ];
}

function variantPrompt(v: VariantFacts) {
  const facts = JSON.stringify(modelFacts(v));
  return [
    {
      role: "system" as const,
      content:
        "You are a careful science communicator explaining human genetic variants to curious non-specialists. Use ONLY the provided facts. Never invent conditions, significance classifications, frequencies, or clinical claims. Never give personal medical advice, diagnosis, or risk interpretation for an individual. ClinVar classifications are PER CONDITION — a variant can be pathogenic for one condition and benign or uncertain for another, and germline vs somatic differ; never merge them into a single overall verdict. When interpretations vary or conflict, say so plainly. detailed thinking off",
    },
    {
      role: "user" as const,
      content:
        `Explain the human variant ${v.rsid}${v.gene ? ` in the ${v.gene} gene` : ""} for a curious non-specialist, using only these facts:\n\n${facts}\n\n` +
        "Write exactly three short markdown sections with these headers:\n## What this variant is\n## Clinical significance\n## Key facts\n" +
        "In 'Clinical significance', explain that ClinVar classifications are given per condition, summarize how they vary across the listed conditions in general educational terms, note review confidence and any conflict/uncertainty, and do NOT tell the reader what it means for them personally. " +
        "Keep it under ~190 words total. If clinical data is limited, say so.",
    },
  ];
}

export async function explain(facts: Facts): Promise<Explanation> {
  const key = cacheKey(facts);
  const hit = explanationCache.get(key);
  if (hit) return { explanation: hit, aiAvailable: true, fallbackReason: null, cached: true };

  const messages = facts.kind === "gene" ? genePrompt(facts) : variantPrompt(facts);
  const { explanation, aiAvailable, fallbackReason } = await synthesize(messages);

  // Only successes are cached. Caching a failure would turn one bad roll into a day of them.
  if (explanation) explanationCache.set(key, explanation);

  return { explanation, aiAvailable, fallbackReason, cached: false };
}
