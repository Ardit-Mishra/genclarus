// The public-facing projection of a CorpusRecord, shared by the static pages AND /api/v1 so both
// return byte-identical content (same record, same factsHash — ADR acceptance criterion). Per-claim
// citations are resolved deterministically from the stored facts (buildEvidence + claimCitations,
// exactly as /api/explain does), so provenance stays on the SEO pages without bloating the artifact.

import { buildEvidence, claimCitations } from "../evidence";
import {
  computeExplanationState,
  legacyHasClaimsState,
  type ExplanationState,
} from "../explanation-state";
import type { CorpusRecord } from "./types";

export type PublicCitation = ReturnType<typeof claimCitations>[number];
export type PublicClaim = { text: string; claimType: string; citations: PublicCitation[] };

export type PublicRecord = {
  kind: CorpusRecord["kind"];
  id: string;
  facts: CorpusRecord["facts"];
  explanation: PublicClaim[] | null; // null = source-only record
  explanationState: ExplanationState; // grounded | deterministic_only | source_only
  aiAvailable: boolean;
  fallbackReason: string | null;
  provenance: CorpusRecord["provenance"];
};

export const SITE_URL = "https://genclarus.com";

export function canonicalPath(record: PublicRecord): string {
  return record.kind === "gene" ? `/gene/${record.id}` : `/variant/${record.id}`;
}

// Structured data for the page (schema.org MedicalWebPage). Public-record, educational — never a
// clinical assertion; `citation` points at the real source records.
export function jsonLd(record: PublicRecord): Record<string, unknown> {
  const name =
    record.kind === "gene" ? `${record.id} gene` : `${record.id} — genetic variant`;
  return {
    "@context": "https://schema.org",
    "@type": "MedicalWebPage",
    name,
    url: `${SITE_URL}${canonicalPath(record)}`,
    lastReviewed: record.provenance.retrievedAt,
    citation: record.facts.sources.map((s) => s.url),
    isPartOf: { "@type": "WebSite", name: "Genclarus", url: SITE_URL },
    audience: { "@type": "Audience", audienceType: "Educational / patient information" },
  };
}

export function toPublicRecord(record: CorpusRecord): PublicRecord {
  const byId = new Map(buildEvidence(record.facts).map((f) => [f.id, f] as const));
  const explanation =
    record.claims?.map((c) => ({
      text: c.text,
      claimType: c.claimType,
      citations: claimCitations(byId, c.supportingFactIds),
    })) ?? null;
  // Prefer the state STORED at generation time (authoritative). If a claim carries an explicit origin
  // (Stage-4+ artifacts), recompute from origins as a check. Only pre-Stage-4 artifacts with neither
  // fall back to the coarse legacy heuristic. A contained record has claims === null → source_only.
  const origins = record.claims?.map((c) => c.origin).filter((o): o is NonNullable<typeof o> => !!o) ?? [];
  const allTagged = !!record.claims && origins.length === record.claims.length && origins.length > 0;
  const explanationState: ExplanationState =
    record.explanationState ??
    (allTagged ? computeExplanationState(origins) : legacyHasClaimsState(record.claims));

  return {
    kind: record.kind,
    id: record.id,
    facts: record.facts,
    explanation,
    explanationState,
    aiAvailable: record.aiAvailable,
    fallbackReason: record.fallbackReason,
    provenance: record.provenance,
  };
}
