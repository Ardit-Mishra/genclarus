import { describe, it, expect } from "vitest";
import { tokenize } from "./tokenize";

describe("tokenize", () => {
  it("lowercases and splits on non-alphanumeric characters", () => {
    expect(tokenize("Hb SS disease (SCD)")).toEqual(["hb", "ss", "disease", "scd"]);
  });

  it("keeps letter+digit identifiers as single tokens", () => {
    expect(tokenize("rs334 BRCA1")).toEqual(["rs334", "brca1"]);
  });

  it("drops empty tokens from repeated punctuation", () => {
    expect(tokenize("beta-thalassemia--HBB/LCRB")).toEqual(["beta", "thalassemia", "hbb", "lcrb"]);
  });

  it("returns an empty array for empty or whitespace-only input", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize("   ")).toEqual([]);
  });
});
