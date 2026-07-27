// Client-safe membership check for the Tier 0 corpus (see corpus/README.md, src/lib/corpus/types.ts).
// The homepage lookup (src/app/page.tsx) is a client component, so it cannot read the filesystem
// CorpusStore at request time — it needs to know, in the browser, whether a looked-up gene/variant
// already has a published static page to link to. The manifest is small (~173 entries), so it is
// bundled directly rather than fetched: no extra request, no server round-trip.
//
// IDs here are exactly what corpus/manifest.json stores, which the generator writes via the same
// normalizeGeneSymbol (uppercase) / normalizeRsid (lowercase) used by /api/gene and /api/variant — so
// a Result's `symbol`/`rsid` (already normalized by those routes) matches these sets by plain string
// equality, no re-normalization needed here.

import manifest from "../../../corpus/manifest.json";
import type { CorpusManifest } from "./types";

const typedManifest = manifest as CorpusManifest;

export const CORPUS_GENE_IDS: ReadonlySet<string> = new Set(
  typedManifest.records.filter((r) => r.kind === "gene").map((r) => r.id),
);

export const CORPUS_VARIANT_IDS: ReadonlySet<string> = new Set(
  typedManifest.records.filter((r) => r.kind === "variant").map((r) => r.id),
);

export function hasCorpusGene(symbol: string): boolean {
  return CORPUS_GENE_IDS.has(symbol);
}

export function hasCorpusVariant(rsid: string): boolean {
  return CORPUS_VARIANT_IDS.has(rsid);
}
