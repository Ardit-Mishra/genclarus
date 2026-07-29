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

  it("emits a conflict notice, not a chosen winner, for divergent same-condition significances", () => {
    const claims = renderClinicalClaims(F.synthCollapse);
    const conflict = claims.find((c) => c.claimType === "condition_context");
    expect(conflict).toBeTruthy();
    expect(conflict!.text.toLowerCase()).toContain("differing classifications");
    // Must not present a single "pathogenic for Cardiomyopathy" verdict.
    expect(claims.some((c) => c.claimType === "classification_context" && /pathogenic for cardiomyopathy/i.test(c.text))).toBe(false);
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
