// Genclarus — variant (rsID) lookup API. Returns verified facts ONLY, as fast as the upstream
// allows. The plain-language narrative is fetched separately via /api/explain so a slow model can
// never hold the verified ClinVar record hostage.

import { readJsonBody, extractSingleField, RequestValidationError, jsonError } from "@/lib/request";
import { getVariantFacts, normalizeRsid, FactsError } from "@/lib/facts";
import { PROMPT_VERSION, MODEL_ID, OUTPUT_SCHEMA_VERSION } from "@/lib/version";
import { safeFetch } from "@/lib/http";
import { lookupAlphaMissense, type AmResult } from "@/lib/alphamissense";

export const dynamic = "force-dynamic";

// Variants carry clinical weight — the disclaimer is deliberately stronger than the gene one.
const DISCLAIMER =
  "Educational information only — not medical advice, a diagnosis, or a clinical interpretation. A variant's significance can be uncertain, conflicting, or dependent on your full clinical and family context. Consult a qualified genetics professional or genetic counselor before drawing any conclusion.";

// Resolves the AlphaMissense annotations CSV URL for a UniProt accession, straight from the
// AlphaFold prediction API. Deliberately does NOT go through resolveStructure() in @/lib/alphafold
// or the /api/structure proxy — both are wired for the browser-only structure viewer, which
// reaches AlphaFold through a same-origin proxy (relative URL) because CSP enforces
// `connect-src 'self'` client-side. That constraint doesn't apply to this server-side route, and a
// relative URL isn't a valid fetch target for Node's fetch anyway, so this hits AlphaFold directly
// via the shared safeFetch guardrails (already allowlists alphafold.ebi.ac.uk).
async function fetchAmAnnotationsUrl(uniprot: string): Promise<string | null> {
  try {
    const res = await safeFetch(
      `https://alphafold.ebi.ac.uk/api/prediction/${uniprot}`,
      {
        headers: {
          Accept: "application/json",
          // AlphaFold's edge 403s requests carrying Node's default fetch User-Agent — see
          // src/app/api/structure/route.ts for the same workaround.
          "User-Agent": "Genclarus/1.0 (https://genclarus.com; variant lookup)",
        },
      },
      8000,
    );
    if (!res.ok) return null;
    const arr = (await res.json()) as Record<string, unknown>[];
    const url = arr?.[0]?.amAnnotationsUrl;
    return typeof url === "string" ? url : null;
  } catch {
    return null;
  }
}

// Resolves AlphaMissense pathogenicity for the variant's substitution. Runs after `uniprot` is
// known (it depends on it) but never blocks or fails the verified ClinVar facts around it — any
// failure along the way (no UniProt accession, no AlphaMissense coverage, a slow/unreachable
// upstream) degrades silently to null, same as a protein with no predicted structure at all.
async function amFor(uniprot: string | null, proteinChange: string): Promise<AmResult | null> {
  if (!uniprot) return null;
  const amUrl = await fetchAmAnnotationsUrl(uniprot);
  if (!amUrl) return null;
  return lookupAlphaMissense(amUrl, proteinChange);
}

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
    const alphaMissense = await amFor(facts.uniprot, facts.proteinChange);
    return Response.json({
      ...facts,
      alphaMissense,
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
