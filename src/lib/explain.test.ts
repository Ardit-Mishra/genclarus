// The cache key is a correctness feature, not a performance one: a cached narrative must never
// outlive the facts, prompt, model or schema that produced it.

import { describe, it, expect } from "vitest";
import { cacheKey, factsHash } from "./explain";
import type { GeneFacts, VariantFacts } from "./facts";

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
