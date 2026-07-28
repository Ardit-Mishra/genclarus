// CONTAINMENT (incident 2026-07-28 — grounding validator gap). QA Layer C confirmed that the
// grounding validator gates citation EXISTENCE but not numeric fidelity or qualifier preservation,
// so several committed corpus records display unverified content: a fabricated ancestry-specific
// frequency (Blocker) and dropped clinical qualifiers (Major). Until the validator is hardened and
// the corpus is re-generated + re-audited, we serve the affected records as SOURCE-ONLY — the
// deterministic facts, ClinVar classifications, sources and provenance all stay; only the unverified
// AI narrative is withheld. This is the smallest safety-first containment: no record is deleted, no
// unaffected fact is touched, nothing is regenerated. Fully reversible — remove an id here once its
// record has been corrected and re-verified. See docs/qa/INCIDENT-2026-07-28-grounding.md.

import type { CorpusRecord } from "./types";

// Machine-readable reason surfaced on the withheld records (fallbackReason in the PublicRecord JSON).
export const CONTAINMENT_FALLBACK_REASON = "withheld_review";

// Ids are the NORMALIZED corpus keys (rsIDs lower-cased, gene symbols upper-cased) — the same form
// FileCorpusStore reads. Each entry cites its Layer C finding.
export const CONTAINED_GENE_IDS: ReadonlySet<string> = new Set<string>([]);

export const CONTAINED_VARIANT_IDS: ReadonlySet<string> = new Set<string>([
  "rs4149056", // F-01 BLOCKER — "14% in the African population"; facts have gnomadAf only, no population field
  "rs1799963", // F-02 Major  — dropped "low penetrance" + collapsed Ischemic-stroke Pathogenic/Risk-factor
  "rs6025", //    F-03 Major  — dropped "low penetrance" (Thrombophilia / activated protein C resistance, THPH2)
  "rs1801133", // F-04 Major  — dropped methotrexate "Toxicity" qualifier
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
    aiAvailable: false,
    fallbackReason: CONTAINMENT_FALLBACK_REASON,
  };
}
