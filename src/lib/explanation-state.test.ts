import { describe, it, expect } from "vitest";
import { computeExplanationState, legacyHasClaimsState } from "./explanation-state";

// State is computed from explicit claim ORIGINS, never guessed from claimType — the whole point of
// Stage-3 correction A (both the renderer and the LLM can emit `identity` claims).
describe("computeExplanationState (S-fixtures — clarification 0.4)", () => {
  it("S-1 deterministic clinical + LLM identity → grounded", () => {
    expect(computeExplanationState(["deterministic", "llm"])).toBe("grounded");
  });
  it("S-2 deterministic clinical + LLM function → grounded", () => {
    expect(computeExplanationState(["deterministic", "llm"])).toBe("grounded");
  });
  it("S-3 deterministic clinical only (LLM absent/rejected) → deterministic_only", () => {
    expect(computeExplanationState(["deterministic", "deterministic"])).toBe("deterministic_only");
  });
  it("S-4 deterministic identity only → deterministic_only (NOT guessed as grounded from claimType)", () => {
    // A lone deterministic identity claim must NOT be mistaken for LLM participation.
    expect(computeExplanationState(["deterministic"])).toBe("deterministic_only");
  });
  it("S-5 LLM identity only → grounded", () => {
    expect(computeExplanationState(["llm"])).toBe("grounded");
  });
  it("S-6 no claims → source_only", () => {
    expect(computeExplanationState([])).toBe("source_only");
  });
});

describe("legacyHasClaimsState (transitional, pre-Stage-4 artifacts only)", () => {
  it("reports source_only vs has-claims without guessing grounded/deterministic", () => {
    expect(legacyHasClaimsState(null)).toBe("source_only");
    expect(legacyHasClaimsState([])).toBe("source_only");
    expect(legacyHasClaimsState([{}])).toBe("grounded");
  });
});
