// The cache key is a correctness feature, not a performance one: a cached narrative must never
// outlive the facts, prompt, model or schema that produced it.

import { describe, it, expect, beforeEach } from "vitest";
import { cacheKey, factsHash, explain, clearExplanationCache } from "./explain";
import type { GeneFacts, VariantFacts } from "./facts";

// Stage-5 FINAL: explain() no longer calls any LLM — it renders deterministic claims only, so there
// is no synthesis boundary to mock. The tests below assert the deterministic-only orchestration.

const gene: GeneFacts = {
  kind: "gene",
  symbol: "BRCA1",
  name: "BRCA1 DNA repair associated",
  type: "protein-coding",
  summary: "This gene encodes a nuclear phosphoprotein.",
  aliases: ["FANCS"],
  location: "chr17:43,044,292–43,170,245 (−)",
  uniprot: "P38398",
  sources: [{ label: "NCBI Gene", url: "https://www.ncbi.nlm.nih.gov/gene/672" }],
  retrievedAt: "2026-07-24T00:00:00.000Z",
};

const variant: VariantFacts = {
  kind: "variant",
  rsid: "rs6025",
  gene: "F5",
  consequence: "missense variant",
  proteinChange: "p.Arg534Gln",
  uniprot: "P12259",
  residue: 534,
  alleleCount: 2,
  otherAlleles: [
    {
      proteinChange: "",
      refAlt: "C>C",
      variantId: 226007,
      significance: "Conflicting interpretations",
    },
  ],
  variantType: "single nucleotide variant",
  preferredName: "NM_000130.4(F5):c.1601G>A (p.Arg534Gln)",
  chrom: "1",
  position: 169549811,
  refAlt: "C>T",
  assembly: "GRCh38",
  conditionClassifications: [
    {
      condition: "Thrombophilia due to activated protein C resistance (THPH2)",
      significance: "Pathogenic",
      rawSignificance: "Pathogenic/Pathogenic, low penetrance",
      significanceRank: 0,
      reviewStatus: "criteria provided, multiple submitters, no conflicts",
      reviewStars: 2,
      origin: "germline",
      lastEvaluated: "2023-07-12",
    },
  ],
  distinctSignificances: ["Pathogenic"],
  hasSomatic: false,
  hasGermline: true,
  gnomadAf: 0.0123,
  hasClinvar: true,
  hgvsId: "chr1:g.169519049C>T",
  variantId: 642,
  sources: [{ label: "dbSNP", url: "https://www.ncbi.nlm.nih.gov/snp/rs6025" }],
  retrievedAt: "2026-07-24T00:00:00.000Z",
};

describe("factsHash", () => {
  it("is stable for identical facts", () => {
    expect(factsHash(gene)).toBe(factsHash({ ...gene }));
  });

  it("ignores changes the model never sees", () => {
    // A fresh retrieval stamp or an extra source link cannot change the narrative, so it must
    // not throw away a perfectly good cached one.
    expect(factsHash({ ...gene, retrievedAt: "2027-01-01T00:00:00.000Z" })).toBe(factsHash(gene));
    expect(factsHash({ ...gene, sources: [] })).toBe(factsHash(gene));
  });

  it("changes when the biology changes", () => {
    expect(factsHash({ ...gene, summary: "A different summary." })).not.toBe(factsHash(gene));
  });

  it("changes when a ClinVar classification changes", () => {
    const reclassified: VariantFacts = {
      ...variant,
      conditionClassifications: [
        { ...variant.conditionClassifications[0], significance: "Uncertain significance" },
      ],
    };
    // The scenario this exists for: ClinVar reclassifies a variant and yesterday's confident
    // explanation is now wrong. It must not be served.
    expect(factsHash(reclassified)).not.toBe(factsHash(variant));
  });
});

describe("cacheKey", () => {
  it("includes the identifier, fact hash, prompt, model and schema versions", () => {
    const parts = cacheKey(gene).split("|");
    expect(parts[0]).toBe("gene");
    expect(parts[1]).toBe("BRCA1");
    expect(parts[2]).toBe(factsHash(gene));
    expect(parts).toHaveLength(6);
    expect(parts.every(Boolean)).toBe(true);
  });

  it("separates genes from variants that share a name", () => {
    expect(cacheKey(gene)).not.toBe(cacheKey(variant));
  });
});

// Stage-5 FINAL: the explanation is fully deterministic + sourced. No LLM is consulted, so nothing can
// hallucinate an ungrounded identity/function fact. Every claim is origin "deterministic"; aiAvailable
// is always false; results are cached by construction (pure render, safe to reuse).
describe("explain — fully deterministic (no LLM)", () => {
  beforeEach(() => clearExplanationCache());

  it("renders a deterministic identity claim for a gene, faithful to its type (deterministic_only)", async () => {
    const r = await explain(gene);
    expect(r.state).toBe("deterministic_only");
    expect(r.aiAvailable).toBe(false);
    expect(r.fallbackReason).toBeNull();
    expect(r.claims).not.toBeNull();
    expect(r.claims!.every((c) => c.origin === "deterministic")).toBe(true);
    // BRCA1 is protein-coding → labelled as such, never an invented function/location.
    expect(r.claims!.map((c) => c.text).join(" ")).toContain("BRCA1 is a human protein-coding gene");
  });

  it("labels a pseudogene as a pseudogene, never as an active enzyme (DDX11L1 class)", async () => {
    const pseudo: GeneFacts = { ...gene, symbol: "DDX11L1", type: "pseudo", summary: "" };
    const r = await explain(pseudo);
    const text = r.claims!.map((c) => c.text).join(" ");
    expect(text).toContain("DDX11L1 is a human pseudogene");
    expect(text.toLowerCase()).not.toContain("helicase"); // no fabricated enzymatic function
  });

  it("renders deterministic clinical statements for a variant (deterministic_only)", async () => {
    const r = await explain(variant);
    expect(r.state).toBe("deterministic_only");
    expect(r.aiAvailable).toBe(false);
    expect(r.claims!.length).toBeGreaterThan(0);
    // Low-penetrance qualifier from the raw significance is preserved deterministically.
    expect(r.claims!.map((c) => c.text).join(" ").toLowerCase()).toContain("low penetrance");
  });

  it("caches the deterministic result (second call served from cache)", async () => {
    const first = await explain(gene);
    const second = await explain(gene);
    expect(second.cached).toBe(true);
    expect(second.claims).toEqual(first.claims);
  });
});
