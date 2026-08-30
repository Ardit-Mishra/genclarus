// In-memory rate limiter for the public API routes. Fixed-window counter per client key, held in
// a Map for the life of the server process.
//
// Scope, stated honestly: this is PER-INSTANCE and IN-MEMORY. On Vercel's serverless platform each
// warm instance (and every cold start) has its own independent counter, and a redeploy clears it —
// so a determined caller spread across enough concurrent instances sees a higher effective ceiling
// than the numbers below suggest. It is NOT a security boundary and does not stop a distributed
// abuser. Its actual job is the one thing it reliably does: cap how much of the free compute/NIM
// budget a single misbehaving client (a retry loop, a scraping script) can burn from any one warm
// instance, and shed obvious abuse with a cheap, fast, dependency-free check before real work
// starts. A real deployment expecting adversarial traffic would put this behind a shared store
// (Redis/Upstash) or an edge/WAF rate limiter instead — deliberately out of scope for a $0 project.

const buckets = new Map<string, { count: number; resetAt: number }>();

// Bounds how large `buckets` can grow between windows rolling over naturally. Each request either
// hits an existing (unexpired) entry or, once this cap is reached, is keyed into a small shared
// "overflow" bucket rather than growing the map unboundedly — cheap protection against the map
// itself becoming a memory-exhaustion vector under a high-cardinality key (e.g. spoofed IPs).
const MAX_BUCKETS = 5000;
const OVERFLOW_KEY = "__overflow__";

export type RateLimitConfig = { limit: number; windowMs: number };

// Named per-route budgets. /api/explain is by far the most expensive request (it can invoke the
// free NIM tier, shared across every visitor) so it gets the tightest ceiling; plain corpus/fact
// lookups and the read-only batch/search endpoints get more headroom since they're cheap local
// work. All figures are generous for a real visitor and are a starting point, not a tuned result —
// they exist to blunt a runaway script, not to shape normal usage.
export const RATE_LIMITS = {
  explain: { limit: 20, windowMs: 60_000 },
  lookup: { limit: 60, windowMs: 60_000 }, // /api/gene, /api/variant, /api/alphamissense
  proxy: { limit: 60, windowMs: 60_000 }, // /api/structure
  batch: { limit: 20, windowMs: 60_000 }, // /api/v1/batch
  search: { limit: 30, windowMs: 60_000 }, // /api/search
} as const satisfies Record<string, RateLimitConfig>;

export type RateLimitResult = { allowed: boolean; remaining: number; resetAt: number };

// Extracts a best-effort client key from standard proxy headers (Vercel/most CDNs set
// x-forwarded-for; x-real-ip is a common fallback). Never trust this for identity or security
// decisions — a client can freely spoof it — it only needs to be "good enough" to separate casual
// distinct callers for the compute-budget purpose above. Falls back to a constant key (better than
// throwing) when neither header is present, which simply means all such callers share one bucket.
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

export function checkRateLimit(
  key: string,
  { limit, windowMs }: RateLimitConfig,
  now: number = Date.now(),
): RateLimitResult {
  const bucketKey = buckets.size >= MAX_BUCKETS && !buckets.has(key) ? OVERFLOW_KEY : key;
  const existing = buckets.get(bucketKey);

  if (!existing || existing.resetAt <= now) {
    buckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  return { allowed: true, remaining: limit - existing.count, resetAt: existing.resetAt };
}

// Standard 429 response with Retry-After, in the same generic-error shape as jsonError (src/lib/
// request.ts) so a rate-limited response is indistinguishable in structure from any other client
// error — never leaks bucket internals.
export function rateLimitResponse(result: RateLimitResult): Response {
  const retryAfterSec = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
  return Response.json(
    { error: "Too many requests. Please slow down and try again shortly." },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
  );
}

// One-line guard for a route handler: `const limited = rateLimited(request, CONFIG); if (limited)
// return limited;`. Returns the 429 Response when the caller should be turned away, null otherwise.
export function rateLimited(request: Request, config: RateLimitConfig): Response | null {
  const result = checkRateLimit(clientKey(request), config);
  return result.allowed ? null : rateLimitResponse(result);
}

// Exposed for tests only — production never needs to reset the shared state mid-process.
export function clearRateLimitState(): void {
  buckets.clear();
}
