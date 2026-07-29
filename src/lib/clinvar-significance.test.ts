import { describe, it, expect } from "vitest";
import { parseSignificance, parseCondition, normalizeOrigin } from "./clinvar-significance";

describe("parseSignificance", () => {
  it("preserves low penetrance and keeps the raw string", () => {
    const p = parseSignificance("Pathogenic, low penetrance");
    expect(p.base).toBe("pathogenic");
    expect(p.lowPenetrance).toBe(true);
    expect(p.raw).toBe("Pathogenic, low penetrance");
  });

  it("classifies conflicting and exposes the uncertainty qualifier", () => {
    const p = parseSignificance("Conflicting interpretations of pathogenicity");
    expect(p.base).toBe("conflicting");
    expect(p.uncertainty).toBe("conflicting");
  });

  it("classifies uncertain significance", () => {
    const p = parseSignificance("Uncertain significance");
    expect(p.base).toBe("uncertain");
    expect(p.uncertainty).toBe("uncertain");
    expect(p.lowPenetrance).toBe(false);
  });

  it("distinguishes likely-pathogenic from pathogenic", () => {
    expect(parseSignificance("Likely pathogenic").base).toBe("likely_pathogenic");
    expect(parseSignificance("Pathogenic").base).toBe("pathogenic");
  });

  it("exposes risk factor and drug response flags separately from base", () => {
    const rf = parseSignificance("risk factor");
    expect(rf.base).toBe("risk_factor");
    expect(rf.riskFactor).toBe(true);
    const dr = parseSignificance("drug response");
    expect(dr.base).toBe("drug_response");
    expect(dr.drugResponse).toBe(true);
  });

  it("classifies protective", () => {
    expect(parseSignificance("protective").base).toBe("protective");
  });

  it("never throws on empty/garbage input", () => {
    expect(parseSignificance("").base).toBe("other");
    expect(parseSignificance("").raw).toBe("");
  });
});

describe("parseCondition", () => {
  it("extracts the Toxicity qualifier and the base condition", () => {
    const c = parseCondition("methotrexate response - Toxicity");
    expect(c.toxicity).toBe(true);
    expect(c.base).toBe("methotrexate response");
    expect(c.raw).toBe("methotrexate response - Toxicity");
  });

  it("extracts efficacy and dosage qualifiers", () => {
    expect(parseCondition("warfarin response - Efficacy").efficacy).toBe(true);
    expect(parseCondition("codeine response - Dosage").dosage).toBe(true);
  });

  it("leaves an ordinary condition untouched", () => {
    const c = parseCondition("Sickle cell anemia");
    expect(c.toxicity).toBe(false);
    expect(c.base).toBe("Sickle cell anemia");
  });
});

describe("normalizeOrigin", () => {
  it("maps germline/somatic and folds everything else to unknown", () => {
    expect(normalizeOrigin("germline")).toBe("germline");
    expect(normalizeOrigin("somatic")).toBe("somatic");
    expect(normalizeOrigin("")).toBe("unknown");
    expect(normalizeOrigin("not provided")).toBe("unknown");
  });
});
