// Genclarus — variant (rsID) lookup API. Returns verified facts ONLY, as fast as the upstream
// allows. The plain-language narrative is fetched separately via /api/explain so a slow model can
// never hold the verified ClinVar record hostage.

import { readJsonBody, extractSingleField, RequestValidationError, jsonError } from "@/lib/request";
import { getVariantFacts, normalizeRsid, FactsError } from "@/lib/facts";
import { PROMPT_VERSION, MODEL_ID, OUTPUT_SCHEMA_VERSION } from "@/lib/version";

export const dynamic = "force-dynamic";

// Variants carry clinical weight — the disclaimer is deliberately stronger than the gene one.
const DISCLAIMER =
  "Educational information only — not medical advice, a diagnosis, or a clinical interpretation. A variant's significance can be uncertain, conflicting, or dependent on your full clinical and family context. Consult a qualified genetics professional or genetic counselor before drawing any conclusion.";

export async function POST(request: Request) {
  let rsid: string;
  try {
    const body = await readJsonBody(request);
    rsid = normalizeRsid(extractSingleField(body, "rsid"));
  } catch (err) {
    if (err instanceof FactsError) return jsonError(err.status, err.message);
    if (err instanceof RequestValidationError) return jsonError(err.status, err.message);
    return jsonError(400, "Invalid request.");
  }

  try {
    const facts = await getVariantFacts(rsid);
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
    return jsonError(
      502,
      "Variant database is unreachable right now. Please try again in a moment.",
    );
  }
}
