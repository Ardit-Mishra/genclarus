import { describe, it, expect } from "vitest";
import {
  classifySignificance,
  reviewStars,
  buildConditionClassifications,
} from "./clinvar";
import { rs6025Clinvar } from "@/test/fixtures/sources";

describe("classifySignificance", () => {
  it("does not misread 'conflicting...pathogenicity' as Pathogenic", () => {
    expect(classifySignificance("Conflicting interpretations of pathogenicity").label).toBe(
      "Conflicting interpretations",
    );
  });
  it("ranks likely pathogenic separately from pathogenic", () => {
    expect(classifySignificance("Likely pathogenic").label).toBe("Likely pathogenic");
    expect(classifySignificance("Pathogenic; risk factor").label).toBe("Pathogenic");
  });
  it("handles benign / uncertain / empty", () => {
    expect(classifySignificance("Benign").label).toBe("Benign");
    expect(classifySignificance("Uncertain significance").label).toBe("Uncertain significance");
    expect(classifySignificance("").label).toBe("Not provided");
  });
});

describe("reviewStars", () => {
  it("maps ClinVar review wording to the 0-4 star scale", () => {
    expect(reviewStars("practice guideline")).toBe(4);
    expect(reviewStars("reviewed by expert panel")).toBe(3);
    expect(reviewStars("criteria provided, multiple submitters, no conflicts")).toBe(2);
    expect(reviewStars("criteria provided, conflicting interpretations")).toBe(1);
    expect(reviewStars("criteria provided, single submitter")).toBe(1);
    expect(reviewStars("no assertion criteria provided")).toBe(0);
  });
});

describe("buildConditionClassifications", () => {
  const rcvs = [
    {
      clinical_significance: "Pathogenic",
      review_status: "criteria provided, multiple submitters, no conflicts",
      origin: "somatic",
      last_evaluated: "2024-01-05",
      conditions: { name: "Non-small cell lung carcinoma (NSCLC)" },
    },
    {
      clinical_significance: "Uncertain significance",
      review_status: "no assertion criteria provided",
      origin: "germline",
      last_evaluated: "2021-06-29",
      conditions: { name: "not specified" },
    },
    // duplicate of the first (same condition/origin/significance) but weaker review — should be dropped
    {
      clinical_significance: "Pathogenic",
      review_status: "criteria provided, single submitter",
      origin: "somatic",
      last_evaluated: "2019-02-07",
      conditions: { name: "Non-small cell lung carcinoma (NSCLC)" },
    },
    // RCV with no usable condition name — should be skipped
    {
      clinical_significance: "Benign",
      review_status: "criteria provided, single submitter",
      origin: "germline",
      conditions: {},
    },
  ];

  it("preserves per-condition rows, keeps origin, and dedups to the most authoritative", () => {
    const rows = buildConditionClassifications(rcvs);
    // one NSCLC row (deduped, 2-star kept), one 'not specified' row; the no-condition RCV skipped
    expect(rows).toHaveLength(2);
    const nsclc = rows.find((r) => r.condition.includes("NSCLC"))!;
    expect(nsclc.reviewStars).toBe(2); // kept the stronger of the two duplicates
    expect(nsclc.origin).toBe("somatic");
    expect(nsclc.significance).toBe("Pathogenic");
  });

  it("sorts informative conditions before 'not specified'", () => {
    const rows = buildConditionClassifications(rcvs);
    expect(rows[0].condition).toContain("NSCLC");
    expect(rows[rows.length - 1].condition).toBe("not specified");
  });
});

// Regression guard against the real record that exposed the defect: ClinVar returns `conditions`
// as an object for single-condition RCVs and an ARRAY for multi-condition ones. Reading only the
// first name silently discarded classifications — the exact distortion this module prevents.
describe("buildConditionClassifications — real rs6025 record", () => {
  const rcvs = (rs6025Clinvar[1] as { clinvar: { rcv: unknown } }).clinvar.rcv;

  it("keeps every condition from an RCV that asserts several", () => {
    const names = buildConditionClassifications(rcvs).map((r) => r.condition);
    // All five conditions of RCV005049305; only the first survived before the fix.
    expect(names).toContain("Ischemic stroke");
    expect(names).toContain("Thrombophilia due to activated protein C resistance (THPH2)");
    expect(names).toContain("Budd-Chiari syndrome (BDCHS)");
    expect(names).toContain("Pregnancy loss, recurrent, susceptibility to, 1 (RPRGL1)");
    expect(names).toContain("Congenital factor V deficiency");
  });

  it("preserves genuinely different verdicts for different conditions", () => {
    const rows = buildConditionClassifications(rcvs);
    const sig = (name: string) => rows.find((r) => r.condition === name)?.significance;
    expect(sig("Thrombophilia due to activated protein C resistance (THPH2)")).toBe("Pathogenic");
    expect(sig("Budd-Chiari syndrome, susceptibility to")).toBe("Risk factor");
    expect(sig("hormonal contraceptives for systemic use response - Toxicity")).toBe("Drug response");
    expect(new Set(rows.map((r) => r.significance)).size).toBeGreaterThan(2);
  });
});
