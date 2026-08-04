// Stage-5 re-audit regression guards (2026-08-02). Each block freezes the facts for one confirmed
// re-audit defect class (A–E) and asserts BOTH that the information now survives AND that the hardened
// gate fails CLOSED on a claim that drops it — so a future renderer/validator change can't silently
// reintroduce the defect. Facts run through the REAL buildEvidence/renderClinicalClaims/validateClaims,
// never a stub. See docs/qa/STAGE5-REAUDIT.md for the originating findings.

import { describe, it, expect } from "vitest";
import { renderClinicalClaims } from "./render-clinical";
import { buildEvidence, isClinicalFact } from "./evidence";
import { validateClaims, claimRejectionReason, type GroundedClaim } from "./grounding";
import { resolveVariantGene } from "./gene-identity";
import { variant, condition } from "@/test/fixtures/grounding-regression";
import type { VariantFacts } from "./facts";

function render(v: VariantFacts) {
  const claims = renderClinicalClaims(v);
  const survived = validateClaims(buildEvidence(v), claims, `${v.rsid} ${v.gene}`, "deterministic");
  return { claims, survived, text: claims.map((c) => c.text).join(" ").toLowerCase() };
}

// ---------------------------------------------------------------- A. condition_collapse
describe("Stage 5 · root A — distinct ClinVar submissions are never dropped", () => {
  it("renders BOTH same-name, same-significance submissions (differ by stars/origin/date)", () => {
    // rs1042522/rs334 class: name-grouping rendered only the first, dropping the rest.
    const v = variant({ rsid: "rs_lfs", gene: "TP53", conditionClassifications: [
      condition({ condition: "Li-Fraumeni syndrome 1 (LFS)", significance: "Benign", rawSignificance: "Benign", reviewStars: 2, origin: "germline", lastEvaluated: "2022-06-18" }),
      condition({ condition: "Li-Fraumeni syndrome 1 (LFS)", significance: "Benign", rawSignificance: "Benign", reviewStars: 1, origin: "unknown", lastEvaluated: "2021-12-20" }),
    ] });
    const { claims, survived, text } = render(v);
    expect(survived.length).toBe(claims.length); // nothing dropped by the gate
    expect(claims.filter((c) => c.claimType === "classification_context").length).toBe(2);
    expect(text).toContain("2021-12-20"); // the previously-dropped second submission is present
  });

  it("never erases the ONLY somatic-origin submission (rs28934578 class)", () => {
    const v = variant({ rsid: "rs_cc", gene: "TP53", conditionClassifications: [
      condition({ condition: "Colorectal cancer", significance: "Pathogenic", rawSignificance: "Pathogenic", reviewStars: 1, origin: "unknown", lastEvaluated: "2020-01-01" }),
      condition({ condition: "Colorectal cancer", significance: "Pathogenic", rawSignificance: "Pathogenic", reviewStars: 1, origin: "somatic", lastEvaluated: "2019-01-01" }),
    ] });
    const { claims, survived, text } = render(v);
    expect(survived.length).toBe(claims.length);
    expect(text).toContain("somatic"); // the somatic submission survives, preserving origin distinction
  });

  it("renders every one of many distinct conditions (rs334 class — no cap, none dropped)", () => {
    const names = ["Alpha disorder", "Beta disorder", "Gamma disorder", "Delta disorder", "Epsilon disorder", "Zeta disorder", "Eta disorder", "Theta disorder"];
    const v = variant({ rsid: "rs_many", gene: "HBB", conditionClassifications: names.map((n, i) =>
      condition({ condition: n, significance: "Pathogenic", rawSignificance: "Pathogenic", reviewStars: 1, origin: "unknown", lastEvaluated: "2021-06-30", significanceRank: i + 1 })) });
    const { claims, survived } = render(v);
    expect(survived.length).toBe(claims.length);
    expect(claims.filter((c) => c.claimType === "classification_context").length).toBe(names.length);
  });
});

// ---------------------------------------------------------------- B. efficacy/dosage qualifiers
describe("Stage 5 · root B — PGx Efficacy/Dosage qualifiers are preserved", () => {
  const pgx = variant({ rsid: "rs_pgx", gene: "VKORC1", conditionClassifications: [
    condition({ condition: "warfarin response - Dosage", significance: "Drug response", rawSignificance: "drug response", reviewStars: 3, origin: "germline", lastEvaluated: "2021-03-24" }),
    condition({ condition: "warfarin response - Efficacy", significance: "Drug response", rawSignificance: "drug response", reviewStars: 3, origin: "germline", lastEvaluated: "2021-11-19", significanceRank: 2 }),
  ] });

  it("Dosage and Efficacy each survive; the two endpoints are distinguishable (rs9923231 class)", () => {
    const { claims, survived, text } = render(pgx);
    expect(survived.length).toBe(claims.length);
    expect(text).toContain("dosage");
    expect(text).toContain("efficacy");
    const dr = claims.filter((c) => c.claimType === "classification_context");
    expect(new Set(dr.map((c) => c.text)).size).toBe(dr.length); // not collapsed to identical text
  });

  it("the gate REJECTS a claim that drops the dosage qualifier (fails closed)", () => {
    const bad: GroundedClaim = {
      text: "In ClinVar, rs_pgx is classified as Drug response for warfarin response (3 review stars, germline; last evaluated 2021-03-24).",
      supportingFactIds: ["var.cond.0.significance", "var.cond.0.reviewStars", "var.cond.0.origin", "var.cond.0.lastEvaluated"],
      claimType: "classification_context",
    };
    expect(claimRejectionReason(buildEvidence(pgx), bad, "rs_pgx VKORC1", "deterministic")).toBe("dropped_dosage");
  });
});

// ---------------------------------------------------------------- C. risk factor + non-default origin
describe("Stage 5 · root C — risk factor and maternal/inherited origin are preserved", () => {
  const rf = variant({ rsid: "rs_rf", gene: "F5", conditionClassifications: [
    condition({ condition: "Factor V deficiency", significance: "Pathogenic", rawSignificance: "Pathogenic; risk factor", reviewStars: 2, origin: "germline", lastEvaluated: "2020-03-04" }),
    condition({ condition: "DPYD-related disorder", significance: "Pathogenic", rawSignificance: "Pathogenic", reviewStars: 1, origin: "maternal", lastEvaluated: "2024-01-01", significanceRank: 2 }),
  ] });

  it("'risk factor' (rs6025) and 'maternal' (rs3918290) both survive the gate", () => {
    const { claims, survived, text } = render(rf);
    expect(survived.length).toBe(claims.length);
    expect(text).toContain("risk factor");
    expect(text).toContain("maternal");
  });

  it("the gate REJECTS a claim that drops the risk-factor qualifier (fails closed)", () => {
    const bad: GroundedClaim = {
      text: "In ClinVar, rs_rf is classified as Pathogenic for Factor V deficiency (2 review stars, germline; last evaluated 2020-03-04).",
      supportingFactIds: ["var.cond.0.significance", "var.cond.0.reviewStars", "var.cond.0.origin", "var.cond.0.lastEvaluated"],
      claimType: "classification_context",
    };
    expect(claimRejectionReason(buildEvidence(rf), bad, "rs_rf F5", "deterministic")).toBe("dropped_riskfactor");
  });
});

// ---------------------------------------------------------------- D. gene identity
describe("Stage 5 · root D — an antisense/unresolved gene is never asserted", () => {
  it("resolveVariantGene reports 'conflicting' for an antisense gene vs its curated RefSeq symbol", () => {
    expect(resolveVariantGene("HFE-AS1", "NM_000410.4(HFE):c.187C>G (p.His63Asp)").status).toBe("conflicting");
    expect(resolveVariantGene("BDNF-AS", "NM_001709.5(BDNF):c.196G>A (p.Val66Met)").status).toBe("conflicting");
  });

  it("a normal variant still resolves to its curated symbol", () => {
    expect(resolveVariantGene("F5", "NM_000130.5(F5):c.1601G>A (p.Arg534Gln)")).toMatchObject({ status: "resolved", symbol: "F5" });
  });

  it("the gate REJECTS an LLM claim naming the unresolved gene (subject withholds it)", () => {
    // Mirrors explain.ts: gene unresolved → dropped from the LLM view AND from the subject, so the
    // wrong symbol is ungrounded and rejected by §6.
    const hfe = variant({ rsid: "rs1799945", gene: "HFE-AS1", preferredName: "NM_000410.4(HFE):c.187C>G (p.His63Asp)", consequence: "missense variant" });
    const llmView = buildEvidence(hfe).filter((f) => !isClinicalFact(f)).filter((f) => f.id !== "var.gene" && f.id !== "var.type");
    const wrong: GroundedClaim = { text: "The HFE-AS1 gene is a human gene.", supportingFactIds: ["var.consequence"], claimType: "identity" };
    expect(validateClaims(llmView, [wrong], "rs1799945", "llm").length).toBe(0);
  });
});

// ---------------------------------------------------------------- F. whole-number-percent frequency
describe("Stage 5 · round-3 minor — a whole-number-percent frequency still renders + grounds", () => {
  it("does not drop the frequency claim when the percent rounds to X.0% (rs1801131/rs1801282 class)", () => {
    // 0.260381 → '26.0%' and 0.1 → '10.0%': the display token '26.0' must be an accepted rendering,
    // or the claim fails its own §4 check and the frequency statement is silently dropped.
    for (const af of [0.260381, 0.1, 0.25]) {
      const v = variant({ rsid: "rs_af", gene: "MTHFR", gnomadAf: af, conditionClassifications: [] });
      const { claims, survived, text } = render(v);
      expect(survived.length).toBe(claims.length); // frequency claim not dropped by the gate
      expect(text).toContain("overall allele frequency");
      expect(claims.some((c) => c.claimType === "frequency_context")).toBe(true);
    }
  });
});

// ---------------------------------------------------------------- E. LLM hygiene (leak + conflation)
describe("Stage 5 · root E — no clinical/condition data reaches the LLM view", () => {
  const withDrugs = variant({ rsid: "rs_e", gene: "CYP2C9", conditionClassifications: [
    condition({ condition: "warfarin response", significance: "Drug response", rawSignificance: "drug response", lastEvaluated: "2021-03-24" }),
    condition({ condition: "tolbutamide response", significance: "Drug response", rawSignificance: "drug response", lastEvaluated: "2021-03-24", significanceRank: 2 }),
  ] });

  it("the assertion-date fact is clinical, so it is withheld from the LLM (rs1057910 leak)", () => {
    const ev = buildEvidence(withDrugs);
    const dates = ev.filter((f) => f.field === "assertion date");
    expect(dates.length).toBeGreaterThan(0);
    expect(dates.every(isClinicalFact)).toBe(true);
  });

  it("the LLM view carries NO condition-scoped fact — drug names never reach the model", () => {
    const llmView = buildEvidence(withDrugs).filter((f) => !isClinicalFact(f));
    expect(llmView.some((f) => f.qualifiers?.condition)).toBe(false);
    const seen = llmView.map((f) => `${f.value} ${JSON.stringify(f.qualifiers ?? {})}`).join(" ").toLowerCase();
    expect(seen).not.toContain("warfarin");
    expect(seen).not.toContain("tolbutamide");
  });
});
