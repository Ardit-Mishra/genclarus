// The grounding layer is Phase 3's guarantee made mechanical: clinical facts never come from the
// LLM, and any generated claim that cites nothing, cites the wrong thing, states a number/entity/
// classification not in its cited evidence, drops a required qualifier, or uses prohibited personal/
// clinical language is not displayed — it falls back to the deterministic source-only UI.
//
// Every rejection test asserts the same thing: the offending output yields `null` (→ fallback).

import { describe, it, expect, vi } from "vitest";
import { validateGrounding, ground } from "./grounding";
import type { EvidenceFact } from "./evidence";

const evidence: EvidenceFact[] = [
  { id: "var.gene", source: "dbsnp", field: "gene", value: "F5" },
  { id: "var.protein", source: "clinvar", field: "protein change", value: "p.Arg534Gln" },
  {
    id: "var.gnomadAf",
    source: "gnomad",
    field: "frequency",
    value: "1.2% (gnomAD allele frequency 0.0123)",
  },
  {
    id: "var.cond.0.significance",
    source: "clinvar",
    field: "classification",
    value: "Pathogenic",
    qualifiers: {
      condition: "Thrombophilia due to activated protein C resistance",
      classificationType: "germline",
    },
  },
  {
    id: "var.cond.1.significance",
    source: "clinvar",
    field: "classification",
    value: "Uncertain significance",
    qualifiers: { condition: "Recurrent pregnancy loss", uncertainty: "uncertain" },
  },
];

type Claim = {
  text: string;
  supportingFactIds: string[];
  claimType: string;
};

const raw = (claims: Claim[]) => JSON.stringify({ claims });
const v = (claims: Claim[]) => validateGrounding(evidence, raw(claims));

const identity: Claim = {
  text: "The F5 gene carries the p.Arg534Gln protein change.",
  supportingFactIds: ["var.gene", "var.protein"],
  claimType: "identity",
};

describe("validateGrounding — accepts sound output", () => {
  it("returns the parsed claims when every claim is grounded and clean", () => {
    const out = v([identity]);
    expect(out?.claims).toHaveLength(1);
    expect(out?.claims[0].claimType).toBe("identity");
  });

  it("accepts an uncertain classification claim that preserves the uncertainty word", () => {
    const out = v([
      {
        text: "This classification is uncertain for recurrent pregnancy loss.",
        supportingFactIds: ["var.cond.1.significance"],
        claimType: "classification_context",
      },
    ]);
    expect(out).not.toBeNull();
  });
});

describe("validateGrounding — structural rejection → fallback", () => {
  it("rejects invalid JSON", () => {
    expect(validateGrounding(evidence, "{ not json")).toBeNull();
  });
  it("rejects more than four claims", () => {
    expect(v([identity, identity, identity, identity, identity])).toBeNull();
  });
  it("rejects a claim citing zero or more than three facts", () => {
    expect(v([{ ...identity, supportingFactIds: [] }])).toBeNull();
    expect(
      v([{ ...identity, supportingFactIds: ["var.gene", "var.protein", "var.gnomadAf", "var.cond.0.significance"] }]),
    ).toBeNull();
  });
  it("rejects empty text", () => {
    expect(v([{ ...identity, text: "" }])).toBeNull();
  });
  it("rejects a claim longer than 35 words", () => {
    expect(v([{ ...identity, text: Array(40).fill("gene").join(" ") + "." }])).toBeNull();
  });
  it("rejects more than one sentence in a claim", () => {
    expect(
      v([{ text: "The F5 gene exists. It is a gene.", supportingFactIds: ["var.gene"], claimType: "identity" }]),
    ).toBeNull();
  });
  it("rejects an unknown claimType", () => {
    expect(v([{ ...identity, claimType: "speculation" }])).toBeNull();
  });
});

describe("validateGrounding — semantic rejection → fallback", () => {
  it("rejects a citation to a fact id that does not exist", () => {
    expect(v([{ ...identity, supportingFactIds: ["var.nonexistent"] }])).toBeNull();
  });

  it("rejects a number absent from the cited facts", () => {
    expect(
      v([
        {
          text: "The allele frequency is about 5.5% in the population.",
          supportingFactIds: ["var.gnomadAf"],
          claimType: "frequency_context",
        },
      ]),
    ).toBeNull();
  });

  it("rejects a protein change absent from the cited facts", () => {
    expect(
      v([
        {
          text: "The F5 gene carries the p.Gly20Arg protein change.",
          supportingFactIds: ["var.gene", "var.protein"],
          claimType: "identity",
        },
      ]),
    ).toBeNull();
  });

  it("rejects an invented gene symbol", () => {
    expect(
      v([{ text: "This variant sits in BRCA2 as well.", supportingFactIds: ["var.gene"], claimType: "identity" }]),
    ).toBeNull();
  });

  it("rejects an invented multi-word condition name", () => {
    expect(
      v([
        {
          text: "Cystic Fibrosis is one reported condition.",
          supportingFactIds: ["var.cond.0.significance"],
          claimType: "condition_context",
        },
      ]),
    ).toBeNull();
  });

  it("rejects a classification label not present in the cited classification fact", () => {
    expect(
      v([
        {
          text: "The variant is benign for that condition.",
          supportingFactIds: ["var.cond.0.significance"],
          claimType: "classification_context",
        },
      ]),
    ).toBeNull();
  });

  it("rejects dropping a required uncertainty qualifier", () => {
    expect(
      v([
        {
          text: "This classification applies to recurrent pregnancy loss.",
          supportingFactIds: ["var.cond.1.significance"],
          claimType: "classification_context",
        },
      ]),
    ).toBeNull();
  });

  it("rejects personal language", () => {
    expect(
      v([
        {
          text: "You carry a pathogenic variant for thrombophilia.",
          supportingFactIds: ["var.cond.0.significance"],
          claimType: "classification_context",
        },
      ]),
    ).toBeNull();
  });

  it("rejects a diagnostic claim", () => {
    expect(
      v([
        {
          text: "This confirms a diagnosis of thrombophilia.",
          supportingFactIds: ["var.cond.0.significance"],
          claimType: "classification_context",
        },
      ]),
    ).toBeNull();
  });

  it("rejects a treatment recommendation", () => {
    expect(
      v([
        {
          text: "Treatment with anticoagulants is advised.",
          supportingFactIds: ["var.cond.0.significance"],
          claimType: "classification_context",
        },
      ]),
    ).toBeNull();
  });
});

describe("ground — orchestration with one repair retry", () => {
  it("recovers when a structural failure is fixed by the single repair retry", async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce("not json at all")
      .mockResolvedValueOnce(raw([identity]));
    const out = await ground(evidence, generate);
    expect(out.ok).toBe(true);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate).toHaveBeenNthCalledWith(2, true); // second call is the repair attempt
  });

  it("falls back when both the initial output and the repair fail to parse", async () => {
    const generate = vi.fn().mockResolvedValue("still not json");
    const out = await ground(evidence, generate);
    expect(out.ok).toBe(false);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("does NOT repair a semantic failure — parse succeeded, so one shot only", async () => {
    const badSemantics = raw([{ ...identity, supportingFactIds: ["var.nonexistent"] }]);
    const generate = vi.fn().mockResolvedValue(badSemantics);
    const out = await ground(evidence, generate);
    expect(out.ok).toBe(false);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("falls back without repair when the provider returned nothing", async () => {
    const generate = vi.fn().mockResolvedValue(null);
    const out = await ground(evidence, generate);
    expect(out.ok).toBe(false);
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
