// Tier 0 public-record corpus — schema + storage contract. See docs/CORPUS-INCREMENT-1-ADR.md.
//
// A corpus record is a PRECOMPUTED, non-personalized explanation of a PUBLIC database record. It is
// the single backing artifact for the indexable pages, the /api/v1 read API, and (later) the
// embeddable widget — none of which ever run request-time inference. Records are versioned snapshots:
// regenerated only when the normalized facts or the generation versions change (never "once forever").

import type { Facts } from "../facts";
import type { GroundedClaim, OriginatedClaim } from "../grounding";
import type { ClaimOrigin, ExplanationState } from "../explanation-state";

// Bump when the CorpusRecord shape changes (invalidates every artifact via the refresh policy).
// 2.0.0 — 2026-07-28 incident: hardened validator + deterministic clinical rendering + explanation
//         state. Requires a full corpus regeneration (Stage 4) before the new artifacts are served.
export const CORPUS_SCHEMA_VERSION = "2.0.0";
export const CORPUS_SCHEMA_VERSION_V1 = "1.0.0"; // the legacy production artifacts still on disk

export type CorpusKind = "gene" | "variant";

export type CorpusSource = { label: string; url: string };

export type CorpusProvenance = {
  factsHash: string; // factsHash(facts) — stable over model-relevant facts only
  promptVersion: string; // PROMPT_VERSION at generation time
  modelId: string; // MODEL_ID
  schemaVersion: string; // OUTPUT_SCHEMA_VERSION
  corpusSchemaVersion: string; // CORPUS_SCHEMA_VERSION
  generatedAt: string; // ISO timestamp of this generation
  retrievedAt: string; // when the source facts were retrieved (from facts)
  sources: CorpusSource[]; // public source accessions / links (from facts)
};

// Explicit versioned records (preflight item 2).
//
// V1 = LEGACY artifacts currently committed under corpus/ (generated before the 2026-07-28 incident):
// claims may lack `origin`, `explanationState` may be absent, provenance corpusSchemaVersion "1.0.0".
// Read TOLERANTLY by the production FileCorpusStore. Optional fields live ONLY here.
export type CorpusClaimV1 = GroundedClaim & { origin?: ClaimOrigin };
export type CorpusRecordV1 = {
  kind: CorpusKind;
  id: string;
  facts: Facts;
  claims: CorpusClaimV1[] | null;
  explanationState?: ExplanationState; // may be absent on legacy artifacts
  aiAvailable: boolean;
  fallbackReason: string | null;
  provenance: CorpusProvenance;
};

// V2 = STRICT candidate/future artifacts (Stage-4 regen). Every claim carries `origin`;
// `explanationState` is REQUIRED and stored at generation time; provenance pins the v2 versions.
// Candidate validation (candidate-validate.ts) rejects anything that does not satisfy this shape.
export type CorpusRecordV2 = {
  kind: CorpusKind;
  id: string;
  facts: Facts;
  claims: OriginatedClaim[] | null; // each claim REQUIRES origin
  explanationState: ExplanationState; // REQUIRED — never optional on a v2 record
  aiAvailable: boolean;
  fallbackReason: string | null;
  provenance: CorpusProvenance;
};

// The production reader/consumer type is the tolerant V1 (a V2 record is assignable to it, so the
// store serves both legacy and regenerated artifacts through one interface).
export type CorpusRecord = CorpusRecordV1;

export type CorpusManifestEntry = {
  kind: CorpusKind;
  id: string;
  factsHash: string;
  hasExplanation: boolean;
  generatedAt: string;
};

export type CorpusManifest = {
  corpusSchemaVersion: string;
  generatedAt: string; // when this manifest snapshot was written
  counts: { genes: number; variants: number; withExplanation: number; sourceOnly: number };
  records: CorpusManifestEntry[];
};

// The approved-identifier manifest the generator reads (curated; superset of the validation matrix).
export type CorpusIdentifiers = { genes: string[]; variants: string[] };

// Read contract for every public-content consumer (pages, API, widget). The committed-file impl is
// FileCorpusStore; a future ObjectCorpusStore swaps in behind this same interface with no consumer
// change. Reads only — generation is a separate offline pipeline.
export interface CorpusStore {
  getGene(symbol: string): Promise<CorpusRecord | null>;
  getVariant(rsid: string): Promise<CorpusRecord | null>;
  listGenes(): Promise<string[]>;
  listVariants(): Promise<string[]>;
}
