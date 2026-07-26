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

const PROHIBITED: RegExp[] = [
  /\byou(r|rs)?\b/i, // personal: you, your, yours
  /\byou'?re\b/i,
  /\bi\s+(recommend|advise|suggest)\b/i,
  /\bdiagnos(e|es|ed|is|tic|ing)\b/i,
  /\bprognos(is|es|tic)\b/i,
  /\btreat(s|ed|ing|ment|ments)?\b/i,
  /\btherap(y|ies|eutic)\b/i,
  /\b(dose|doses|dosage|dosing)\b/i,
  /\bprescrib\w*/i,
  /\bmedication?s?\b/i,
  /\b(should|must|need to|ought to)\b/i,
  /\bconsult\w*/i,
  /\bat risk\b/i,
  /\bcures?\b/i,
];

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
// `subject` is the looked-up identifier (gene symbol or rsID). It is grounded by construction —
// the user asked about it and every fact describes it — so naming it is never an invented entity.
function claimViolation(
  claim: GroundedClaim,
  byId: Map<string, EvidenceFact>,
  subject: string,
): string | null {
  // Citation: every id must resolve to a real fact.
  const cited = claim.supportingFactIds.map((id) => byId.get(id));
  if (cited.some((f) => !f)) return "unknown_fact_id";
  const facts = cited as EvidenceFact[];

  const text = claim.text;
  const lower = text.toLowerCase();

  // Prohibited personal / clinical language.
  if (PROHIBITED.some((re) => re.test(text))) return "prohibited_language";

  const corpus = citedCorpus(facts);
  // The subject identifier is grounded by construction, so its own tokens — including the digits
  // inside an rsID like "rs6025" — count as grounded for entity and number checks. Classifications
  // still never draw on the subject; those must always trace to a cited classification fact.
  const entityCorpus = `${corpus} ${subject.toLowerCase()}`;
  const allowedNumbers = numbers(entityCorpus);

  // Numbers: every number in the claim must appear among the cited facts' (or subject's) numbers.
  for (const n of numbers(text)) {
    if (!allowedNumbers.has(n)) return "unsupported_number";
  }

  // Protein-change tokens (p.Xxx###Yyy): must appear verbatim in the cited corpus.
  for (const p of text.match(PROTEIN_RE) ?? []) {
    if (!corpus.includes(p.toLowerCase())) return "unsupported_protein";
  }

  // Gene-like ALL-CAPS tokens: must be grounded (cited facts or the subject) unless explicitly safe.
  for (const g of text.match(GENE_CAPS_RE) ?? []) {
    if (SAFE_CAPS.has(g.toUpperCase())) continue;
    if (!entityCorpus.includes(g.toLowerCase())) return "unsupported_entity";
  }

  // Multi-word Title-Case runs (condition names): must be grounded in the cited corpus or subject.
  for (const run of text.match(TITLECASE_RUN_RE) ?? []) {
    if (!entityCorpus.includes(run.toLowerCase())) return "unsupported_condition";
  }

  // Classification labels: any classification word in the claim must be backed by a cited
  // classification fact whose value carries it.
  const classificationValues = facts
    .filter((f) => f.field === "classification")
    .map((f) => f.value.toLowerCase());
  for (const label of CLASSIFICATION_LABELS) {
    if (lower.includes(label) && !classificationValues.some((val) => val.includes(label))) {
      return "unsupported_classification";
    }
  }

  // Qualifier preservation: citing an uncertain/conflicting classification obliges saying so;
  // citing a somatic classification obliges naming it (germline is the unmarked default).
  for (const f of facts) {
    const u = f.qualifiers?.uncertainty;
    if (u && !lower.includes(u)) return "dropped_uncertainty";
    if (f.qualifiers?.classificationType === "somatic" && !lower.includes("somatic")) {
      return "dropped_somatic";
    }
  }

  return null;
}

// Keep only the claims that pass every check. Filtering, not all-or-nothing: one ungroundable
// sentence must not suppress the sound ones (the guarantee is that what's DISPLAYED is grounded,
// §1/§7). A claim that fails is simply not shown; the deterministic facts UI still stands alone.
function keepValidClaims(
  evidence: EvidenceFact[],
  explanation: GroundedExplanation,
  subject: string,
): GroundedClaim[] {
  const byId = new Map(evidence.map((f) => [f.id, f]));
  return explanation.claims.filter((c) => claimViolation(c, byId, subject) === null);
}

// Single-shot pure validation: parse structurally, then drop ungrounded claims. Returns the
// surviving claims, or null when NONE survive (→ source-only fallback). `subject` is the looked-up
// identifier (grounded by construction). Exposed for tests.
export function validateGrounding(
  evidence: EvidenceFact[],
  rawText: string,
  subject = "",
): GroundedExplanation | null {
  const parsed = parseGrounded(rawText);
  if (!parsed) return null;
  const claims = keepValidClaims(evidence, parsed, subject);
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
): Promise<GroundResult> {
  const first = await generate(false);
  if (first === null) return { ok: false, reason: "no_output" };

  let parsed = parseGrounded(first);
  if (!parsed) {
    const repaired = await generate(true);
    parsed = repaired === null ? null : parseGrounded(repaired);
    if (!parsed) return { ok: false, reason: "parse" };
  }

  const claims = keepValidClaims(evidence, parsed, subject);
  if (claims.length === 0) return { ok: false, reason: "policy" };
  return { ok: true, explanation: { claims } };
}
