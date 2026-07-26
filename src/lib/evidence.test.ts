// The evidence layer is the single source of truth Phase 3 grounds against: it is serialized into
// the prompt AND is what the validator checks claims against. Two invariants matter most — IDs are
// position/field-derived (identical facts always yield identical IDs, so citations and the cache
// stay stable), and every clinical qualifier (condition, origin, uncertainty) survives onto the
// fact the model may cite, so the validator can enforce qualifier preservation.

import { describe, it, expect } from "vitest";
import { buildEvidence, claimCitations, type EvidenceFact } from "./evidence";
import type { GeneFacts, VariantFacts } from "./facts";

const gene: GeneFacts = {
  kind: "gene",
  symbol: "BRCA1",
  name: "BRCA1 DNA repair associated",
  type: "protein-coding",
  summary: "This gene encodes a nuclear phosphoprotein.",
  aliases: ["FANCS", "RNF53"],
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
  alleleCount: 1,
  otherAlleles: [],
  variantType: "single nucleotide variant",
  preferredName: "NM_000130.4(F5):c.1601G>A (p.Arg534Gln)",
  chrom: "1",
  position: 169549811,
  refAlt: "C>T",
  assembly: "GRCh38",
  conditionClassifications: [
    {
      condition: "Thrombophilia due to activated protein C resistance",
      significance: "Pathogenic",
      rawSignificance: "Pathogenic",
      significanceRank: 0,
      reviewStatus: "criteria provided, multiple submitters, no conflicts",
      reviewStars: 2,
      origin: "germline",
      lastEvaluated: "2023-07-12",
    },
    {
      condition: "Recurrent pregnancy loss",
      significance: "Uncertain significance",
      rawSignificance: "Uncertain significance",
      significanceRank: 6,
      reviewStatus: "criteria provided, single submitter",
      reviewStars: 1,
      origin: "germline",
      lastEvaluated: "2020-01-01",
    },
  ],
  distinctSignificances: ["Pathogenic", "Uncertain significance"],
  hasSomatic: false,
  hasGermline: true,
  gnomadAf: 0.0123,
  hasClinvar: true,
  hgvsId: "chr1:g.169519049C>T",
  variantId: 642,
  sources: [{ label: "dbSNP", url: "https://www.ncbi.nlm.nih.gov/snp/rs6025" }],
  retrievedAt: "2026-07-24T00:00:00.000Z",
};

function byId(facts: ReturnType<typeof buildEvidence>) {
  return new Map(facts.map((f) => [f.id, f]));
}

describe("buildEvidence — gene", () => {
  it("emits position-derived ids with the source and value the model may cite", () => {
    const m = byId(buildEvidence(gene));
    expect(m.get("gene.summary")).toMatchObject({
      source: "mygene",
      value: "This gene encodes a nuclear phosphoprotein.",
    });
    expect(m.get("gene.name")?.value).toBe("BRCA1 DNA repair associated");
    expect(m.get("gene.type")?.value).toBe("protein-coding");
    expect(m.get("gene.location")?.value).toContain("chr17");
    expect(m.get("gene.alias.0")?.value).toBe("FANCS");
    expect(m.get("gene.alias.1")?.value).toBe("RNF53");
  });

  it("emits the gene symbol as its own citable fact", () => {
    // The symbol is the subject of nearly every claim, so it must be groundable on its own.
    const m = byId(buildEvidence(gene));
    expect(m.get("gene.symbol")).toMatchObject({ source: "mygene", field: "gene", value: "BRCA1" });
  });

  it("omits a fact entirely when its underlying value is empty", () => {
    const m = byId(buildEvidence({ ...gene, summary: "", location: "", aliases: [] }));
    expect(m.has("gene.summary")).toBe(false);
    expect(m.has("gene.location")).toBe(false);
    expect(m.has("gene.alias.0")).toBe(false);
    // A gene with a name and type is still explainable from those alone.
    expect(m.has("gene.name")).toBe(true);
  });
});

describe("buildEvidence — variant", () => {
  it("carries condition, origin and uncertainty qualifiers onto the classification fact", () => {
    const m = byId(buildEvidence(variant));
    expect(m.get("var.gene")).toMatchObject({ source: "dbsnp", value: "F5" });
    expect(m.get("var.protein")?.value).toBe("p.Arg534Gln");
    expect(m.get("var.gnomadAf")?.value).toContain("0.0123");

    const sig0 = m.get("var.cond.0.significance");
    expect(sig0?.value).toBe("Pathogenic");
    expect(sig0?.qualifiers).toMatchObject({
      condition: "Thrombophilia due to activated protein C resistance",
      classificationType: "germline",
    });
    // A confident classification carries no uncertainty qualifier…
    expect(sig0?.qualifiers?.uncertainty).toBeUndefined();

    // …but an uncertain one must, so the validator can require the word survives into the claim.
    const sig1 = m.get("var.cond.1.significance");
    expect(sig1?.value).toBe("Uncertain significance");
    expect(sig1?.qualifiers?.uncertainty).toBe("uncertain");

    expect(m.get("var.cond.0.reviewStars")?.value).toContain("2");
  });

  it("caps condition facts at eight regardless of how many ClinVar returns", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      ...variant.conditionClassifications[0],
      condition: `Condition ${i}`,
    }));
    const facts = buildEvidence({ ...variant, conditionClassifications: many });
    const sigIds = facts.filter((f) => /^var\.cond\.\d+\.significance$/.test(f.id));
    expect(sigIds).toHaveLength(8);
  });
});

describe("claimCitations", () => {
  const byId = new Map(buildEvidence(variant).map((f) => [f.id, f] as [string, EvidenceFact]));

  it("deduplicates cited facts that share a source and field into one chip", () => {
    // Two facts from the same source+field (both ClinVar classifications) → a single chip.
    const chips = claimCitations(byId, ["var.cond.0.significance", "var.cond.1.significance"]);
    expect(chips).toEqual([{ source: "clinvar", field: "classification" }]);
  });

  it("keeps facts of the same source but different fields as separate chips", () => {
    const chips = claimCitations(byId, ["var.cond.0.significance", "var.cond.0.reviewStars", "var.gene"]);
    expect(chips).toEqual([
      { source: "clinvar", field: "classification" },
      { source: "clinvar", field: "review confidence" },
      { source: "dbsnp", field: "gene" },
    ]);
  });

  it("drops ids that resolve to no fact", () => {
    expect(claimCitations(byId, ["var.ghost"])).toEqual([]);
  });
});

describe("buildEvidence — id stability", () => {
  it("derives ids from position, not content, so identical structure yields identical ids", () => {
    const idsA = buildEvidence(variant).map((f) => f.id);
    const reclassified = {
      ...variant,
      conditionClassifications: variant.conditionClassifications.map((c) => ({
        ...c,
        significance: "Benign",
      })),
    };
    const idsB = buildEvidence(reclassified).map((f) => f.id);
    expect(idsB).toEqual(idsA);
  });
});
