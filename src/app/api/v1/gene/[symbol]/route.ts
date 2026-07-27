// Public read API (v1) for gene corpus records. Statically prerendered from the committed corpus
// via generateStaticParams — no request-time filesystem read, no request-time inference. Returns the
// exact same PublicRecord (facts + resolved claims + provenance/factsHash) the /gene page renders.

import { corpusStore } from "@/lib/corpus";
import { toPublicRecord } from "@/lib/corpus/view";

export const dynamic = "force-static";
export const dynamicParams = false;

export async function generateStaticParams() {
  return (await corpusStore.listGenes()).map((symbol) => ({ symbol }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const record = await corpusStore.getGene(symbol);
  if (!record) return Response.json({ error: "Not found in corpus." }, { status: 404 });
  return Response.json(toPublicRecord(record));
}
