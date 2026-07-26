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
import { MODEL_ID, OPENROUTER_MODEL } from "./version";

// Synthesis backends. Both are OpenAI-compatible chat/completions endpoints, so one call path
// serves both. The grounding orchestrator (explain.ts) uses them as a chain: a fast, reliable
// PRIMARY, then ESCALATION to a stronger free model only when the primary's output cannot be
// grounded — so scarce free-tier quota is spent only on the hard cases.
//
// $0 GUARD: OpenRouter exposes paid models too. Only ":free" model ids are ever permitted there;
// a non-free id yields no backend rather than a silent charge. NIM's tier is inherently free.
export type Backend = { label: "nim" | "openrouter"; url: string; model: string; apiKey: string };

const NIM_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

function nimBackend(): Backend | null {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) return null;
  return { label: "nim", url: NIM_URL, model: process.env.NIM_MODEL || MODEL_ID, apiKey };
}

function openrouterBackend(): Backend | null {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  const model = process.env.OPENROUTER_MODEL || OPENROUTER_MODEL;
  if (!model.endsWith(":free")) return null; // $0 guard — never call a paid model
  return { label: "openrouter", url: OPENROUTER_URL, model, apiKey };
}

// The fast primary and the stronger escalation. SYNTH_PRIMARY=openrouter flips them (benchmarking).
// Escalation is whichever configured backend is not the primary — null when only one is configured.
export function primaryBackend(): Backend | null {
  return process.env.SYNTH_PRIMARY === "openrouter"
    ? openrouterBackend() || nimBackend()
    : nimBackend() || openrouterBackend();
}

export function escalationBackend(): Backend | null {
  const primary = primaryBackend();
  if (!primary) return null;
  const other = primary.label === "nim" ? openrouterBackend() : nimBackend();
  return other && other.label !== primary.label ? other : null;
}

const MAX_ATTEMPTS = 3;
// Sized from measured throughput, not guesswork: this model emits ~38 tokens/s on the free tier
// (500 tokens in ~13s, observed in production), and MAX_TOKENS below allows 1400 — so a full
// generation needs ~36s. Any cap under that does not "retry past" a slow roll, it guarantees
// failure. Two earlier cuts of this hotfix each made production worse by capping too low: 12s
// turned success into timeout, 24s turned truncation into timeout.
//
// Waiting this long is only acceptable because NOTHING USER-FACING BLOCKS ON IT — the verified
// facts have already rendered, and this runs behind /api/explain. If synthesis ever moves back
// onto the critical path, these numbers are wrong again.
const PER_ATTEMPT_TIMEOUT_MS = 45_000;
const TOTAL_BUDGET_MS = 50_000;
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
  // The model spent its whole token budget reasoning and was cut off before writing an answer.
  // Distinct from empty_response because the cause is our max_tokens, not the provider.
  | "truncated_before_answer"
  | "rate_limited"
  | "upstream_5xx"
  | "upstream_4xx"
  | "timeout"
  | "invalid_json";

// The coarse reason the client is allowed to see: enough to write honest UI copy, not enough to
// describe our infrastructure. `failed_grounding` is set by the grounding layer, not NIM itself:
// the model answered, but the output could not be verified against the evidence and was withheld.
export type FallbackReason =
  | "not_configured"
  | "provider_unavailable"
  | "provider_no_content"
  | "failed_grounding";

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
  truncated_before_answer: "provider_no_content",
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

// Retries exist for TRANSIENT failures. A failure that took a long time to arrive is not
// transient — it is the provider working normally and producing a bad result, and repeating it
// just multiplies the wait (three ~13s truncations became a 40s request in production). So a
// failure only earns another attempt if it came back quickly.
const RETRY_IF_FASTER_THAN_MS = 8_000;

// `nemotron` is a REASONING model: it writes a <think> block before the answer, and that block is
// billed against max_tokens. Stripping it is correct — users must never see the scratchpad — but
// it means a token budget sized for the answer alone gets consumed by reasoning and leaves nothing
// behind. That was the real cause of production's "empty response" runs: BRCA1, with the longest
// source summary, reasoned longest and was truncated every single time, while shorter genes
// (TP53, CFTR) fit and succeeded. Hence the headroom: reasoning AND a ~200-word answer.
const MAX_TOKENS = 1400;

export function stripReasoning(text: string | undefined): string | null {
  if (!text) return null;
  // Also drop an UNCLOSED <think> — a truncated response has no closing tag, and leaking raw
  // model reasoning into the page would be worse than showing no narrative at all.
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<think>[\s\S]*$/i, "").trim() || null;
}

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

// Call ONE backend with the full reliability loop (bounded attempts, backoff, per-attempt and total
// timeouts, reasoning-strip). The grounding orchestrator chains two of these — primary, then
// escalation — so a single call stays single-backend and the chain logic lives in explain.ts.
export async function synthesize(
  messages: NimMessage[],
  backend: Backend | null = primaryBackend(),
): Promise<NimResult> {
  if (!backend) return result("no_api_key", 0, false);
  const key = backend.apiKey;

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
    const remaining = TOTAL_BUDGET_MS - (Date.now() - startedAt);
    if (remaining <= 0) break;
    attempt++;
    const attemptStartedAt = Date.now();

    try {
      const res = await safeFetch(
        backend.url,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model: backend.model,
            temperature: 0.2,
            max_tokens: MAX_TOKENS,
            messages,
          }),
        },
        // The attempt may not outlive the budget — otherwise the "total budget" bounds only when
        // an attempt STARTS, and total latency silently becomes budget + one full attempt.
        Math.min(PER_ATTEMPT_TIMEOUT_MS, remaining),
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

      let data: {
        choices?: { message?: { content?: string }; finish_reason?: string }[];
      };
      try {
        data = await readJsonBounded(res, 256 * 1024);
      } catch {
        last = "invalid_json";
        continue;
      }

      const choice = data.choices?.[0];
      const text = choice?.message?.content?.trim();
      const cleaned = stripReasoning(text);
      if (cleaned) {
        return {
          explanation: cleaned,
          aiAvailable: true,
          fallbackReason: null,
          failureCategory: null,
          attempts: attempt,
        };
      }
      // Nothing left after removing the reasoning block. If the model was cut off at the token
      // limit, it never got to the answer — that is our budget being too small, not the provider
      // misbehaving, and retrying identical inputs will truncate identically.
      last = choice?.finish_reason === "length" ? "truncated_before_answer" : "empty_response";
    } catch {
      // Abort (per-attempt timeout), DNS, connection reset — all transient.
      last = "timeout";
    }

    if (!RETRYABLE.has(last)) break;
    if (Date.now() - attemptStartedAt >= RETRY_IF_FASTER_THAN_MS) break;
  }

  // Budget or attempts exhausted. Available means we actually got a successful response — which
  // for "empty_response" we did: the provider answered every time and simply had nothing to say.
  // A 429/5xx/timeout is an outage from the product's point of view, whatever the socket did.
  return result(last, attempt, last === "empty_response" || last === "truncated_before_answer");
}
