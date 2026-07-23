// Single source of truth for the versions echoed in API `meta` responses. These also become
// part of the cache key once version-aware caching lands (Phase 4) — bumping any of these
// invalidates cached explanations generated under the old prompt/model/schema.

// Bump when the synthesis prompts (system/user messages) change meaningfully.
export const PROMPT_VERSION = "1.0.0";

// The NIM model id actually called — mirrors src/lib/nim.ts, which imports this constant so the
// two can never drift apart.
export const MODEL_ID =
  process.env.NIM_MODEL || "nvidia/llama-3.3-nemotron-super-49b-v1.5";

// Bump when the shape of the JSON returned by /api/gene or /api/variant changes.
export const OUTPUT_SCHEMA_VERSION = "1.0.0";
