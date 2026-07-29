// cachedExplain is the persistent layer, so its tests pin the two behaviours production correctness
// rides on: a grounded result is served from the Data Cache on the next request (that is the whole
// point — masking free-tier flakiness), and a FAILED result is never cached (so a flaky failure
// retries instead of freezing in for the TTL). The generation itself is explain()'s job and is
// mocked here — this file only tests the caching boundary.

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Explanation } from "./explain";
import type { Facts } from "./facts";

const { explainMock, cacheKeyMock } = vi.hoisted(() => ({
  explainMock: vi.fn(),
  cacheKeyMock: vi.fn((f: Facts) => (f.kind === "gene" ? `gene|${f.symbol}` : `variant|${f.rsid}`)),
}));
vi.mock("./explain", () => ({ explain: explainMock, cacheKey: cacheKeyMock }));

// A faithful stand-in for next/cache's unstable_cache: it stores a RESOLVED value keyed by the
// keyParts and re-serves it without re-running the body, and it stores NOTHING when the body throws
// (a rejected promise is never persisted) — the exact two guarantees cachedExplain depends on.
const cacheStore = new Map<string, unknown>();
vi.mock("next/cache", () => ({
  unstable_cache: (fn: () => Promise<unknown>, keyParts: string[]) => {
    const key = keyParts.join("~");
    return async () => {
      if (cacheStore.has(key)) return cacheStore.get(key);
      const value = await fn(); // a throw propagates here → the line below never runs → nothing cached
      cacheStore.set(key, value);
      return value;
    };
  },
}));

import { cachedExplain } from "./cached-explain";

const gene = { kind: "gene", symbol: "BRCA1" } as unknown as Facts;
const variant = { kind: "variant", rsid: "rs6025" } as unknown as Facts;

function grounded(): Explanation {
  return {
    claims: [{ text: "A claim.", claimType: "function", supportingFactIds: ["gene.summary"], origin: "llm" }],
    aiAvailable: true,
    fallbackReason: null,
    cached: false,
    state: "grounded",
  };
}
function failed(reason: Explanation["fallbackReason"] = "failed_grounding"): Explanation {
  return { claims: null, aiAvailable: true, fallbackReason: reason, cached: false, state: "source_only" };
}

describe("cachedExplain", () => {
  beforeEach(() => {
    cacheStore.clear();
    explainMock.mockReset();
    cacheKeyMock.mockClear();
  });

  it("generates on a miss and reports cached:false", async () => {
    explainMock.mockResolvedValue(grounded());
    const r = await cachedExplain(gene);
    expect(r.claims).not.toBeNull();
    expect(r.cached).toBe(false);
    expect(explainMock).toHaveBeenCalledTimes(1);
  });

  it("serves a grounded result from the cache on the next request without regenerating", async () => {
    explainMock.mockResolvedValue(grounded());
    const first = await cachedExplain(gene);
    const second = await cachedExplain(gene);
    expect(first.cached).toBe(false);
    // The whole point: the second visitor gets the same grounded claims, from cache, no model call.
    expect(second.cached).toBe(true);
    expect(second.claims).toEqual(first.claims);
    expect(explainMock).toHaveBeenCalledTimes(1);
  });

  it("never caches a failed grounding — the next request retries", async () => {
    explainMock.mockResolvedValue(failed());
    const first = await cachedExplain(gene);
    const second = await cachedExplain(gene);
    expect(first.claims).toBeNull();
    expect(first.fallbackReason).toBe("failed_grounding");
    // A flaky failure must not be frozen in: both calls hit explain(), neither is served from cache.
    expect(second.claims).toBeNull();
    expect(explainMock).toHaveBeenCalledTimes(2);
  });

  it("returns the honest failure fields unchanged (never masks an outage as a hit)", async () => {
    explainMock.mockResolvedValue({ ...failed("provider_unavailable"), aiAvailable: false });
    const r = await cachedExplain(gene);
    expect(r.fallbackReason).toBe("provider_unavailable");
    expect(r.aiAvailable).toBe(false);
    expect(r.cached).toBe(false);
  });

  it("caches under the versioned key, so a failure then a success both resolve correctly", async () => {
    // First attempt fails (not cached); the retry grounds and is then served from cache.
    explainMock.mockResolvedValueOnce(failed()).mockResolvedValue(grounded());
    const miss = await cachedExplain(gene);
    expect(miss.claims).toBeNull();
    const retry = await cachedExplain(gene);
    expect(retry.claims).not.toBeNull();
    expect(retry.cached).toBe(false); // freshly generated on the retry
    const hit = await cachedExplain(gene);
    expect(hit.cached).toBe(true); // now served from cache
    expect(explainMock).toHaveBeenCalledTimes(2); // fail + success; the hit added no call
  });

  it("keys genes and variants separately", async () => {
    explainMock.mockResolvedValue(grounded());
    await cachedExplain(gene);
    await cachedExplain(variant);
    // Two distinct keys → two generations, not a collision serving the gene's claims for the variant.
    expect(explainMock).toHaveBeenCalledTimes(2);
    expect(cacheKeyMock).toHaveBeenCalledWith(gene);
    expect(cacheKeyMock).toHaveBeenCalledWith(variant);
  });
});
