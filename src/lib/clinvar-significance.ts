// Pure ClinVar significance + condition qualifier parser (incident 2026-07-28 hardening).
//
// The grounding gap was that qualifiers carried in the RAW ClinVar strings ("Pathogenic, low
// penetrance", "methotrexate response - Toxicity") were silently dropped. This module extracts and
// SEPARATELY EXPOSES every meaningful qualifier so the renderer can preserve them and the validator
// can require them. It never discards the original raw string. No LLM, no I/O — deterministic.

export type BaseClassification =
  | "pathogenic"
  | "likely_pathogenic"
  | "benign"
  | "likely_benign"
  | "uncertain"
  | "conflicting"
  | "risk_factor"
  | "drug_response"
  | "protective"
  | "association"
  | "affects"
  | "other";

export type ParsedSignificance = {
  raw: string; // original ClinVar significance, NEVER discarded
  base: BaseClassification;
  lowPenetrance: boolean;
  uncertainty?: "uncertain" | "conflicting";
  riskFactor: boolean;
  drugResponse: boolean;
  toxicity: boolean; // when the significance string itself carries it (uncommon)
};

export function parseSignificance(raw: string): ParsedSignificance {
  const s = (raw || "").toLowerCase();
  const has = (t: string) => s.includes(t);

  // Order matters: "conflicting" and the "likely …" forms are tested before the plain substrings.
  let base: BaseClassification = "other";
  if (has("conflicting")) base = "conflicting";
  else if (has("likely pathogenic")) base = "likely_pathogenic";
  else if (has("likely benign")) base = "likely_benign";
  else if (has("pathogenic")) base = "pathogenic";
  else if (has("benign")) base = "benign";
  else if (has("uncertain")) base = "uncertain";
  else if (has("risk factor") || has("risk allele")) base = "risk_factor";
  else if (has("drug response") || has("drug-response")) base = "drug_response";
  else if (has("protective")) base = "protective";
  else if (has("association")) base = "association";
  else if (has("affects")) base = "affects";

  return {
    raw: raw ?? "",
    base,
    lowPenetrance: has("low penetrance"),
    uncertainty: has("conflicting") ? "conflicting" : has("uncertain") ? "uncertain" : undefined,
    riskFactor: has("risk factor") || has("risk allele"),
    drugResponse: has("drug response") || has("drug-response"),
    toxicity: has("toxicity"),
  };
}

export type ParsedCondition = {
  raw: string;
  base: string; // condition name without the trailing PGx qualifier
  toxicity: boolean; // "methotrexate response - Toxicity"
  efficacy: boolean; // "... - Efficacy"
  dosage: boolean; // "... - Dosage"
};

const CONDITION_TAIL = /\s*[-–]\s*(toxicity|efficacy|dosage|metabolism|response)\s*$/i;

export function parseCondition(raw: string): ParsedCondition {
  const r = raw ?? "";
  const s = r.toLowerCase();
  return {
    raw: r,
    base: r.replace(CONDITION_TAIL, "").trim() || r,
    toxicity: /(^|[-\s])toxicity\b/.test(s),
    efficacy: /(^|[-\s])efficacy\b/.test(s),
    dosage: /(^|[-\s])dosage\b/.test(s),
  };
}

export type OriginType = "germline" | "somatic" | "unknown";

// germline is the unmarked default; only germline/somatic carry an obligation.
export function normalizeOrigin(origin: string): OriginType {
  const o = (origin || "").toLowerCase();
  return o === "germline" || o === "somatic" ? o : "unknown";
}
