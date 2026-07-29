import { describe, it, expect } from "vitest";
import { formatAf, frequencyRenderings, starsRenderings, afDisplay } from "./format-frequency";

// Correction B — boundary tests immediately below, equal to, and above every precision threshold.
// Thresholds (as %): 1 (one-decimal) and 0.01 (two-decimal); below 0.01% → labelled raw fraction.
describe("afDisplay — precision-threshold boundaries", () => {
  const at1 = 0.01; // 1.00%
  const at001 = 0.0001; // 0.01%
  it("just below 1% → two decimals, percent unit", () => {
    const d = afDisplay(0.0099); // 0.99%
    expect(d.unit).toBe("percent");
    expect(d.display).toBe("0.99%");
  });
  it("exactly 1% → one decimal", () => {
    expect(afDisplay(at1).display).toBe("1.0%");
    expect(afDisplay(at1).unit).toBe("percent");
  });
  it("just above 1% → one decimal", () => {
    expect(afDisplay(0.0101).display).toBe("1.0%");
  });
  it("just below 0.01% → labelled raw fraction, never an unlabelled/`0.00%` number", () => {
    const d = afDisplay(0.00009); // 0.009%
    expect(d.unit).toBe("fraction");
    expect(d.canonicalPercent).toBeNull();
    expect(d.display).toContain("allele fraction");
    expect(d.display).not.toMatch(/%/);
  });
  it("exactly 0.01% → still a percentage (two decimals)", () => {
    expect(afDisplay(at001).display).toBe("0.01%");
    expect(afDisplay(at001).unit).toBe("percent");
  });
  it("just above 0.01% → two decimals percent", () => {
    expect(afDisplay(0.00011).unit).toBe("percent");
  });
  it("a very small fraction never yields a percentage token to license a % claim", () => {
    const r = frequencyRenderings(0.0000042);
    // raw fraction present; no percent number derived (so no '%' claim can validate)
    expect(r.has(String(0.0000042))).toBe(true);
    expect([...r].some((s) => s.includes("%"))).toBe(false);
  });
});

describe("formatAf — canonical, 1 decimal >=1%", () => {
  it("renders 0.304985 as 30.5%, never 3%", () => {
    expect(formatAf(0.304985)).toBe("30.5%");
  });
  it("renders 0.13572 as 13.6%", () => {
    expect(formatAf(0.13572)).toBe("13.6%");
  });
  it("uses two decimals below 1%", () => {
    expect(formatAf(0.0042)).toBe("0.42%");
  });
});

describe("frequencyRenderings — derived, kind-bound acceptance set", () => {
  it("accepts the 1-decimal and integer roundings, rejects a wrong magnitude", () => {
    const r = frequencyRenderings(0.304985);
    expect(r.has("30.5")).toBe(true);
    expect(r.has("30")).toBe(true);
    expect(r.has("3")).toBe(false); // the F-05 bug: a borrowed "3" must NOT validate
  });
  it("accepts 13.6 and 14 for 0.13572 (the '14%' was a legit rounding — only the ancestry was invented)", () => {
    const r = frequencyRenderings(0.13572);
    expect(r.has("13.6")).toBe(true);
    expect(r.has("14")).toBe(true);
  });
  it("includes the raw fraction", () => {
    expect(frequencyRenderings(0.304985).has("0.304985")).toBe(true);
  });
});

describe("starsRenderings", () => {
  it("accepts the count and the of-4 denominator only", () => {
    const r = starsRenderings(3);
    expect(r.has("3")).toBe(true);
    expect(r.has("4")).toBe(true);
    expect(r.has("30")).toBe(false);
  });
});
