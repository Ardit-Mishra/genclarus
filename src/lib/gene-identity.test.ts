import { describe, it, expect } from "vitest";
import {
  resolveGeneIdentity,
  resolveVariantGene,
  extractPreferredSymbol,
  isCuratedSymbol,
} from "./gene-identity";

describe("isCuratedSymbol / extractPreferredSymbol", () => {
  it("treats LOC<digits> as uncurated", () => {
    expect(isCuratedSymbol("ADH1B")).toBe(true);
    expect(isCuratedSymbol("LOC126807122")).toBe(false);
  });
  it("pulls the curated symbol out of a preferredName", () => {
    expect(extractPreferredSymbol("NM_000668.5(ADH1B):c.143A>G (p.His48Arg)")).toBe("ADH1B");
    expect(extractPreferredSymbol(null)).toBeNull();
    expect(extractPreferredSymbol("NM_1(LOC999):c.1A>G")).toBeNull();
  });
});

describe("resolveGeneIdentity (ID fixtures — clarification 0.3)", () => {
  it("ID-1: all sources agree on a curated symbol → resolved", () => {
    const r = resolveGeneIdentity([
      { source: "dbsnp", symbol: "ADH1B" },
      { source: "clinvar", symbol: "ADH1B" },
      { source: "preferredName", symbol: "ADH1B" },
    ]);
    expect(r.status).toBe("resolved");
    if (r.status === "resolved") expect(r.symbol).toBe("ADH1B");
  });

  it("ID-2: only a LOC placeholder, no curated binding → unresolved", () => {
    expect(resolveGeneIdentity([{ source: "dbsnp", symbol: "LOC126807122" }]).status).toBe("unresolved");
  });

  it("ID-3: curated symbol vs a disagreeing LOC placeholder → conflicting (never silent swap)", () => {
    const r = resolveGeneIdentity([
      { source: "dbsnp", symbol: "LOC126807122" },
      { source: "preferredName", symbol: "ADH1B" },
    ]);
    expect(r.status).toBe("conflicting");
  });

  it("ID-4: two disagreeing curated sources → conflicting", () => {
    expect(
      resolveGeneIdentity([
        { source: "clinvar", symbol: "GENEA" },
        { source: "preferredName", symbol: "GENEB" },
      ]).status,
    ).toBe("conflicting");
  });
});

describe("resolveVariantGene", () => {
  it("resolves when gene + preferredName agree", () => {
    const r = resolveVariantGene("HBB", "NM_000518.5(HBB):c.20A>T (p.Glu7Val)");
    expect(r.status).toBe("resolved");
  });
  it("flags the rs1229984 LOC-vs-ADH1B case as conflicting", () => {
    const r = resolveVariantGene("LOC126807122", "NM_000668.5(ADH1B):c.143A>G (p.His48Arg)");
    expect(r.status).toBe("conflicting");
  });
});
