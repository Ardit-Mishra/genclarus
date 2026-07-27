// Public read API (v1) for variant corpus records. Statically prerendered from the committed corpus
// via generateStaticParams — no request-time filesystem read, no request-time inference. Returns the
// exact same PublicRecord (facts + resolved claims + provenance/factsHash) the /variant page renders.

import { corpusStore } from "@/lib/corpus";
import { toPublicRecord } from "@/lib/corpus/view";

export const dynamic = "force-static";
export const dynamicParams = false;

export async function generateStaticParams() {
  return (await corpusStore.listVariants()).map((rsid) => ({ rsid }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ rsid: string }> }) {
  const { rsid } = await params;
  const record = await corpusStore.getVariant(rsid);
  if (!record) return Response.json({ error: "Not found in corpus." }, { status: 404 });
  return Response.json(toPublicRecord(record));
}
