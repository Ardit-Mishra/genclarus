// The deterministic clinical renderer must (a) reproduce each assertion faithfully with its
// qualifiers, (b) never choose a winner among conflicts, (c) use the canonical frequency, (d) only
// assert a gene identity when curated sources agree, and (e) produce claims that pass the hardened
// gate as "deterministic" by construction.

import { describe, it, expect } from "vitest";
import { renderClinicalClaims } from "./render-clinical";
import { buildEvidence } from "./evidence";
import { validateClaims } from "./grounding";
import * as F from "@/test/fixtures/grounding-regression";
import type { VariantFacts } from "./facts";

function render(v: VariantFacts) {
  const claims = renderClinicalClaims(v);
  const evidence = buildEvidence(v);
  const survived = validateClaims(evidence, claims, `${v.rsid} ${v.gene}`, "deterministic");
  return { claims, survived };
}

// Preflight item 3 — one test per GENUINELY-PRESENT normalized tuple field. The normalized
// ConditionClassification carries: condition, significance/rawSignificance, reviewStatus, reviewStars,
// origin, lastEvaluated. It does NOT carry a per-assertion source/accession id — so none is asserted.
describe("renderClinicalClaims — complete-tuple field preservation (only genuine fields)", () => {
  const full = F.variant({
    rsid: "rs555", gene: "GENZ",
    conditionClassifications: [
      F.condition({
        condition: "Some named disorder",
        significance: "Pathogenic",
        rawSignificance: "Pathogenic, low penetrance",
        reviewStatus: "reviewed by expert panel",
        reviewStars: 3,
        origin: "germline",
        lastEvaluated: "2021-03-24",
      }),
    ],
  });
  const claimText = () => renderClinicalClaims(full).find((c) => c.claimType === "classification_context")!.text;

  it("condition — present", () => expect(claimText()).toContain("Some named disorder"));
  it("classification — present", () => expect(claimText()).toContain("Pathogenic"));
  it("penetrance qualifier — present", () => expect(claimText().toLowerCase()).toContain("low penetrance"));
  it("origin (germline/somatic) — present", () => expect(claimText().toLowerCase()).toContain("germline"));
  it("review confidence (stars) — present", () => expect(claimText()).toContain("3 review stars"));
  it("assertion date (lastEvaluated) — present", () => expect(claimText()).toContain("2021-03-24"));
  it("uncertainty qualifier — present when the significance is uncertain/conflicting", () => {
    const u = F.variant({ rsid: "rs556", gene: "GENY", conditionClassifications: [F.condition({ condition: "X disorder", significance: "Uncertain significance", rawSignificance: "Uncertain significance" })] });
    expect(renderClinicalClaims(u).map((c) => c.text).join(" ").toLowerCase()).toContain("uncertain");
  });
  it("no per-assertion source/accession id is invented (not a genuine field)", () => {
    expect(claimText()).not.toMatch(/\bSCV\d+|\bRCV\d+|accession/i);
  });
  it("the full-tuple claim still passes the hardened gate (grounded date digits)", () => {
    const { claims, survived } = render(full);
    expect(survived.length).toBe(claims.length);
  });
});

// Regressions for the two Stage-4 candidate-audit findings (silent truncation of a deterministic
// assertion). Both must render AND survive the self-validation gate — no assertion dropped.
describe("renderClinicalClaims — Stage-4 audit regressions", () => {
  it("a condition NAME containing 'therapy'/'treatment' is not a prohibited-language false positive", () => {
    // rs1799983 class: "Hypertension resistant to conventional therapy" was dropped as prohibited.
    const v = F.variant({
      rsid: "rs1799983c", gene: "AGT",
      conditionClassifications: [
        F.condition({ condition: "Hypertension resistant to conventional therapy", significance: "Pathogenic", rawSignificance: "Pathogenic", reviewStars: 0 }),
        F.condition({ condition: "Salt-losing nephropathy", significance: "Benign", rawSignificance: "Benign", significanceRank: 8 }),
      ],
    });
    const { claims, survived } = render(v);
    expect(survived.length).toBe(claims.length); // nothing dropped
    expect(claims.map((c) => c.text).join(" ")).toContain("Hypertension resistant to conventional therapy");
  });

  it("a PGx toxicity conflict keeps the toxicity qualifier and separates distinct endpoints", () => {
    // rs3918290 class: base-grouping conflated "…- Toxicity" with the plain endpoint and dropped toxicity.
    const v = F.variant({
      rsid: "rs3918290c", gene: "DPYD",
      conditionClassifications: [
        F.condition({ condition: "fluorouracil response - Toxicity", significance: "Drug response", rawSignificance: "drug response", reviewStars: 2 }),
        F.condition({ condition: "fluorouracil response - Efficacy", significance: "Pathogenic", rawSignificance: "Pathogenic", reviewStars: 1 }),
      ],
    });
    const { claims, survived } = render(v);
    expect(survived.length).toBe(claims.length); // nothing dropped
    // Two DISTINCT endpoints → two separate claims, not one conflated conflict notice.
    const condClaims = claims.filter((c) => c.claimType === "classification_context" || c.claimType === "condition_context");
    expect(condClaims.length).toBe(2);
    expect(claims.map((c) => c.text).join(" ").toLowerCase()).toContain("toxicity");
  });

  it("renders each divergent same-condition submission separately, preserving every qualifier (root A)", () => {
    // Two DISTINCT submissions for one condition that disagree: rendered as two faithful claims, never
    // merged into one that drops a submission or a qualifier, never a chosen winner.
    const v = F.variant({
      rsid: "rs1799963c", gene: "F2",
      conditionClassifications: [
        F.condition({ condition: "Ischemic stroke", significance: "Pathogenic", rawSignificance: "Pathogenic, low penetrance", reviewStars: 1 }),
        F.condition({ condition: "Ischemic stroke", significance: "risk factor", rawSignificance: "risk factor", reviewStars: 0 }),
      ],
    });
    const { claims, survived } = render(v);
    expect(survived.length).toBe(claims.length); // nothing dropped by the gate
    const cond = claims.filter((c) => c.claimType === "classification_context");
    expect(cond.length).toBe(2); // both distinct submissions rendered
    const joined = claims.map((c) => c.text).join(" ").toLowerCase();
    expect(joined).toContain("low penetrance"); // first submission's qualifier survives
    expect(joined).toContain("risk factor"); // the divergent significance is shown, not dropped
  });
});

describe("renderClinicalClaims — faithful, self-validating", () => {
  it("every rendered claim passes the hardened gate (deterministic source)", () => {
    for (const v of [F.rs4149056, F.rs2228145, F.rs6025, F.rs1799963, F.rs1801133, F.rs334]) {
      const { claims, survived } = render(v);
      expect(survived.length).toBe(claims.length); // none dropped
    }
  });

  it("preserves low penetrance (rs6025)", () => {
    const t = renderClinicalClaims(F.rs6025).map((c) => c.text).join(" ");
    expect(t.toLowerCase()).toContain("low penetrance");
  });

  it("preserves the toxicity qualifier (rs1801133)", () => {
    const t = renderClinicalClaims(F.rs1801133).map((c) => c.text).join(" ");
    expect(t.toLowerCase()).toContain("toxicity");
  });

  it("renders the canonical frequency, never a wrong magnitude (rs2228145 → 30.5%, not 3%)", () => {
    const t = renderClinicalClaims(F.rs2228145).map((c) => c.text).join(" ");
    expect(t).toContain("30.5%");
    expect(t).not.toMatch(/\b3%/);
  });

  it("never attaches a population label to the aggregate frequency (rs4149056)", () => {
    const t = renderClinicalClaims(F.rs4149056).map((c) => c.text).join(" ").toLowerCase();
    expect(t).toContain("overall allele frequency");
    expect(t).not.toContain("african");
  });

  it("renders every divergent significance for one condition as its own faithful claim (no winner, none dropped)", () => {
    const { claims, survived } = render(F.synthCollapse); // Cardiomyopathy: Pathogenic + Benign
    expect(survived.length).toBe(claims.length); // both survive the gate; nothing dropped
    const cond = claims.filter((c) => c.claimType === "classification_context");
    expect(cond.length).toBe(2);
    const joined = claims.map((c) => c.text).join(" ").toLowerCase();
    // BOTH verdicts are present — the divergence is shown, not resolved to a single chosen winner.
    expect(joined).toContain("pathogenic for cardiomyopathy");
    expect(joined).toContain("benign for cardiomyopathy");
  });

  it("preserves ALL deterministic assertions for a >5-condition variant (correction C, no truncation)", () => {
    const claims = renderClinicalClaims(F.synthManyConditions);
    // 7 distinct conditions → one classification claim each (none dropped); all cite a real fact.
    const classClaims = claims.filter((c) => c.claimType === "classification_context" || c.claimType === "condition_context");
    expect(classClaims.length).toBe(7);
    const { survived } = render(F.synthManyConditions);
    expect(survived.length).toBe(claims.length); // every rendered claim also passes the gate
    for (const cond of ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta"]) {
      expect(claims.map((c) => c.text).join(" ")).toContain(`Condition ${cond}`);
    }
  });

  it("renders a very small frequency as a labelled allele fraction, never an unlabelled 0.00%", () => {
    const tiny = { ...F.rs334, gnomadAf: 0.0000042 };
    const freq = renderClinicalClaims(tiny).find((c) => c.claimType === "frequency_context");
    expect(freq!.text.toLowerCase()).toContain("allele fraction");
    expect(freq!.text).not.toContain("0.00%");
  });

  it("asserts a gene identity only when curated sources agree", () => {
    // rs1229984: dbSNP LOC vs preferredName ADH1B disagree → NO identity claim, and no LOC in output.
    const loc = renderClinicalClaims(F.rs1229984);
    expect(loc.some((c) => c.claimType === "identity")).toBe(false);
    expect(loc.map((c) => c.text).join(" ")).not.toMatch(/LOC\d+/);
    // rs334: gene HBB, no conflict → identity claim present.
    expect(renderClinicalClaims(F.rs334).some((c) => c.claimType === "identity")).toBe(true);
  });
});
