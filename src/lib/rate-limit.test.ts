import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, clearRateLimitState, rateLimited } from "./rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => clearRateLimitState());

  it("allows requests up to the limit within the window", () => {
    const now = 1_000_000;
    const cfg = { limit: 3, windowMs: 60_000 };
    expect(checkRateLimit("a", cfg, now).allowed).toBe(true);
    expect(checkRateLimit("a", cfg, now + 1).allowed).toBe(true);
    expect(checkRateLimit("a", cfg, now + 2).allowed).toBe(true);
  });

  it("rejects the request once the limit is exceeded within the window", () => {
    const now = 1_000_000;
    const cfg = { limit: 2, windowMs: 60_000 };
    checkRateLimit("b", cfg, now);
    checkRateLimit("b", cfg, now + 1);
    const third = checkRateLimit("b", cfg, now + 2);
    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);
  });

  it("resets the count once the window elapses", () => {
    const now = 1_000_000;
    const cfg = { limit: 1, windowMs: 1000 };
    expect(checkRateLimit("c", cfg, now).allowed).toBe(true);
    expect(checkRateLimit("c", cfg, now + 500).allowed).toBe(false);
    expect(checkRateLimit("c", cfg, now + 1001).allowed).toBe(true);
  });

  it("tracks separate keys independently", () => {
    const now = 1_000_000;
    const cfg = { limit: 1, windowMs: 60_000 };
    expect(checkRateLimit("d1", cfg, now).allowed).toBe(true);
    expect(checkRateLimit("d2", cfg, now).allowed).toBe(true);
    expect(checkRateLimit("d1", cfg, now + 1).allowed).toBe(false);
  });

  it("decrements remaining on each allowed call", () => {
    const now = 1_000_000;
    const cfg = { limit: 5, windowMs: 60_000 };
    expect(checkRateLimit("e", cfg, now).remaining).toBe(4);
    expect(checkRateLimit("e", cfg, now + 1).remaining).toBe(3);
  });
});

describe("rateLimited", () => {
  beforeEach(() => clearRateLimitState());

  function requestFrom(ip: string): Request {
    return new Request("https://genclarus.com/api/gene", { headers: { "x-forwarded-for": ip } });
  }

  it("returns null while under the limit", () => {
    expect(rateLimited(requestFrom("1.2.3.4"), { limit: 2, windowMs: 60_000 })).toBeNull();
  });

  it("returns a 429 Response with Retry-After once over the limit", async () => {
    const req = requestFrom("5.6.7.8");
    const cfg = { limit: 1, windowMs: 60_000 };
    rateLimited(req, cfg);
    const res = rateLimited(req, cfg);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(429);
    expect(res!.headers.get("Retry-After")).toBeTruthy();
    const body = await res!.json();
    expect(body.error).toBeTruthy();
  });

  it("separates different x-forwarded-for clients", () => {
    const cfg = { limit: 1, windowMs: 60_000 };
    expect(rateLimited(requestFrom("9.9.9.9"), cfg)).toBeNull();
    expect(rateLimited(requestFrom("9.9.9.10"), cfg)).toBeNull();
  });
});
