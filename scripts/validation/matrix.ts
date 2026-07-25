export type MatrixCase = {
  id: string;
  kind: "gene" | "variant";
  why: string;
  expected?: string;
};

// Expectations are deliberately recorded only where the biological fact is unambiguous enough to
// be useful as a smoke check. The live source record remains the authority for every comparison.
export const matrix: MatrixCase[] = [
  { id: "BRCA1", kind: "gene", why: "Known-good protein-coding reference; location and UniProt.", expected: "Symbol BRCA1; UniProt P38398." },
  { id: "TP53", kind: "gene", why: "Known-good tumour-suppressor reference with a long summary.", expected: "Protein-coding gene TP53." },
  { id: "CFTR", kind: "gene", why: "Known-good protein-coding reference and common disease gene.", expected: "Protein-coding gene CFTR." },
  { id: "MALAT1", kind: "gene", why: "lncRNA/non-coding gene; exercises absent protein/UniProt data.", expected: "Long non-coding RNA; no Swiss-Prot protein expected." },
  { id: "DDX11L1", kind: "gene", why: "Sparse pseudo-gene record; exercises incomplete MyGene fields." },
  { id: "LINC02825", kind: "gene", why: "Non-coding gene also observed in the dbSNP-only fixture; sparse annotations." },
  { id: "F5", kind: "gene", why: "Gene paired with Factor V Leiden multi-condition variant.", expected: "Protein-coding gene F5." },

  { id: "rs6025", kind: "variant", why: "Factor V Leiden: multi-condition RCV arrays, pathogenic/risk/uncertain/drug-response mix.", expected: "ClinVar-annotated F5 variant with more than one condition." },
  { id: "rs334", kind: "variant", why: "HBB sickle-cell allele; established pathogenic missense reference.", expected: "HBB missense allele p.Glu7Val (legacy p.Glu6Val numbering may occur)." },
  { id: "rs1801133", kind: "variant", why: "MTHFR common variant; mixed clinical assertions and high population frequency.", expected: "MTHFR C677T common variant." },
  { id: "rs1799983", kind: "variant", why: "NOS3 common variant; population-frequency and risk-factor assertions.", expected: "NOS3 Glu298Asp variant." },
  { id: "rs121913529", kind: "variant", why: "BRAF V600E; somatic/oncogenicity-oriented ClinVar assertions.", expected: "BRAF p.Val600Glu." },
  { id: "rs429358", kind: "variant", why: "APOE epsilon-defining allele; risk-factor classifications and common frequency." },
  { id: "rs7412", kind: "variant", why: "Second APOE epsilon-defining allele; protective/risk classification coverage." },
  { id: "rs1042713", kind: "variant", why: "ADRB2 pharmacogenomic allele; drug-response coverage." },
  { id: "rs2066844", kind: "variant", why: "NOD2 frameshift allele; non-SNV HGVS/consequence coverage.", expected: "NOD2 p.Leu1007fs frameshift allele." },
  { id: "rs80357906", kind: "variant", why: "BRCA1 pathogenic frameshift variant; indel coordinate/link coverage." },
  { id: "rs113993960", kind: "variant", why: "CFTR F508del; pathogenic in-frame deletion and non-SNV coverage.", expected: "CFTR p.Phe508del." },
  { id: "rs4988235", kind: "variant", why: "LCT regulatory allele; high gnomAD-frequency common variant." },
  { id: "rs1000000", kind: "variant", why: "Verified dbSNP-only fallback fixture; no ClinVar record and array-shaped dbSNP genes.", expected: "No ClinVar record; dbSNP fallback expected." },
  { id: "rs28934578", kind: "variant", why: "TP53 clinically asserted allele; conflicting-interpretation coverage." },
  { id: "rs121918472", kind: "variant", why: "ClinVar uncertain-significance coverage." },
  { id: "rs1815739", kind: "variant", why: "ACTN3 common allele; benign/likely-benign coverage." },
  { id: "rs1051730", kind: "variant", why: "CHRNA3 common risk-associated allele; non-pathogenic clinical-significance coverage." },
];
