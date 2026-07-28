// Public read API (v1) for variant corpus records. Statically prerendered from the committed corpus
// via generateStaticParams — no request-time filesystem read, no request-time inference. Returns the
// exact same PublicRecord (facts + resolved claims + provenance/factsHash) the /variant page renders.

import { corpusStore } from "@/lib/corpus";
import { toPublicRecord } from "@/lib/corpus/view";

// Known corpus ids are prerendered (generateStaticParams). dynamicParams=true so an UNKNOWN id
// invokes the handler at request time and returns the structured JSON 404 below, instead of Next's
// static HTML 404 — keeping the API's error shape consistent with /api/v1/batch. Case variants never
// reach here: src/proxy.ts 308-redirects them to the canonical id first, so the request-time path
// only ever sees genuinely-invalid canonical ids (the corpus read simply misses → null → 404).
export const dynamic = "force-static";
export const dynamicParams = true;

export async function generateStaticParams() {
  return (await corpusStore.listVariants()).map((rsid) => ({ rsid }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ rsid: string }> }) {
  const { rsid } = await params;
  const record = await corpusStore.getVariant(rsid);
  if (!record) return Response.json({ error: "Not found in corpus." }, { status: 404 });
  return Response.json(toPublicRecord(record));
}
