// Batch annotation endpoint — the B2B/ARPU lever: a customer annotates a whole gene/variant PANEL
// in one call instead of one request per identifier. `POST { ids: string[] }` → per-id
// found/not-found + the SAME PublicRecord projection (toPublicRecord) the /gene and /variant pages
// and the single-record /api/v1/{gene,variant}/[id] routes return, so a batch result is byte-for-
// byte identical to the corresponding single lookup.
//
// Unlike those single-record routes, this one takes an arbitrary id list, so it CANNOT be statically
// prerendered via generateStaticParams — it reads the committed corpus (src/lib/corpus/file-store.ts)
// from the filesystem at REQUEST time. On Vercel serverless, files only referenced dynamically (no
// static import, no generateStaticParams walk) are not auto-traced into the function bundle — so
// `corpus/**` must be pinned into this route's bundle explicitly via `outputFileTracingIncludes` in
// next.config.ts, or every lookup below would silently 404 in production despite passing locally and
// in `next build` (the dev server and the build's own type/lint passes don't exercise the deployed
// serverless bundle). Corpus reads only — no request-time model inference, so cost stays flat
// regardless of batch size.

import { corpusStore } from "@/lib/corpus";
import { toPublicRecord, type PublicRecord } from "@/lib/corpus/view";
import { readJsonBody, jsonError, RequestValidationError } from "@/lib/request";
import { rateLimited, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Sane upper bound on a single batch call — generous enough for a full gene/variant panel,
// small enough that MAX_IDS corpus reads stay well inside a serverless function's time budget.
const MAX_IDS = 100;

// Matches the store's own routing signal (see file-store.ts / facts.ts normalizeRsid): anything
// shaped like an rsID is looked up as a variant, everything else as a gene. The store's normalizers
// re-validate strictly and return null on anything malformed, so a loose match here is safe — it
// only decides which corpus subdirectory to check, never bypasses validation.
function looksLikeRsid(id: string): boolean {
  return /^rs\d+$/i.test(id.trim());
}

type BatchResult = { id: string; found: true; record: PublicRecord } | { id: string; found: false };

// Body shape: exactly one field, "ids", a non-empty array of non-empty strings, capped at MAX_IDS.
// Mirrors the strictness of src/lib/request.ts's extractSingleField (reject unknown/extra keys,
// wrong types) but for an array field, which that shared helper doesn't cover.
function extractIds(body: unknown): string[] {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new RequestValidationError("Invalid request.", 400);
  }
  const keys = Object.keys(body as Record<string, unknown>);
  if (keys.length !== 1 || keys[0] !== "ids") {
    throw new RequestValidationError("Invalid request.", 400);
  }
  const raw = (body as Record<string, unknown>).ids;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new RequestValidationError("Invalid request.", 400);
  }
  if (raw.length > MAX_IDS) {
    throw new RequestValidationError(`Too many ids — max ${MAX_IDS} per request.`, 400);
  }
  return raw.map((id) => {
    if (typeof id !== "string" || !id.trim()) {
      throw new RequestValidationError("Invalid request.", 400);
    }
    return id.normalize("NFKC").trim();
  });
}

async function lookup(id: string): Promise<BatchResult> {
  const record = looksLikeRsid(id) ? await corpusStore.getVariant(id) : await corpusStore.getGene(id);
  if (!record) return { id, found: false };
  return { id, found: true, record: toPublicRecord(record) };
}

export async function POST(request: Request) {
  const limited = rateLimited(request, RATE_LIMITS.batch);
  if (limited) return limited;

  let ids: string[];
  try {
    const body = await readJsonBody(request);
    ids = extractIds(body);
  } catch (err) {
    if (err instanceof RequestValidationError) return jsonError(err.status, err.message);
    return jsonError(400, "Invalid request.");
  }

  const results = await Promise.all(ids.map(lookup));
  const found = results.filter((r) => r.found).length;

  return Response.json({
    results,
    counts: { requested: ids.length, found, notFound: ids.length - found },
  });
}
