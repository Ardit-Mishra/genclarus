// The tri-state that replaces the old "claims or null" binary (incident 2026-07-28), plus the
// AUTHORITATIVE derivation from explicit claim ORIGINS. Dependency-free leaf module so the corpus
// projection (view.ts) can import it without the LLM/synthesis stack. See clarification 0.4 + Stage-3
// correction A: state is computed from where each claim came from — NEVER guessed from claimType,
// because both the deterministic renderer and the LLM can emit `identity` claims.
//
//   grounded            — has validated LLM (identity/function) context (with or without deterministic clinical)
//   deterministic_only  — only deterministic clinical/identity statements; no LLM prose
//   source_only         — no claims of either kind (facts + sources still served)

export type ExplanationState = "grounded" | "deterministic_only" | "source_only";

// Where a claim came from. The deterministic renderer tags "deterministic"; the LLM path tags "llm".
export type ClaimOrigin = "deterministic" | "llm";

// AUTHORITATIVE: state from explicit origins. An LLM claim ⇒ grounded (LLM context is present);
// deterministic-only content ⇒ deterministic_only; nothing ⇒ source_only.
export function computeExplanationState(origins: ClaimOrigin[]): ExplanationState {
  if (origins.length === 0) return "source_only";
  return origins.includes("llm") ? "grounded" : "deterministic_only";
}

// LEGACY-ONLY fallback for pre-Stage-4 corpus artifacts written before origin/state were persisted.
// Transitional: the Stage-4 regen stamps `explanationState` + per-claim `origin` on every record and
// this heuristic is retired. Used ONLY when a record carries neither an authoritative stored state
// nor per-claim origins. Deliberately conservative: it does not distinguish grounded vs
// deterministic_only reliably (that is exactly why it is being replaced) — it only reports source_only
// vs "has claims".
export function legacyHasClaimsState(claims: unknown[] | null): ExplanationState {
  if (!claims || claims.length === 0) return "source_only";
  return "grounded";
}
