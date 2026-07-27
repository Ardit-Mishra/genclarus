// Genclarus — progressive AlphaMissense pathogenicity lookup for a single substitution. Kept off
// /api/variant's response so the verified ClinVar facts render immediately; the page fetches this a
// beat later (the same progressive pattern as /api/explain). The ~megabyte AlphaMissense CSV is
// read server-side, so only the small {score, class} reaches the client.

import { resolveAlphaMissense } from "@/lib/alphamissense";
import { jsonError } from "@/lib/request";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let uniprot: unknown;
  let proteinChange: unknown;
  try {
    const body = (await request.json()) as { uniprot?: unknown; proteinChange?: unknown };
    uniprot = body.uniprot;
    proteinChange = body.proteinChange;
  } catch {
    return jsonError(400, "Invalid request.");
  }

  const alphaMissense = await resolveAlphaMissense(
    typeof uniprot === "string" ? uniprot : null,
    typeof proteinChange === "string" ? proteinChange : null,
  );
  return Response.json({ alphaMissense });
}
