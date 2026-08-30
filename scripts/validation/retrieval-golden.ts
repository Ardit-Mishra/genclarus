// Golden query set for the retrieval eval (npm run measure:retrieval). Every query is a natural-
// language paraphrase — never the record's own id or exact corpus wording — of something a real
// visitor might type, checked against the ACTUAL corpus record it targets (see the `why` field,
// each traceable to committed data in corpus/gene/*.json or corpus/variant/*.json). `relevantIds`
// is usually one id; a couple of genuinely ambiguous queries list more than one acceptable answer.

export type GoldenQuery = {
  query: string;
  relevantIds: string[];
  why: string;
};

export const goldenQueries: GoldenQuery[] = [
  { query: "the sickle cell mutation", relevantIds: ["rs334"], why: "corpus condition 'Hb SS disease (SCD)'" },
  { query: "variant that causes resistance to activated protein C", relevantIds: ["rs6025"], why: "corpus condition 'Thrombophilia due to activated protein C resistance (THPH2)'" },
  { query: "why some adults can digest milk without discomfort", relevantIds: ["rs4988235"], why: "corpus condition 'LACTASE PERSISTENCE', gene MCM6" },
  { query: "breast cancer tumor suppressor gene", relevantIds: ["BRCA1"], why: "gene summary: 'tumor suppressor', BRCA1 name" },
  { query: "the p53 tumor suppressor gene", relevantIds: ["TP53"], why: "gene name 'tumor protein p53'" },
  { query: "chloride channel gene defective in cystic fibrosis", relevantIds: ["CFTR"], why: "gene summary: chloride channel; CF transmembrane conductance regulator" },
  { query: "cholesterol-carrying apolipoprotein gene", relevantIds: ["APOE"], why: "gene name 'apolipoprotein E', summary re: chylomicron/cholesterol" },
  { query: "MTHFR variant linked to folate metabolism and neural tube defects", relevantIds: ["rs1801133"], why: "corpus condition 'Neural tube defects, folate-sensitive (NTDFS)', gene MTHFR" },
  { query: "the delta F508 deletion in the CFTR gene", relevantIds: ["rs113993960"], why: "corpus proteinChange p.Phe508del, gene CFTR, condition 'Cystic fibrosis (CF)'" },
  { query: "KRAS variant seen in RASopathy syndromes", relevantIds: ["rs121913529"], why: "corpus gene KRAS, condition 'RASopathy'" },
  { query: "NOD2 variant associated with Blau syndrome", relevantIds: ["rs2066844"], why: "corpus gene NOD2, condition 'Blau syndrome (BLAUS)'" },
  { query: "beta-2 adrenergic receptor variant affecting response to salmeterol", relevantIds: ["rs1042713"], why: "corpus gene ADRB2, condition 'salmeterol response - Efficacy'" },
  { query: "long non-coding RNA gene linked to lung cancer metastasis", relevantIds: ["MALAT1"], why: "gene name 'metastasis associated lung adenocarcinoma transcript 1'" },
  { query: "the ALK receptor tyrosine kinase gene rearranged in lymphoma", relevantIds: ["ALK"], why: "gene summary: receptor tyrosine kinase, anaplastic large cell lymphomas" },
  { query: "enzyme gene involved in folate and homocysteine metabolism", relevantIds: ["MTHFR"], why: "gene summary: 'homocysteine remethylation', methylenetetrahydrofolate reductase" },
  { query: "APOE variant linked to Alzheimer's disease risk", relevantIds: ["rs429358"], why: "corpus condition 'Alzheimer disease 4 (AD4)', gene APOE" },
  { query: "APOE variant affecting cholesterol and statin response", relevantIds: ["rs7412"], why: "corpus conditions 'atorvastatin response - Efficacy', 'Hypercholesterolemia'" },
  { query: "BRCA1 frameshift variant causing hereditary breast and ovarian cancer", relevantIds: ["rs80357906"], why: "corpus proteinChange p.Gln1756Profs, condition 'Hereditary breast ovarian cancer syndrome'" },
  { query: "gene that transports oxygen and is mutated in sickle cell disease", relevantIds: ["HBB"], why: "HBB gene record; rs334 (sickle mutation) is a variant OF this gene" },
  { query: "variant used to guide methotrexate dosing", relevantIds: ["rs1801133"], why: "corpus condition 'methotrexate response - Toxicity' on the same MTHFR variant" },
];
