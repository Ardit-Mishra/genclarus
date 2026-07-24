// Shared NVIDIA NIM synthesis — single source of truth for model config + call behaviour.
//
// Phase 1.1 (production reliability hotfix). Observed live: identical requests returned success,
// empty-content, and hard failure in quick succession — a free-tier provider is simply not
// production-grade. The goal is NOT "NIM never fails"; it is that intermittent provider failure is
// rarely visible, never corrupts facts, and never breaks the product. So: up to three attempts,
// exponential backoff with jitter, a per-attempt timeout AND a total time budget, then a clean
// fall back to source-only output. Retries cover empty content, 429, 5xx, timeouts and network
// errors; ordinary 4xx (bad request, bad key) is a real answer and is never retried.

import { safeFetch, readJsonBounded } from "./http";
import { MODEL_ID } from "./version";

const NIM_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const NIM_MODEL = MODEL_ID;

const MAX_ATTEMPTS = 3;
// Measured on production: this provider's failure mode is LATENCY, not random error. A 49B model
// on a free tier generating a few hundred tokens routinely needs 15-25s, so a short per-attempt
// timeout does not "retry past" a bad roll — it guarantees failure and makes the user wait longer
// to get nothing. The per-attempt cap must therefore sit above normal generation time; the total
// budget is what actually bounds the wait, and it stays under the platform's request ceiling.
const PER_ATTEMPT_TIMEOUT_MS = 24_000;
const TOTAL_BUDGET_MS = 26_000;
// Backoff before attempts 2 and 3: a base delay plus jitter, so retries from concurrent requests
// don't align into a thundering herd against the same rate-limited endpoint.
const BACKOFF_BASE_MS = [0, 400, 1000];
const BACKOFF_JITTER_MS = [0, 300, 500];

export type NimMessage = { role: "system" | "user"; content: string };

// Why synthesis failed, in provider terms. Internal only — never returned to the client, and
// never logged alongside prompts or biomedical payloads.
export type NimFailureCategory =
  | "no_api_key"
  | "empty_response"
  | "rate_limited"
  | "upstream_5xx"
  | "upstream_4xx"
  | "timeout"
  | "invalid_json";

// The coarse reason the client is allowed to see: enough to write honest UI copy, not enough to
// describe our infrastructure.
export type FallbackReason = "not_configured" | "provider_unavailable" | "provider_no_content";

export type NimResult = {
  explanation: string | null;
  // Whether the provider was reachable at all. False means we never got a usable response;
  // true with a null explanation means it answered but produced nothing.
  aiAvailable: boolean;
  fallbackReason: FallbackReason | null;
  // Internal diagnostics — routes must not put this in the response body.
  failureCategory: NimFailureCategory | null;
  attempts: number;
};

const CLIENT_REASON: Record<NimFailureCategory, FallbackReason> = {
  no_api_key: "not_configured",
  empty_response: "provider_no_content",
  rate_limited: "provider_unavailable",
  upstream_5xx: "provider_unavailable",
  upstream_4xx: "provider_unavailable",
  timeout: "provider_unavailable",
  invalid_json: "provider_unavailable",
};

// Only transient conditions are worth another attempt; a 400/401/403 will fail identically.
const RETRYABLE = new Set<NimFailureCategory>([
  "empty_response",
  "rate_limited",
  "upstream_5xx",
  "timeout",
  "invalid_json",
]);

export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const i = Math.min(attempt, BACKOFF_BASE_MS.length - 1);
  return BACKOFF_BASE_MS[i] + Math.floor(random() * BACKOFF_JITTER_MS[i]);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function result(
  category: NimFailureCategory,
  attempts: number,
  aiAvailable: boolean,
): NimResult {
  return {
    explanation: null,
    aiAvailable,
    fallbackReason: CLIENT_REASON[category],
    failureCategory: category,
    attempts,
  };
}

export async function synthesize(messages: NimMessage[]): Promise<NimResult> {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) return result("no_api_key", 0, false);

  const startedAt = Date.now();
  let last: NimFailureCategory = "timeout";
  let attempt = 0;

  while (attempt < MAX_ATTEMPTS) {
    if (attempt > 0) {
      const wait = backoffMs(attempt);
      // Don't start an attempt we can't finish inside the budget.
      if (Date.now() - startedAt + wait >= TOTAL_BUDGET_MS) break;
      await sleep(wait);
    }
    if (Date.now() - startedAt >= TOTAL_BUDGET_MS) break;
    attempt++;

    try {
      const res = await safeFetch(
        NIM_URL,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model: NIM_MODEL,
            temperature: 0.2,
            max_tokens: 500,
            messages,
          }),
        },
        PER_ATTEMPT_TIMEOUT_MS,
      );

      if (!res.ok) {
        if (res.status === 429) last = "rate_limited";
        else if (res.status >= 500) last = "upstream_5xx";
        else {
          // A definitive answer (bad request, bad/expired key) — retrying cannot change it.
          return result("upstream_4xx", attempt, false);
        }
        continue;
      }

      let data: { choices?: { message?: { content?: string } }[] };
      try {
        data = await readJsonBounded(res, 256 * 1024);
      } catch {
        last = "invalid_json";
        continue;
      }

      const text = data.choices?.[0]?.message?.content?.trim();
      const cleaned = text ? text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim() || null : null;
      if (cleaned) {
        return {
          explanation: cleaned,
          aiAvailable: true,
          fallbackReason: null,
          failureCategory: null,
          attempts: attempt,
        };
      }
      last = "empty_response";
    } catch {
      // Abort (per-attempt timeout), DNS, connection reset — all transient.
      last = "timeout";
    }

    if (!RETRYABLE.has(last)) break;
  }

  // Budget or attempts exhausted. Available means we actually got a successful response — which
  // for "empty_response" we did: the provider answered every time and simply had nothing to say.
  // A 429/5xx/timeout is an outage from the product's point of view, whatever the socket did.
  return result(last, attempt, last === "empty_response");
}
