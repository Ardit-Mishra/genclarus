// Grounding — the deterministic second gate that turns "use only these facts" from a prompt
// request into an enforced guarantee.
//
// Two layers, deliberately separate:
//   1. parseGrounded()   — structural/schema: does the model's text parse into the claim shape,
//                          within the count/word/sentence/citation-arity limits? A failure here is
//                          the ONLY thing worth a repair retry (a terse "return valid JSON" nudge).
//   2. validateClaims()  — semantic: does every claim cite real facts, and is every number, gene
//                          symbol, protein change, classification label, condition name and required
//                          qualifier in the claim actually present in the VALUES of the facts it
//                          cites? Prohibited personal/clinical language is rejected here too. A
//                          semantic failure is never repaired — it falls straight back to source-only.
//
// The bias is intentional: any doubt rejects. An un-displayed explanation is safe; a plausible-
// sounding invented clinical claim is not. Pure and synchronous except for ground()'s orchestration.

import type { EvidenceFact } from "./evidence";
import { frequencyRenderings } from "./format-frequency";
import type { ClaimOrigin } from "./explanation-state";

// Where a claim came from. Clinical/numeric claims may originate ONLY from the deterministic renderer;
// the LLM is restricted to identity/function context, so an LLM-authored clinical claim is rejected.
// Same domain as ClaimOrigin (the persisted per-claim origin), so the two never drift.
export type ClaimSource = ClaimOrigin;

// A claim tagged with its origin — persisted on corpus records and used to compute the explanation
// state authoritatively (never from claimType). The base GroundedClaim is the LLM/wire shape.
export type OriginatedClaim = GroundedClaim & { origin: ClaimOrigin };

export type GroundedClaimType =
  | "identity"
  | "function"
  | "classification_context"
  | "condition_context"
  | "frequency_context"
  | "uncertainty";

export type GroundedClaim = {
  text: string;
  supportingFactIds: string[];
  claimType: GroundedClaimType;
};

export type GroundedExplanation = { claims: GroundedClaim[] };

const CLAIM_TYPES = new Set<string>([
  "identity",
  "function",
  "classification_context",
  "condition_context",
  "frequency_context",
  "uncertainty",
]);

const MAX_CLAIMS = 4;
const MAX_WORDS = 35;
const MIN_FACT_IDS = 1;
const MAX_FACT_IDS = 3;

// ---------------------------------------------------------------- structural / schema layer

function countSentences(text: string): number {
  // A sentence terminator is [.!?] followed by whitespace or end-of-string. This deliberately does
  // NOT fire inside "1.2%" or "p.Arg534Gln", where the period is followed by a digit/letter.
  return (text.match(/[.!?]+(?=\s|$)/g) || []).length;
}

function isValidClaim(c: unknown): c is GroundedClaim {
  if (!c || typeof c !== "object") return false;
  const { text, supportingFactIds, claimType } = c as Record<string, unknown>;
  if (typeof text !== "string" || text.trim() === "") return false;
  if (text.trim().split(/\s+/).length > MAX_WORDS) return false;
  if (countSentences(text) > 1) return false;
  if (!Array.isArray(supportingFactIds)) return false;
  if (supportingFactIds.length < MIN_FACT_IDS || supportingFactIds.length > MAX_FACT_IDS) return false;
  if (!supportingFactIds.every((id) => typeof id === "string" && id.length > 0)) return false;
  if (typeof claimType !== "string" || !CLAIM_TYPES.has(claimType)) return false;
  return true;
}

// Parse + enforce the schema only. Returns null on any structural problem (JSON, shape, limits) —
// these are the failures a repair retry is allowed to attempt to fix.
export function parseGrounded(rawText: string): GroundedExplanation | null {
  let data: unknown;
  try {
    data = JSON.parse(rawText);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const claims = (data as Record<string, unknown>).claims;
  if (!Array.isArray(claims)) return null;
  if (claims.length < 1 || claims.length > MAX_CLAIMS) return null;
  if (!claims.every(isValidClaim)) return null;
  return { claims: claims as GroundedClaim[] };
}

// ---------------------------------------------------------------- semantic layer

// Capitalized tokens the model may use without a supporting fact — databases, molecules, and common
// acronyms carry no clinical claim. Anything else in ALL CAPS is treated as a gene-like entity and
// must be grounded.
const SAFE_CAPS = new Set(
  [
    "DNA", "RNA", "MRNA", "TRNA", "CLINVAR", "DBSNP", "GNOMAD", "MYGENE", "UNIPROT", "NCBI",
    "OMIM", "HGVS", "PDB", "ATP", "ADP", "GTP", "GDP", "US", "UK", "ID", "AND", "THE", "OR",
    "BUT", "FOR", "II", "III", "IV", "VI", "VII", "VIII", "IX",
  ].map((s) => s),
);

// Ordered longest-first so "likely pathogenic" is tested before its "pathogenic" substring.
const CLASSIFICATION_LABELS = [
  "conflicting interpretations",
  "likely pathogenic",
  "likely benign",
  "uncertain significance",
  "risk factor",
  "drug response",
  "conflicting",
  "pathogenic",
  "protective",
  "uncertain",
  "benign",
];

// PERSONAL / ADVICE language — prohibited on EVERY claim (LLM and deterministic). None of these can
// legitimately appear in a ClinVar condition name or significance, so they always signal overreach.
const PROHIBITED_ADVICE: RegExp[] = [
  /\byou(r|rs)?\b/i, // personal: you, your, yours
  /\byou'?re\b/i,
  /\b(recommend|advis|suggest)\w*/i, // recommend(ed) / advise(d)/advisable / suggest(ed) — active or passive
  /\bdiagnos(e|es|ed|is|tic|ing)\b/i,
  /\bprognos(is|es|tic)\b/i,
  /\bprescrib\w*/i,
  /\b(should|must|need to|ought to)\b/i,
  /\bconsult\w*/i,
  /\bat risk\b/i,
  /\bcures?\b/i,
];

// CLINICAL-DOMAIN NOUNS — barred from LLM prose (the model must not drift into treatment/therapy
// talk), but LEGITIMATELY present in grounded condition names the deterministic renderer quotes
// verbatim (e.g. "Hypertension resistant to conventional therapy", "methotrexate response - Toxicity",
// "warfarin dose"). So they are prohibited only for source==="llm"; a deterministic claim that
// reproduces a cited condition is not giving advice.
const PROHIBITED_CLINICAL_NOUN: RegExp[] = [
  /\btreat(s|ed|ing|ment|ments)?\b/i,
  /\btherap(y|ies|eutic)\b/i,
  /\b(dose|doses|dosage|dosing)\b/i,
  /\bmedication?s?\b/i,
];

// Clinical claim types — the LLM may not author these (§2); only the deterministic renderer may.
const CLINICAL_CLAIM_TYPES = new Set<GroundedClaimType>([
  "classification_context",
  "condition_context",
  "frequency_context",
  "uncertainty",
]);

// POSITIVE population licensing (Stage-3 correction D). Correctness does NOT depend on enumerating
// every ancestry: a frequency/allele claim may name a population ONLY IF a cited numeric fact carries
// matching structured `population` metadata. We detect "the claim is making a population-scoped
// frequency statement" via the shape "<N>% ... in [the] <Capitalized/known> population/ancestry" and
// via the known-term list, then require positive licensing. The list below is DEFENCE IN DEPTH (catches
// bare mentions), not the basis of correctness — an unknown ancestry with no licensing fact is still
// rejected by the shape rule. Since no aggregate gnomAD fact carries a population today, every
// population-scoped frequency claim is currently rejected — which is correct (F-01 class).
const POPULATION_TERMS = [
  "african", "european", "east asian", "south asian", "asian", "latino",
  "admixed american", "ashkenazi", "finnish", "non-finnish", "amish",
  "middle eastern", "oceanian", "native american", "hispanic", "caucasian",
];

// A SPECIFIC-SUBGROUP scope, independent of WHICH ancestry is named: a Title-cased descriptor
// immediately before a population/ancestry/subgroup noun (e.g. "African population", "Yoruba
// ancestry", "Ashkenazi subgroup"). This catches ancestries absent from the list above WITHOUT
// enumerating them (correction D). It deliberately does NOT fire for AGGREGATE descriptors — "general
// population", "the gnomAD population", "overall population" are the non-stratified aggregate, which an
// aggregate AF fact legitimately licenses. The captured descriptor is checked against AGGREGATE_POP
// (case-insensitively) so a sentence-initial "General population…" is still treated as aggregate.
const POPULATION_SCOPE_RE = /\b([A-Z][a-z]+)\s+(?:population|populations|ancestry|ancestries|subgroup|subpopulation)\b/g;
const AGGREGATE_POP = new Set([
  "general", "overall", "total", "human", "global", "worldwide", "entire", "whole", "broad",
  "study", "gnomad", "reference", "combined", "sampled", "background", "wider", "larger", "adult",
]);

// A number written as a percentage — must be a canonical rounding of a CITED allele-frequency fact.
const PERCENT_RE = /(\d+(?:\.\d+)?)\s*%/g;
// A bare dbSNP "LOC<digits>" locus placeholder must never be promoted into authoritative prose (F-06).
const LOC_IDENTITY_RE = /\bLOC\d+\b/i;

const NUMBER_RE = /\d+(?:\.\d+)?/g;
const PROTEIN_RE = /p\.[A-Za-z0-9]+/gi;
const GENE_CAPS_RE = /\b[A-Z][A-Z0-9]{1,9}\b/g;
// A run of >=2 CONSECUTIVE Title-Case words — the shape of an invented condition name like
// "Cystic Fibrosis". Deliberately not bridged by lowercase connectors: bridging turned
// "Pathogenic for Beta-thalassemia" into a spurious "Pathogenic for Beta" run and rejected sound
// claims. Real single-capital condition names ("Ischemic stroke") are grounded by other checks.
const TITLECASE_RUN_RE = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g;

function numbers(s: string): Set<string> {
  return new Set(s.match(NUMBER_RE) ?? []);
}

// Everything the model is entitled to reference for a claim: the value AND qualifier strings of
// every fact the claim cites. Nothing else grounds the claim.
function citedCorpus(cited: EvidenceFact[]): string {
  return cited
    .flatMap((f) => [f.value, ...Object.values(f.qualifiers ?? {})])
    .join(" ")
    .toLowerCase();
}

// Returns a rejection reason string, or null if the claim is sound. (Reason is diagnostic only.)
// Applies the approved hardened order §2–§9 (§1 parse happens in parseGrounded). `subject` is the
// looked-up identifier (grounded by construction — the user asked about it and every fact describes
// it). `source` decides §2: an LLM-authored clinical claim is rejected outright; a deterministic
// (renderer) claim is allowed to be clinical and must survive the substantive checks by construction.
function claimViolation(
  claim: GroundedClaim,
  byId: Map<string, EvidenceFact>,
  subject: string,
  source: ClaimSource,
): string | null {
  const text = claim.text;
  const lower = text.toLowerCase();

  // §2 claim-type authority — clinical/numeric claims may originate ONLY from the renderer.
  if (source === "llm" && CLINICAL_CLAIM_TYPES.has(claim.claimType)) return "llm_clinical_claim";

  // §3 citation existence — every id must resolve to a real fact.
  const cited = claim.supportingFactIds.map((id) => byId.get(id));
  if (cited.some((f) => !f)) return "unknown_fact_id";
  const facts = cited as EvidenceFact[];

  const corpus = citedCorpus(facts);
  // The subject identifier is grounded by construction, so its own tokens count for entity/number
  // checks. Classifications still never draw on the subject.
  const entityCorpus = `${corpus} ${subject.toLowerCase()}`;
  const corpusNumbers = numbers(entityCorpus);

  // §4 kind-bound numeric fidelity. A PERCENT number must be a canonical rounding of a CITED
  // allele-frequency fact — never a review-star count, date, or another fact's number. Non-percent
  // numbers keep the "present in a cited value / the subject" rule (protein positions, allele counts).
  const afRenderings = new Set<string>();
  for (const f of facts)
    if (f.numeric?.kind === "af")
      for (const r of frequencyRenderings(f.numeric.rawValue)) afRenderings.add(r);
  const percentNumbers = new Set([...text.matchAll(PERCENT_RE)].map((m) => m[1]));
  for (const n of numbers(text)) {
    if (percentNumbers.has(n)) {
      if (!afRenderings.has(n)) return "unsupported_number";
    } else if (!corpusNumbers.has(n)) {
      return "unsupported_number";
    }
  }

  // §5 population anchoring — POSITIVE licensing (correction D). A population-scoped claim is allowed
  // ONLY when a cited numeric fact carries matching structured `population` metadata. Two detectors,
  // neither of which is the basis of correctness on its own:
  //  (a) shape rule — any "…in/among/of … population/ancestry/subgroup" phrasing (ancestry-agnostic);
  //  (b) known-term list — defence in depth for bare mentions ("common in Africans").
  // A named population is licensed iff some cited fact's population metadata matches it; a scoped claim
  // with NO population-bearing cited fact at all is rejected regardless of which ancestry is named.
  const licensedPops = new Set(
    facts.map((f) => f.numeric?.population?.toLowerCase()).filter((p): p is string => !!p),
  );
  const matchedTerms = POPULATION_TERMS.filter((pop) => new RegExp(`\\b${pop}\\b`).test(lower));
  for (const pop of matchedTerms) {
    if (!licensedPops.has(pop)) return "unsupported_population";
  }
  // Specific-subgroup phrasing (a Title-cased ancestry before a population noun) that is NOT an
  // aggregate descriptor requires a licensing fact — regardless of which ancestry is named.
  for (const m of text.matchAll(POPULATION_SCOPE_RE)) {
    const descriptor = m[1].toLowerCase();
    if (AGGREGATE_POP.has(descriptor)) continue; // "general/overall/gnomAD… population" = aggregate, fine
    if (!licensedPops.has(descriptor)) return "unsupported_population";
  }

  // §6 entity + identity policy.
  if (LOC_IDENTITY_RE.test(text)) return "uncurated_identity"; // never promote a LOC… placeholder
  for (const p of text.match(PROTEIN_RE) ?? [])
    if (!corpus.includes(p.toLowerCase())) return "unsupported_protein";
  for (const g of text.match(GENE_CAPS_RE) ?? []) {
    if (SAFE_CAPS.has(g.toUpperCase())) continue;
    if (!entityCorpus.includes(g.toLowerCase())) return "unsupported_entity";
  }
  for (const run of text.match(TITLECASE_RUN_RE) ?? [])
    if (!entityCorpus.includes(run.toLowerCase())) return "unsupported_condition";

  // §7 per-condition assertion integrity — a classification label must trace to a cited classification
  // fact, and a single claim may not collapse the verdicts of MORE THAN ONE condition.
  const classFacts = facts.filter((f) => f.field === "classification");
  const classValues = classFacts.map((f) => f.value.toLowerCase());
  for (const label of CLASSIFICATION_LABELS)
    if (lower.includes(label) && !classValues.some((v) => v.includes(label)))
      return "unsupported_classification";
  const citedConditions = new Set(
    classFacts.map((f) => f.qualifiers?.condition?.toLowerCase()).filter(Boolean),
  );
  if (citedConditions.size > 1) return "collapsed_condition";
  // A single-verdict classification claim may not fold together divergent significances (even for the
  // same condition). A deliberate conflict NOTICE uses claimType "condition_context" and is exempt —
  // it names each significance rather than choosing one.
  const distinctSigs = new Set(classFacts.map((f) => f.value.toLowerCase()));
  if (claim.claimType === "classification_context" && distinctSigs.size > 1) return "collapsed_condition";

  // §8 qualifier preservation — every qualifier on a cited fact must survive; no invented origin.
  for (const f of facts) {
    const q = f.qualifiers;
    if (!q) continue;
    if (q.uncertainty && !lower.includes(q.uncertainty)) return "dropped_uncertainty";
    if (q.lowPenetrance && !lower.includes("low penetrance")) return "dropped_penetrance";
    if (q.toxicity && !lower.includes("toxicity")) return "dropped_toxicity";
    if (q.classificationType === "somatic" && !lower.includes("somatic")) return "dropped_somatic";
  }
  const citedOrigins = new Set(facts.map((f) => f.qualifiers?.classificationType).filter(Boolean));
  if (/\bsomatic\b/.test(lower) && !citedOrigins.has("somatic")) return "invented_origin";

  // §9 prohibited language. Personal/advice language is barred on every claim; clinical-domain nouns
  // (therapy/treatment/dose/medication) are barred only in LLM prose — a deterministic claim quoting a
  // cited condition name that contains one is faithful data, not advice.
  if (PROHIBITED_ADVICE.some((re) => re.test(text))) return "prohibited_language";
  if (source === "llm" && PROHIBITED_CLINICAL_NOUN.some((re) => re.test(text))) return "prohibited_language";

  return null;
}

// The rejection reason for a claim (or null if sound), for diagnostics/scans. Exposed for the
// existing-corpus dry scan so each rejection can be attributed to its rule.
export function claimRejectionReason(
  evidence: EvidenceFact[],
  claim: GroundedClaim,
  subject: string,
  source: ClaimSource,
): string | null {
  const byId = new Map(evidence.map((f) => [f.id, f]));
  return claimViolation(claim, byId, subject, source);
}

// Keep only the claims that pass every check. Filtering, not all-or-nothing: one ungroundable
// sentence must not suppress the sound ones. Exposed so the renderer + explain path can validate
// deterministic and LLM claims through the identical gate.
export function validateClaims(
  evidence: EvidenceFact[],
  claims: GroundedClaim[],
  subject: string,
  source: ClaimSource,
): GroundedClaim[] {
  const byId = new Map(evidence.map((f) => [f.id, f]));
  return claims.filter((c) => claimViolation(c, byId, subject, source) === null);
}

// Single-shot pure validation: parse structurally, then drop ungrounded claims. Returns the
// surviving claims, or null when NONE survive (→ source-only fallback). `source` defaults to "llm".
export function validateGrounding(
  evidence: EvidenceFact[],
  rawText: string,
  subject = "",
  source: ClaimSource = "llm",
): GroundedExplanation | null {
  const parsed = parseGrounded(rawText);
  if (!parsed) return null;
  const claims = validateClaims(evidence, parsed.claims, subject, source);
  return claims.length ? { claims } : null;
}

// ---------------------------------------------------------------- orchestration

export type GroundResult =
  | { ok: true; explanation: GroundedExplanation }
  | { ok: false; reason: "no_output" | "parse" | "policy" };

// Drives generation → validation with EXACTLY ONE repair retry, and only for a structural/parse
// failure (§2). `generate(repair)` returns the model's raw text, or null if the provider produced
// nothing. A semantic failure is never retried — the model followed the schema and simply said
// something ungrounded; asking again wastes a slow round-trip against a free tier.
export async function ground(
  evidence: EvidenceFact[],
  generate: (repair: boolean) => Promise<string | null>,
  subject = "",
  source: ClaimSource = "llm",
): Promise<GroundResult> {
  const first = await generate(false);
  if (first === null) return { ok: false, reason: "no_output" };

  let parsed = parseGrounded(first);
  if (!parsed) {
    const repaired = await generate(true);
    parsed = repaired === null ? null : parseGrounded(repaired);
    if (!parsed) return { ok: false, reason: "parse" };
  }

  const claims = validateClaims(evidence, parsed.claims, subject, source);
  if (claims.length === 0) return { ok: false, reason: "policy" };
  return { ok: true, explanation: { claims } };
}
