// Single source of truth for the versions echoed in API `meta` responses. These also become
// part of the cache key once version-aware caching lands (Phase 4) — bumping any of these
// invalidates cached explanations generated under the old prompt/model/schema.

// Bump when the synthesis prompts (system/user messages) change meaningfully.
// 2.0.0 — Phase 3: prose synthesis replaced by claim-level structured generation (grounding).
// 3.0.0 — 2026-07-28 incident: LLM restricted to non-clinical identity/function; clinical/numeric
//         statements now rendered deterministically. Invalidates every cached/committed explanation.
// 3.1.0 — 2026-08-02 Stage-5 re-audit fixes: deterministic renderer no longer drops distinct ClinVar
//         submissions (root A) and preserves efficacy/dosage/risk-factor/non-default-origin qualifiers
//         (roots B/C); LLM view withholds variant-type + unresolved gene, prompt bars gene/variant
//         conflation (roots D/E). Renderer + validator + prompt all changed → invalidates every cache.
// 4.0.0 — 2026-08-03 Stage-5 FINAL: the LLM is removed from the factual claim path entirely. It kept
//         hallucinating ungrounded identity/function facts (wrong chromosome, pseudogene→enzyme,
//         intergenic label as one gene). Explanations are now FULLY deterministic + sourced: variant
//         clinical/identity from render-clinical, gene identity from render-gene; no AI-generated prose.
// 4.0.1 — 2026-08-03 Stage-5 re-audit round-3 minor: a whole-number-percent frequency ("26.0%"/"10.0%")
//         was dropped because the display token wasn't in frequencyRenderings; now kept in lockstep.
export const PROMPT_VERSION = "4.0.1";

// The NIM model id actually called — mirrors src/lib/nim.ts, which imports this constant so the
// two can never drift apart. Phase 3 uses a fast NON-reasoning instruct model: claim-level JSON
// extraction wants no chain-of-thought (the grounding validator supplies the rigor), and the
// previous reasoning model reasoned past the free-tier latency budget on every structured request.
// Overridable via NIM_MODEL. The model is deliberately replaceable — losing it degrades to
// source-only output, it does not take the product down.
export const MODEL_ID =
  process.env.NIM_MODEL || "meta/llama-3.1-8b-instruct";

// The stronger free model the grounding orchestrator escalates to (via OpenRouter) ONLY when the
// primary's output cannot be grounded. MUST be a ":free" id — the $0 guard in nim.ts rejects any
// paid model outright. Overridable via OPENROUTER_MODEL (used for benchmarking candidates).
export const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || "openai/gpt-oss-20b:free";

// Bump when the shape of the JSON returned by /api/gene, /api/variant or /api/explain changes.
// 2.0.0 — Phase 3: /api/explain returns grounded `claims` (with citations) instead of `explanation`.
// 3.0.0 — 2026-07-28 incident: responses carry an explanation `state`
//         (grounded | deterministic_only | source_only); clinical claims are rendered deterministically.
export const OUTPUT_SCHEMA_VERSION = "3.0.0";
