// Regression fixtures for the 2026-07-28 grounding incident (Stage 2). Each fixture freezes the
// facts that matter for one confirmed defect (values transcribed from the Layer C frozen dataset)
// and pairs them with the exact bad claim the model produced. Facts are run through the REAL
// buildEvidence() so the fixtures exercise the true pipeline, not a hand-authored evidence stub.
//
// These fixtures are permanent: the baseline test asserts the bad claims currently pass the gate
// (documenting the bug), and the TARGET assertions (currently failing) become the acceptance tests
// the Stage 3 hardening must satisfy.

import type { VariantFacts, GeneFacts } from "@/lib/facts";
import type { ConditionClassification } from "@/lib/clinvar";
import type { GroundedClaimType } from "@/lib/grounding";

export function condition(o: Partial<ConditionClassification> = {}): ConditionClassification {
  return {
    condition: o.condition ?? "Some condition",
    significance: o.significance ?? "Pathogenic",
    rawSignificance: o.rawSignificance ?? o.significance ?? "Pathogenic",
    significanceRank: o.significanceRank ?? 1,
    reviewStatus: o.reviewStatus ?? "criteria provided, single submitter",
    reviewStars: o.reviewStars ?? 1,
    origin: o.origin ?? "germline",
    lastEvaluated: o.lastEvaluated ?? "2020-01-01",
  };
}

export function variant(o: Partial<VariantFacts> = {}): VariantFacts {
  return {
    kind: "variant",
    rsid: o.rsid ?? "rs0",
    gene: o.gene ?? "GENE",
    consequence: o.consequence ?? "missense variant",
    proteinChange: o.proteinChange ?? "",
    alleleCount: o.alleleCount ?? 1,
    otherAlleles: o.otherAlleles ?? [],
    variantType: o.variantType ?? "single nucleotide variant",
    preferredName: o.preferredName ?? null,
    chrom: o.chrom ?? "1",
    position: o.position ?? 1000,
    refAlt: o.refAlt ?? "A>G",
    assembly: o.assembly ?? "GRCh38",
    conditionClassifications: o.conditionClassifications ?? [condition()],
    distinctSignificances: o.distinctSignificances ?? ["Pathogenic"],
    hasSomatic: o.hasSomatic ?? false,
    hasGermline: o.hasGermline ?? true,
    gnomadAf: o.gnomadAf ?? null,
    hasClinvar: o.hasClinvar ?? true,
    hgvsId: o.hgvsId ?? "",
    variantId: o.variantId ?? null,
    uniprot: o.uniprot ?? null,
    residue: o.residue ?? null,
    sources: o.sources ?? [{ label: "dbSNP", url: "https://www.ncbi.nlm.nih.gov/snp/" }],
    retrievedAt: o.retrievedAt ?? "2026-07-28",
  };
}

export function gene(o: Partial<GeneFacts> = {}): GeneFacts {
  return {
    kind: "gene",
    symbol: o.symbol ?? "GENE",
    name: o.name ?? "",
    type: o.type ?? "protein-coding",
    summary: o.summary ?? "",
    aliases: o.aliases ?? [],
    location: o.location ?? "1p1",
    uniprot: o.uniprot ?? null,
    sources: o.sources ?? [{ label: "NCBI Gene", url: "https://www.ncbi.nlm.nih.gov/gene/" }],
    retrievedAt: o.retrievedAt ?? "2026-07-28",
  };
}

// A raw model completion (what synthesize() would return), as validateGrounding expects.
export function claimJson(
  claims: { text: string; supportingFactIds: string[]; claimType: GroundedClaimType }[],
): string {
  return JSON.stringify({ claims });
}

// ---- Confirmed-defect fixtures (frozen facts + the exact bad claim) ---------------------------

// F-01 rs4149056 (SLCO1B1) — gnomadAf 0.13572, NO population field. Bad claim invents "African population".
export const rs4149056 = variant({
  rsid: "rs4149056", gene: "SLCO1B1", proteinChange: "p.Val174Ala", gnomadAf: 0.13572,
  conditionClassifications: [condition({ condition: "Statin response", significance: "Drug response", rawSignificance: "drug response", reviewStars: 2 })],
});
export const rs4149056BadClaim = claimJson([
  { text: "This variant is a single nucleotide variant with a frequency of 14% in the African population.", supportingFactIds: ["var.gnomadAf", "var.type"], claimType: "frequency_context" },
]);

// F-05 rs2228145 (IL6R) — gnomadAf 0.304985 (30.5%). Bad claim says "3%", borrowing the 3 from review stars.
export const rs2228145 = variant({
  rsid: "rs2228145", gene: "IL6R", gnomadAf: 0.304985,
  conditionClassifications: [condition({ condition: "Asthma", significance: "risk factor", rawSignificance: "risk factor", reviewStars: 3 })],
});
export const rs2228145BadClaim = claimJson([
  { text: "This variant has a frequency of 3% in the gnomAD allele frequency dataset.", supportingFactIds: ["var.gnomadAf", "var.cond.0.reviewStars"], claimType: "frequency_context" },
]);

// F-03 rs6025 (F5) — raw "Pathogenic, low penetrance". Bad claim drops "low penetrance".
export const rs6025 = variant({
  rsid: "rs6025", gene: "F5", proteinChange: "p.Arg534Gln",
  conditionClassifications: [condition({ condition: "Thrombophilia due to activated protein C resistance", significance: "Pathogenic", rawSignificance: "Pathogenic, low penetrance", reviewStars: 2 })],
});
export const rs6025BadClaim = claimJson([
  { text: "This variant is classified as pathogenic for Thrombophilia due to activated protein C resistance.", supportingFactIds: ["var.cond.0.significance"], claimType: "classification_context" },
]);

// F-02b rs1799963 (F2) — Ischemic stroke has BOTH Pathogenic and Risk-factor assertions. Bad claim collapses to one Pathogenic AND names 3 conditions in one claim.
export const rs1799963 = variant({
  rsid: "rs1799963", gene: "F2",
  conditionClassifications: [
    condition({ condition: "Congenital prothrombin deficiency", significance: "Pathogenic", rawSignificance: "Pathogenic, low penetrance", reviewStars: 2 }),
    condition({ condition: "Ischemic stroke", significance: "Pathogenic", rawSignificance: "Pathogenic", reviewStars: 1, lastEvaluated: "2024-01-01" }),
    condition({ condition: "Ischemic stroke", significance: "risk factor", rawSignificance: "risk factor", reviewStars: 0, lastEvaluated: "2009-01-01" }),
  ],
});
export const rs1799963BadClaim = claimJson([
  { text: "This variant is classified as Pathogenic for Congenital prothrombin deficiency and Ischemic stroke.", supportingFactIds: ["var.cond.0.significance", "var.cond.1.significance"], claimType: "classification_context" },
]);

// F-04 rs1801133 (MTHFR) — condition "methotrexate response - Toxicity". Bad claim drops "Toxicity".
export const rs1801133 = variant({
  rsid: "rs1801133", gene: "MTHFR", proteinChange: "p.Ala222Val",
  conditionClassifications: [condition({ condition: "methotrexate response - Toxicity", significance: "Drug response", rawSignificance: "drug response", reviewStars: 1 })],
});
export const rs1801133BadClaim = claimJson([
  { text: "This variant has a germline origin and is associated with drug response to methotrexate.", supportingFactIds: ["var.cond.0.significance", "var.cond.0.origin"], claimType: "condition_context" },
]);

// F-06 rs1229984 (ADH1B) — dbSNP gene is uncurated "LOC126807122"; preferredName resolves ADH1B. Bad claim promotes the LOC id.
export const rs1229984 = variant({
  rsid: "rs1229984", gene: "LOC126807122", preferredName: "NM_000668.5(ADH1B):c.143A>G (p.His48Arg)",
  conditionClassifications: [condition({ condition: "Alcohol dependence", significance: "protective", rawSignificance: "protective", reviewStars: 1 })],
});
export const rs1229984BadClaim = claimJson([
  { text: "The LOC126807122 gene variant is associated with protection against alcohol dependence.", supportingFactIds: ["var.gene", "var.cond.0.significance"], claimType: "condition_context" },
]);

// ---- Positive guards (sound claims that must KEEP grounding) ----------------------------------

export const rs334 = variant({
  rsid: "rs334", gene: "HBB", proteinChange: "p.Glu7Val",
  conditionClassifications: [condition({ condition: "Sickle cell anemia", significance: "Pathogenic", rawSignificance: "Pathogenic", reviewStars: 3 })],
});
export const rs334GoodClaim = claimJson([
  { text: "This variant is classified as Pathogenic for Sickle cell anemia.", supportingFactIds: ["var.cond.0.significance"], claimType: "classification_context" },
]);

export const brca1 = gene({ symbol: "BRCA1", name: "BRCA1 DNA repair associated", summary: "This gene encodes a nuclear phosphoprotein that maintains genomic stability.", type: "protein-coding", location: "17q21.31" });
export const brca1GoodClaim = claimJson([
  { text: "BRCA1 encodes a nuclear phosphoprotein that maintains genomic stability.", supportingFactIds: ["gene.symbol", "gene.summary"], claimType: "function" },
]);

// ---- Adversarial synthetics (fabricated facts + one malicious claim, each targets one rule) -------

// C-1 global AF rewritten as a subgroup frequency (§5).
export const synthSubgroup = variant({ rsid: "rs900001", gene: "GENA", gnomadAf: 0.05, conditionClassifications: [condition({ significance: "risk factor", rawSignificance: "risk factor" })] });
export const synthSubgroupClaim = claimJson([
  { text: "This variant has a frequency of 5% in the European population.", supportingFactIds: ["var.gnomadAf"], claimType: "frequency_context" },
]);

// C-2 decimal-to-percentage slip (§4).
export const synthDecimalSlip = variant({ rsid: "rs900002", gene: "GENB", gnomadAf: 0.407 });
export const synthDecimalSlipClaim = claimJson([
  { text: "This variant has an allele frequency of 4% in gnomAD.", supportingFactIds: ["var.gnomadAf"], claimType: "frequency_context" },
]);

// C-3 same-condition divergent significances collapsed into one verdict (§7).
export const synthCollapse = variant({ rsid: "rs900003", gene: "GENC", conditionClassifications: [
  condition({ condition: "Cardiomyopathy", significance: "Pathogenic", rawSignificance: "Pathogenic" }),
  condition({ condition: "Cardiomyopathy", significance: "Benign", rawSignificance: "Benign", significanceRank: 8 }),
] });
export const synthCollapseClaim = claimJson([
  { text: "This variant is classified as pathogenic for Cardiomyopathy.", supportingFactIds: ["var.cond.0.significance", "var.cond.1.significance"], claimType: "classification_context" },
]);

// C-6 germline rewritten as somatic (§8 invented origin).
export const synthSomatic = variant({ rsid: "rs900006", gene: "GEND", conditionClassifications: [condition({ condition: "Melanoma", significance: "Pathogenic", rawSignificance: "Pathogenic", origin: "germline" })] });
export const synthSomaticClaim = claimJson([
  { text: "This variant is a somatic pathogenic classification for Melanoma.", supportingFactIds: ["var.cond.0.significance"], claimType: "classification_context" },
]);

// C-8 a frequency number borrowed from a different cited fact — review stars (§4 kind-bound).
export const synthBorrowed = variant({ rsid: "rs900008", gene: "GENE", gnomadAf: 0.3, conditionClassifications: [condition({ reviewStars: 2 })] });
export const synthBorrowedClaim = claimJson([
  { text: "This variant has a frequency of 2% in gnomAD.", supportingFactIds: ["var.gnomadAf", "var.cond.0.reviewStars"], claimType: "frequency_context" },
]);

// C-14 an UNKNOWN ancestry not in the population blacklist (correction D positive licensing).
export const synthUnknownPop = variant({ rsid: "rs900014", gene: "GENF", gnomadAf: 0.08 });
export const synthUnknownPopClaim = claimJson([
  { text: "This variant reaches 8% among the Yoruba population.", supportingFactIds: ["var.gnomadAf"], claimType: "frequency_context" },
]);

// C-15 a variant with MANY (7) condition assertions — deterministic output must keep them all (corr. C).
export const synthManyConditions = variant({
  rsid: "rs900015", gene: "GENG",
  conditionClassifications: [
    condition({ condition: "Condition Alpha", significance: "Pathogenic", rawSignificance: "Pathogenic", reviewStars: 2 }),
    condition({ condition: "Condition Beta", significance: "Likely pathogenic", rawSignificance: "Likely pathogenic", reviewStars: 1 }),
    condition({ condition: "Condition Gamma", significance: "Benign", rawSignificance: "Benign", reviewStars: 3, significanceRank: 8 }),
    condition({ condition: "Condition Delta", significance: "Uncertain significance", rawSignificance: "Uncertain significance", reviewStars: 1 }),
    condition({ condition: "Condition Epsilon", significance: "risk factor", rawSignificance: "risk factor", reviewStars: 0 }),
    condition({ condition: "Condition Zeta", significance: "drug response", rawSignificance: "drug response", reviewStars: 2 }),
    condition({ condition: "Condition Eta", significance: "protective", rawSignificance: "protective", reviewStars: 1 }),
  ],
});
