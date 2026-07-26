// Genclarus — same-origin proxy for AlphaFold structure data (prediction metadata + PDB files).
// The browser fetches this route instead of alphafold.ebi.ac.uk directly: CSP enforces
// `connect-src 'self'`, so client code may not reach a cross-origin host regardless of whether
// that host's own CORS policy would allow it (AlphaFold's does, confirmed by the CORS spike in
// the 3D structure viewer plan — but CSP is enforced independently of CORS, so the proxy is
// required either way). Delegates to the shared safeFetch guardrails (host allowlist, timeout,
// no redirects) and reads the body bounded, the same pattern as every other outbound call here.

import { safeFetch } from "@/lib/http";
import { jsonError } from "@/lib/request";

export const dynamic = "force-dynamic";

const ALLOWED_STRUCTURE_HOST = "alphafold.ebi.ac.uk";
const MAX_STRUCTURE_BYTES = 8 * 1024 * 1024; // 8 MB — generous for a single predicted-model PDB file

export async function GET(request: Request) {
  const target = new URL(request.url).searchParams.get("url");
  if (!target) return jsonError(400, "Missing url parameter.");

  let host: string;
  try {
    host = new URL(target).hostname.toLowerCase();
  } catch {
    return jsonError(400, "Invalid url parameter.");
  }
  // Exact match only — no subdomain, lookalike, or open-redirect target is accepted.
  if (host !== ALLOWED_STRUCTURE_HOST) {
    return jsonError(400, "Host not allowed.");
  }

  try {
    // AlphaFold's edge 403s requests carrying Node's default fetch User-Agent (no bot-shaped UA
    // means no result) — a real browser never hits this, but our server-side proxy does, so it
    // needs an explicit, honestly-identified UA.
    const res = await safeFetch(
      target,
      {
        headers: {
          Accept: "application/json, text/plain, */*",
          "User-Agent": "Genclarus/1.0 (https://genclarus.com; structure viewer)",
        },
      },
      15000,
    );
    if (!res.ok) return jsonError(502, "Structure database returned an error.");

    const reader = res.body?.getReader();
    if (!reader) {
      // No streaming body available in this environment — fall back to a direct read.
      const text = await res.text();
      return new Response(text, { headers: { "content-type": "text/plain; charset=utf-8" } });
    }

    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > MAX_STRUCTURE_BYTES) {
          await reader.cancel();
          return jsonError(502, "Structure exceeded size limit.");
        }
        chunks.push(value);
      }
    }
    const text = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf-8");
    return new Response(text, { headers: { "content-type": "text/plain; charset=utf-8" } });
  } catch {
    return jsonError(502, "Structure database is unreachable right now. Please try again in a moment.");
  }
}
