// Phase 1.1 reliability contract for NIM synthesis. These lock in WHICH provider failures are
// worth another attempt and which are a real answer — the distinction that keeps a flaky free tier
// from being visible to users without hammering a provider that has already said no.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { synthesize, backoffMs, stripReasoning } from "./nim";

const realFetch = globalThis.fetch;
const messages = [{ role: "user" as const, content: "explain BRCA1" }];

function completion(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

// A response that ran out of tokens mid-thought — what production was actually returning.
function truncated(content: string): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content }, finish_reason: "length" }] }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function status(code: number): Response {
  return new Response(JSON.stringify({ error: "upstream" }), {
    status: code,
    headers: { "content-type": "application/json" },
  });
}

// Queue one response (or thrown error) per attempt, so a test states the provider's behaviour
// attempt by attempt.
function stubSequence(responses: (Response | Error)[]) {
  let i = 0;
  const fn = vi.fn(async () => {
    const next = responses[Math.min(i, responses.length - 1)];
    i++;
    if (next instanceof Error) throw next;
    return next.clone();
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

beforeEach(() => {
  process.env.NVIDIA_API_KEY = "test-key";
  // Backoff is real time; collapse it so the suite stays fast without faking the clock the
  // budget check depends on.
  vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void) => {
    fn();
    return 0;
  }) as unknown as typeof setTimeout);
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
  delete process.env.NVIDIA_API_KEY;
});

describe("synthesize — success paths", () => {
  it("returns the explanation on the first attempt", async () => {
    const fetchMock = stubSequence([completion("## What it does\nDNA repair.")]);
    const r = await synthesize(messages);
    expect(r.explanation).toContain("DNA repair");
    expect(r.aiAvailable).toBe(true);
    expect(r.fallbackReason).toBeNull();
    expect(r.attempts).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("strips the model's <think> block", async () => {
    stubSequence([completion("<think>reasoning</think>\n## What it does\nDNA repair.")]);
    const r = await synthesize(messages);
    expect(r.explanation).not.toContain("think");
    expect(r.explanation).toContain("DNA repair");
  });
});

describe("synthesize — transient failures are retried", () => {
  it("retries empty content and succeeds on a later attempt", async () => {
    const fetchMock = stubSequence([completion("   "), completion("real answer")]);
    const r = await synthesize(messages);
    expect(r.explanation).toBe("real answer");
    expect(r.attempts).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a 429", async () => {
    const fetchMock = stubSequence([status(429), completion("real answer")]);
    const r = await synthesize(messages);
    expect(r.explanation).toBe("real answer");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a 5xx", async () => {
    const fetchMock = stubSequence([status(503), completion("real answer")]);
    expect((await synthesize(messages)).explanation).toBe("real answer");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a timeout / network error", async () => {
    const fetchMock = stubSequence([new Error("The operation was aborted"), completion("real answer")]);
    expect((await synthesize(messages)).explanation).toBe("real answer");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a malformed JSON body", async () => {
    const bad = new Response("{not json", { status: 200, headers: { "content-type": "application/json" } });
    const fetchMock = stubSequence([bad, completion("real answer")]);
    expect((await synthesize(messages)).explanation).toBe("real answer");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after three attempts and falls back cleanly", async () => {
    const fetchMock = stubSequence([status(503)]);
    const r = await synthesize(messages);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(r.explanation).toBeNull();
    expect(r.aiAvailable).toBe(false);
    expect(r.fallbackReason).toBe("provider_unavailable");
    expect(r.failureCategory).toBe("upstream_5xx");
  });
});

describe("synthesize — definitive answers are not retried", () => {
  it("does not retry an ordinary 4xx", async () => {
    const fetchMock = stubSequence([status(400)]);
    const r = await synthesize(messages);
    expect(fetchMock).toHaveBeenCalledTimes(1); // retrying a bad request just wastes the quota
    expect(r.fallbackReason).toBe("provider_unavailable");
    expect(r.failureCategory).toBe("upstream_4xx");
  });

  it("does not retry a rejected key", async () => {
    const fetchMock = stubSequence([status(401)]);
    await synthesize(messages);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never calls out when no key is configured", async () => {
    delete process.env.NVIDIA_API_KEY;
    const fetchMock = stubSequence([completion("unused")]);
    const r = await synthesize(messages);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r.fallbackReason).toBe("not_configured");
    expect(r.attempts).toBe(0);
  });
});

describe("synthesize — reporting the failure honestly", () => {
  it("reports a provider that answers but produces nothing as AVAILABLE", async () => {
    // The distinction matters: the model is up and we are not in an outage — it just had
    // nothing to say. Telling the user "unavailable" would be false.
    const r = await (stubSequence([completion("")]), synthesize(messages));
    expect(r.aiAvailable).toBe(true);
    expect(r.explanation).toBeNull();
    expect(r.fallbackReason).toBe("provider_no_content");
    expect(r.failureCategory).toBe("empty_response");
    expect(r.attempts).toBe(3);
  });

  it("keeps internal diagnostics out of the client-facing reason", async () => {
    stubSequence([status(429)]);
    const r = await synthesize(messages);
    // The client learns the narrative is missing, not that we were rate limited.
    expect(r.fallbackReason).toBe("provider_unavailable");
    expect(r.failureCategory).toBe("rate_limited");
  });
});

// The defect that made production look "randomly flaky": nemotron reasons inside <think> before
// answering, that reasoning is billed against max_tokens, and a budget sized for the answer alone
// left nothing once the reasoning was stripped.
describe("stripReasoning", () => {
  it("removes a complete reasoning block and keeps the answer", () => {
    expect(stripReasoning("<think>weighing options</think>\n## What it does\nDNA repair.")).toBe(
      "## What it does\nDNA repair.",
    );
  });

  it("returns null when the response is nothing but reasoning", () => {
    expect(stripReasoning("<think>weighing options</think>")).toBeNull();
  });

  it("never leaks an UNCLOSED reasoning block into the page", () => {
    // A truncated response has no closing tag. Showing the raw scratchpad to a user would be
    // worse than showing no narrative at all.
    expect(stripReasoning("<think>the user asked about BRCA1, so I should")).toBeNull();
  });

  it("leaves ordinary prose untouched", () => {
    expect(stripReasoning("## What it does\nDNA repair.")).toBe("## What it does\nDNA repair.");
  });
});

describe("synthesize — truncation is diagnosed as our budget, not their fault", () => {
  it("reports finish_reason=length with no answer as truncated_before_answer", async () => {
    stubSequence([truncated("<think>still reasoning about BRCA1 and")]);
    const r = await synthesize(messages);
    expect(r.failureCategory).toBe("truncated_before_answer");
    expect(r.explanation).toBeNull();
    // Still "available" — the provider answered fine; we asked for too little room.
    expect(r.aiAvailable).toBe(true);
    expect(r.fallbackReason).toBe("provider_no_content");
  });

  it("does not retry a truncation, which would truncate identically", async () => {
    const fetchMock = stubSequence([truncated("<think>reasoning")]);
    await synthesize(messages);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the answer when the model finished inside its budget", async () => {
    stubSequence([completion("<think>brief</think>## What it does\nDNA repair.")]);
    expect((await synthesize(messages)).explanation).toContain("DNA repair");
  });
});

describe("backoffMs", () => {
  it("waits nothing before the first attempt", () => {
    expect(backoffMs(0, () => 0.5)).toBe(0);
  });

  it("grows between attempts and stays inside the documented bounds", () => {
    const second = backoffMs(1, () => 0.5);
    const third = backoffMs(2, () => 0.5);
    expect(second).toBeGreaterThanOrEqual(400);
    expect(second).toBeLessThanOrEqual(700);
    expect(third).toBeGreaterThanOrEqual(1000);
    expect(third).toBeLessThanOrEqual(1500);
    expect(third).toBeGreaterThan(second);
  });

  it("applies jitter so concurrent retries don't align", () => {
    expect(backoffMs(1, () => 0)).not.toBe(backoffMs(1, () => 0.99));
  });
});
