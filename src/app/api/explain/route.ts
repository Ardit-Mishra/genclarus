// Genclarus — narrative synthesis, requested separately from the facts so the page is never
// blocked on the model.
//
// SECURITY: this route accepts an IDENTIFIER ONLY — never biological facts from the browser.
// It re-derives the facts server-side (normally from the fact cache the lookup just populated),
// so the model can only ever be handed data this server fetched from an allowlisted upstream.
// Accepting caller-supplied "facts" here would hand anyone a direct line into the prompt.

import { readJsonBody, RequestValidationError, jsonError } from "@/lib/request";
import {
  getGeneFacts,
  getVariantFacts,
  normalizeGeneSymbol,
  normalizeRsid,
  FactsError,
} from "@/lib/facts";
import { explain } from "@/lib/explain";
import { PROMPT_VERSION, MODEL_ID, OUTPUT_SCHEMA_VERSION } from "@/lib/version";

export const dynamic = "force-dynamic";

type ExplainRequest = { type: "gene" | "variant"; identifier: string };

// Strict shape: exactly `type` and `identifier`, nothing else. Same posture as the lookup
// routes — unexpected properties are rejected rather than ignored.
function parseExplainBody(body: unknown): ExplainRequest {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new RequestValidationError("Invalid request.", 400);
  }
  const keys = Object.keys(body as Record<string, unknown>).sort();
  if (keys.length !== 2 || keys[0] !== "identifier" || keys[1] !== "type") {
    throw new RequestValidationError("Invalid request.", 400);
  }
  const { type, identifier } = body as Record<string, unknown>;
  if ((type !== "gene" && type !== "variant") || typeof identifier !== "string") {
    throw new RequestValidationError("Invalid request.", 400);
  }
  return { type, identifier: identifier.normalize("NFKC") };
}

export async function POST(request: Request) {
  let parsed: ExplainRequest;
  try {
    parsed = parseExplainBody(await readJsonBody(request));
  } catch (err) {
    if (err instanceof RequestValidationError) return jsonError(err.status, err.message);
    return jsonError(400, "Invalid request.");
  }

  try {
    const facts =
      parsed.type === "gene"
        ? await getGeneFacts(normalizeGeneSymbol(parsed.identifier))
        : await getVariantFacts(normalizeRsid(parsed.identifier));

    const { explanation, aiAvailable, fallbackReason, cached } = await explain(facts);

    return Response.json({
      kind: parsed.type,
      explanation,
      aiAvailable,
      fallbackReason,
      cached,
      // Which prompt/model/schema produced this text — so a narrative can always be traced back
      // to the exact configuration that generated it.
      meta: {
        promptVersion: PROMPT_VERSION,
        modelId: MODEL_ID,
        schemaVersion: OUTPUT_SCHEMA_VERSION,
      },
    });
  } catch (err) {
    if (err instanceof FactsError) return jsonError(err.status, err.message);
    return jsonError(502, "Could not generate an explanation right now.");
  }
}
