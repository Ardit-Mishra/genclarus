// Outbound HTTP guardrails — every external fetch (MyGene, MyVariant, NIM) goes through here.
// Enforces a fixed host allowlist, a universal timeout, no automatic redirects, and a bounded,
// content-type-checked JSON read. Keeps upstream trust explicit and consistent across routes.

// UniProt (rest.uniprot.org) is intentionally omitted: nothing in this app currently calls the
// UniProt API server-side (only a client-facing link to uniprot.org). Add it here first if that
// changes.
const ALLOWED_HOSTS = new Set([
  "mygene.info",
  "myvariant.info",
  "integrate.api.nvidia.com",
]);

const DEFAULT_TIMEOUT_MS = 12000;
const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // 2 MB — generous for these JSON APIs

export function assertAllowedHost(url: string): void {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    throw new Error("Invalid outbound URL.");
  }
  if (!ALLOWED_HOSTS.has(host)) {
    throw new Error(`Outbound host not allowed: ${host}`);
  }
}

// fetch() wrapper: validates the host against the allowlist, applies a default timeout (an
// explicit init.signal wins), and disables automatic redirect-following so a compromised or
// misconfigured upstream can't silently redirect us off the allowlist.
export async function safeFetch(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  assertAllowedHost(url);
  return fetch(url, {
    ...init,
    redirect: "error",
    signal: init.signal ?? AbortSignal.timeout(timeoutMs),
  });
}

function assertJsonContentType(res: Response): void {
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("json")) {
    throw new Error("Upstream response was not JSON.");
  }
}

// Reads a Response body bounded to maxBytes and parses it as JSON, guarding against a
// misbehaving upstream returning an unbounded or non-JSON (HTML/binary) body.
export async function readJsonBounded<T = unknown>(
  res: Response,
  maxBytes: number = DEFAULT_MAX_RESPONSE_BYTES,
): Promise<T> {
  assertJsonContentType(res);

  const reader = res.body?.getReader();
  if (!reader) {
    // No streaming body available in this environment — fall back to a direct parse.
    return (await res.json()) as T;
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error("Upstream response exceeded size limit.");
      }
      chunks.push(value);
    }
  }
  const text = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf-8");
  return JSON.parse(text) as T;
}
