// Permanent regression suite — 2026-07-28 grounding incident (Stage 3 acceptance). The frozen facts
// and offending claim text in the fixtures are IMMUTABLE evidence and are never edited. Confirmed bad
// claims are validated as source "deterministic" so the SPECIFIC substantive rule (not §2 claim-type
// authority) is what rejects them — proving each hardened defense, not just that something caught it.
// The pre-fix baseline (bad claims grounded) is preserved in docs/qa/STAGE2-BASELINE.md.

import { describe, it, expect } from "vitest";
import { buildEvidence } from "@/lib/evidence";
import { validateGrounding, claimRejectionReason, type ClaimSource } from "@/lib/grounding";
import type { Facts } from "@/lib/facts";
import * as F from "@/test/fixtures/grounding-regression";

function survivingTexts(facts: Facts, rawClaims: string, source: ClaimSource): string[] {
  const evidence = buildEvidence(facts);
  const subject = facts.kind === "gene" ? facts.symbol : `${facts.rsid} ${facts.gene}`;
  return validateGrounding(evidence, rawClaims, subject, source)?.claims.map((c) => c.text) ?? [];
}
const firstText = (json: string): string => JSON.parse(json).claims[0].text as string;
const grounds = (facts: Facts, raw: string, source: ClaimSource = "deterministic"): boolean =>
  survivingTexts(facts, raw, source).includes(firstText(raw));
function reason(facts: Facts, raw: string, source: ClaimSource = "deterministic"): string | null {
  const evidence = buildEvidence(facts);
  const subject = facts.kind === "gene" ? facts.symbol : `${facts.rsid} ${facts.gene}`;
  const claim = JSON.parse(raw).claims[0];
  return claimRejectionReason(evidence, claim, subject, source);
}

// [record, facts, badClaim, expected rejection reason]
const DEFECTS: [string, Facts, string, string][] = [
  ["F-01 rs4149056 fabricated African population", F.rs4149056, F.rs4149056BadClaim, "unsupported_population"],
  ["F-05 rs2228145 '3%' borrowed from stars", F.rs2228145, F.rs2228145BadClaim, "unsupported_number"],
  ["F-03 rs6025 dropped low penetrance", F.rs6025, F.rs6025BadClaim, "dropped_penetrance"],
  ["F-02b rs1799963 collapsed conditions", F.rs1799963, F.rs1799963BadClaim, "collapsed_condition"],
  ["F-04 rs1801133 dropped toxicity", F.rs1801133, F.rs1801133BadClaim, "dropped_toxicity"],
  ["F-06 rs1229984 promoted LOC identity", F.rs1229984, F.rs1229984BadClaim, "uncurated_identity"],
];

describe("grounding regression — confirmed defects are now rejected (was the Stage-2 red baseline)", () => {
  for (const [label, facts, bad, expected] of DEFECTS) {
    it(`rejects ${label} via ${expected}`, () => {
      expect(grounds(facts, bad)).toBe(false);
      expect(reason(facts, bad)).toBe(expected);
    });
  }
});

describe("grounding regression — adversarial synthetics", () => {
  const SYNTH: [string, Facts, string, string][] = [
    ["C-1 subgroup frequency", F.synthSubgroup, F.synthSubgroupClaim, "unsupported_population"],
    ["C-2 decimal→percent slip", F.synthDecimalSlip, F.synthDecimalSlipClaim, "unsupported_number"],
    ["C-3 collapsed same-condition divergence", F.synthCollapse, F.synthCollapseClaim, "collapsed_condition"],
    ["C-6 germline→somatic", F.synthSomatic, F.synthSomaticClaim, "invented_origin"],
    ["C-8 number borrowed from stars", F.synthBorrowed, F.synthBorrowedClaim, "unsupported_number"],
    ["C-14 unknown ancestry (not in blacklist)", F.synthUnknownPop, F.synthUnknownPopClaim, "unsupported_population"],
  ];
  for (const [label, facts, bad, expected] of SYNTH) {
    it(`rejects ${label} via ${expected}`, () => {
      expect(reason(facts, bad)).toBe(expected);
    });
  }
});

describe("grounding regression — positive guards (must stay grounded)", () => {
  it("rs334 sound Pathogenic/Sickle-cell claim grounds (deterministic)", () => {
    expect(grounds(F.rs334, F.rs334GoodClaim, "deterministic")).toBe(true);
  });
  it("BRCA1 sound function claim grounds as LLM output", () => {
    expect(grounds(F.brca1, F.brca1GoodClaim, "llm")).toBe(true);
  });
});
