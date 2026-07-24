// Genclarus — gene lookup API. Returns verified facts ONLY, as fast as the upstream allows.
// The plain-language narrative is fetched separately via /api/explain so a slow model can never
// hold the verified result hostage.

import { readJsonBody, extractSingleField, RequestValidationError, jsonError } from "@/lib/request";
import { getGeneFacts, normalizeGeneSymbol, FactsError } from "@/lib/facts";
import { PROMPT_VERSION, MODEL_ID, OUTPUT_SCHEMA_VERSION } from "@/lib/version";

export const dynamic = "force-dynamic";

const DISCLAIMER =
  "Educational information only — not medical advice, diagnosis, or a substitute for a healthcare professional or genetic counselor.";

export async function POST(request: Request) {
  let symbol: string;
  try {
    const body = await readJsonBody(request);
    symbol = normalizeGeneSymbol(extractSingleField(body, "gene"));
  } catch (err) {
    if (err instanceof FactsError) return jsonError(err.status, err.message);
    if (err instanceof RequestValidationError) return jsonError(err.status, err.message);
    return jsonError(400, "Invalid request.");
  }

  try {
    const facts = await getGeneFacts(symbol);
    return Response.json({
      ...facts,
      disclaimer: DISCLAIMER,
      meta: {
        promptVersion: PROMPT_VERSION,
        modelId: MODEL_ID,
        schemaVersion: OUTPUT_SCHEMA_VERSION,
      },
    });
  } catch (err) {
    if (err instanceof FactsError) return jsonError(err.status, err.message);
    return jsonError(502, "Gene database is unreachable right now. Please try again in a moment.");
  }
}
