// Genclarus — natural-language search over the corpus (README "Future Improvements": "the sickle
// cell mutation" → rs334). Hybrid retrieval (src/lib/retrieval/search.ts): BM25 always, plus a
// live query embedding against the committed per-doc vectors when the embedder (local Ollama) is
// reachable. Returns identifiers only, ranked — the SAME facts a caller would get from /api/v1/
// {gene,variant}/[id] for any hit, never new content generated here. No request-time inference in
// the sense the rest of this API means it (no model writes text); the embedding call is a
// classification-style vector lookup, not synthesis, and degrades to lexical-only when unavailable
// exactly like every other optional layer in this app.

import { readJsonBody, RequestValidationError, jsonError } from "@/lib/request";
import { search } from "@/lib/retrieval/search";
import { rateLimited, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const MAX_QUERY_CHARS = 200;
const DEFAULT_K = 5;
const MAX_K = 20;

type SearchRequest = { query: string; k: number };

function parseSearchBody(body: unknown): SearchRequest {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new RequestValidationError("Invalid request.", 400);
  }
  const keys = Object.keys(body as Record<string, unknown>);
  if (keys.some((k) => k !== "query" && k !== "k")) {
    throw new RequestValidationError("Invalid request.", 400);
  }
  const { query, k } = body as Record<string, unknown>;
  if (typeof query !== "string" || !query.trim()) {
    throw new RequestValidationError("A non-empty 'query' string is required.", 400);
  }
  if (query.length > MAX_QUERY_CHARS) {
    throw new RequestValidationError(`Query too long — max ${MAX_QUERY_CHARS} characters.`, 400);
  }
  if (k !== undefined && (typeof k !== "number" || !Number.isInteger(k) || k < 1 || k > MAX_K)) {
    throw new RequestValidationError(`'k' must be an integer between 1 and ${MAX_K}.`, 400);
  }
  return { query: query.normalize("NFKC"), k: (k as number | undefined) ?? DEFAULT_K };
}

export async function POST(request: Request) {
  const limited = rateLimited(request, RATE_LIMITS.search);
  if (limited) return limited;

  let parsed: SearchRequest;
  try {
    parsed = parseSearchBody(await readJsonBody(request));
  } catch (err) {
    if (err instanceof RequestValidationError) return jsonError(err.status, err.message);
    return jsonError(400, "Invalid request.");
  }

  try {
    const result = await search(parsed.query, parsed.k);
    return Response.json({
      query: parsed.query,
      results: result.hits,
      // Honest about which ranking actually produced this response — never silently semantic.
      semanticAvailable: result.semanticAvailable,
      semanticReason: result.semanticReason,
    });
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      // Retrieval index not built yet (npm run retrieval:build-index) — a config problem, not a
      // per-request failure, so it's surfaced distinctly rather than as a generic 502.
      return jsonError(503, "Search index is not available right now.");
    }
    return jsonError(502, "Search is unavailable right now. Please try again in a moment.");
  }
}
