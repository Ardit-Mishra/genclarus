// Tier 0 public-record corpus — schema + storage contract. See docs/CORPUS-INCREMENT-1-ADR.md.
//
// A corpus record is a PRECOMPUTED, non-personalized explanation of a PUBLIC database record. It is
// the single backing artifact for the indexable pages, the /api/v1 read API, and (later) the
// embeddable widget — none of which ever run request-time inference. Records are versioned snapshots:
// regenerated only when the normalized facts or the generation versions change (never "once forever").

import type { Facts } from "../facts";
import type { GroundedClaim } from "../grounding";

// Bump when the CorpusRecord shape changes (invalidates every artifact via the refresh policy).
export const CORPUS_SCHEMA_VERSION = "1.0.0";

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

export type CorpusRecord = {
  kind: CorpusKind;
  id: string; // normalized symbol or rsid — the URL key
  facts: Facts; // deterministic public-record facts
  // Grounded explanation, OR null = a valid SOURCE-ONLY artifact (facts + provenance still complete).
  claims: GroundedClaim[] | null;
  aiAvailable: boolean;
  fallbackReason: string | null; // set when claims === null
  provenance: CorpusProvenance;
};

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
