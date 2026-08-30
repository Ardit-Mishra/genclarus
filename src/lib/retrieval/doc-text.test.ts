import { describe, it, expect } from "vitest";
import { buildDocText } from "./doc-text";
import type { GeneFacts, VariantFacts } from "../facts";
import type { CorpusRecord } from "../corpus/types";

function geneRecord(facts: GeneFacts): CorpusRecord {
  return {
    kind: "gene",
    id: facts.symbol,
    facts,
    claims: null,
    aiAvailable: false,
    fallbackReason: null,
    provenance: {
      factsHash: "x",
      promptVersion: "1",
      modelId: "m",
      schemaVersion: "1",
      corpusSchemaVersion: "1",
      generatedAt: "2026-01-01T00:00:00.000Z",
      retrievedAt: "2026-01-01T00:00:00.000Z",
      sources: [],
    },
  };
}

function variantRecord(facts: VariantFacts): CorpusRecord {
  return { ...geneRecord(facts as unknown as GeneFacts), kind: "variant", id: facts.rsid, facts };
}

const gene: GeneFacts = {
  kind: "gene",
  symbol: "HBB",
  name: "hemoglobin subunit beta",
  type: "protein-coding",
  summary: "This gene encodes beta-globin.",
  aliases: ["CD113t-C"],
  location: "chr11:5,225,464–5,229,395 (−)",
  uniprot: "P68871",
  sources: [],
  retrievedAt: "2026-01-01T00:00:00.000Z",
};

const variant: VariantFacts = {
  kind: "variant",
  rsid: "rs334",
  gene: "HBB",
  consequence: "missense variant",
  proteinChange: "p.Glu7Val",
  uniprot: null,
  residue: 7,
  alleleCount: 1,
  otherAlleles: [],
  variantType: "single nucleotide variant",
  preferredName: "NM_000518.5(HBB):c.20A>T (p.Glu7Val)",
  chrom: "11",
  position: 5227002,
  refAlt: "T>A",
  assembly: "GRCh38",
  conditionClassifications: [
    {
      condition: "Hb SS disease (SCD)",
      significance: "Pathogenic",
      rawSignificance: "Pathogenic",
      significanceRank: 0,
      reviewStatus: "criteria provided, multiple submitters, no conflicts",
      reviewStars: 2,
      origin: "germline",
      lastEvaluated: "2024-04-22",
    },
  ],
  distinctSignificances: ["Pathogenic"],
  hasSomatic: false,
  hasGermline: true,
  gnomadAf: null,
  hasClinvar: true,
  hgvsId: "chr11:g.5227002T>A",
  variantId: 15125,
  sources: [],
  retrievedAt: "2026-01-01T00:00:00.000Z",
};

describe("buildDocText", () => {
  it("includes the gene symbol, name, type, summary and aliases", () => {
    const text = buildDocText(geneRecord(gene));
    expect(text).toContain("HBB");
    expect(text).toContain("hemoglobin subunit beta");
    expect(text).toContain("protein-coding");
    expect(text).toContain("beta-globin");
    expect(text).toContain("CD113t-C");
  });

  it("includes the rsid, gene, protein change and associated conditions for a variant", () => {
    const text = buildDocText(variantRecord(variant));
    expect(text).toContain("rs334");
    expect(text).toContain("HBB");
    expect(text).toContain("p.Glu7Val");
    expect(text).toContain("Hb SS disease (SCD)");
    expect(text).toContain("Pathogenic");
  });

  it("is deterministic — the same record always produces the same text", () => {
    expect(buildDocText(geneRecord(gene))).toBe(buildDocText(geneRecord(gene)));
  });
});
