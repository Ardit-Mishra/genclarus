// CONTAINMENT (incident 2026-07-28 — grounding validator gap). QA Layer C confirmed that the
// grounding validator gates citation EXISTENCE but not numeric fidelity or qualifier preservation,
// so committed corpus records display unverified content: fabricated ancestry-specific frequencies,
// wrong numbers, collapsed cross-condition verdicts and dropped clinical qualifiers.
//
// EXPANSION 2026-07-28: the Stage-3 hardened-validator dry scan re-validated all 173 published
// records and found 43 with >=1 claim that fails the new evidence policy (docs/qa/CORPUS-DRYSCAN.md).
// Per the standing directive — withholding ~25% of narratives is preferable to knowingly serving
// claims that fail the policy — we contain ALL 43 as SOURCE-ONLY, not just the ancestry Blockers.
// The deterministic facts, ClinVar classifications, sources and provenance all stay; only the
// unverified AI narrative is withheld. Nothing is deleted or regenerated. Fully reversible — an id is
// removed only after its record is corrected and re-audited (Stage 6/7). Set = the exact rejected set
// in docs/qa/corpus-dryscan.json.

import type { CorpusRecord } from "./types";

// Machine-readable reason surfaced on the withheld records (fallbackReason in the PublicRecord JSON).
export const CONTAINMENT_FALLBACK_REASON = "withheld_review";

// Ids are the NORMALIZED corpus keys (rsIDs lower-cased, gene symbols upper-cased) — the same form
// FileCorpusStore reads. The full set is the 43 records the dry scan rejected (2 genes + 41 variants).
export const CONTAINED_GENE_IDS: ReadonlySet<string> = new Set<string>([
  "BRCA1", // unsupported_number — "responsible for approximately 40% of inherited breast cancers"
  "GJB2", //  unsupported_number — "up to 50% of pre-lingual, recessive deafness"
]);

export const CONTAINED_VARIANT_IDS: ReadonlySet<string> = new Set<string>([
  // Fabricated ancestry-specific frequency (F-01 Blocker class).
  "rs4149056", "rs2306283", "rs3745274", "rs1042713", "rs1138272",
  // Dropped clinical qualifier (penetrance / toxicity).
  "rs6025", "rs1801133", "rs17580", "rs1800562", "rs116855232",
  // Unsupported / non-canonical number.
  "rs34637584", "rs75527207", "rs80359550", "rs4149117", "rs113993960",
  "rs121908755", "rs12721627", "rs1800896", "rs5275",
  // Collapsed cross-condition / divergent-significance verdict.
  "rs1799963", "rs1042714", "rs1045642", "rs1051730", "rs1056836",
  "rs1057910", "rs121908025", "rs121913529", "rs1695", "rs1799945",
  "rs1799983", "rs1800497", "rs1801282", "rs28897696", "rs28929474",
  "rs28934574", "rs4244285", "rs4986893", "rs662", "rs731236", "rs74315329",
  // Uncurated LOC identity promoted into prose.
  "rs887829",
]);

function isContained(record: CorpusRecord): boolean {
  const ids = record.kind === "gene" ? CONTAINED_GENE_IDS : CONTAINED_VARIANT_IDS;
  return ids.has(record.id);
}

// Source-only projection of a contained record: facts/sources/provenance untouched, AI narrative
// withheld. Non-contained records (and null) pass through unchanged.
export function applyContainment(record: CorpusRecord | null): CorpusRecord | null {
  if (!record || !isContained(record)) return record;
  return {
    ...record,
    claims: null,
    explanationState: "source_only",
    aiAvailable: false,
    fallbackReason: CONTAINMENT_FALLBACK_REASON,
  };
}
