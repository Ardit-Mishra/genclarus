// Phase 4a — the persistent, cross-instance layer on top of explain().
//
// explain()'s own cache lives in ONE serverless instance's memory: it dies on every cold start and
// is never shared between instances, so in production almost every request re-rolls the (free-tier,
// intermittently flaky) synthesis — a lookup that grounds for one visitor does not stay grounded for
// the next. This layer fixes that by storing grounded results in the platform Data Cache
// (`unstable_cache`): durable across cold starts and shared across every instance, at $0 with no new
// infrastructure, dependency or secret. Once a lookup grounds, the same claims are served to
// everyone until the versioned key changes or the TTL elapses. That is what turns "a random ~1-in-3
// request shows no AI narrative" into "grounds once, then stays grounded".
//
// INVARIANT: only grounded successes are cached. A synthesis/grounding failure THROWS out of the
// cached function, and the Data Cache never stores a rejected result — so a flaky failure retries on
// the next request instead of being frozen in for a day. The versioned cacheKey (facts + prompt +
// model + schema) is reused verbatim, so a cached narrative still cannot outlive a ClinVar update, a
// prompt edit, a model swap or a schema bump.

import { unstable_cache } from "next/cache";
import { explain, cacheKey, type Explanation } from "./explain";
import type { Facts } from "./facts";

// Matches explain()'s in-memory TTL. The Data Cache `revalidate` is expressed in SECONDS.
const EXPLANATION_TTL_SECONDS = 24 * 60 * 60;
// Tag every entry so all explanations can be purged at once (revalidateTag) — e.g. a Phase 4
// rollback or an emergency invalidation — without waiting out the per-entry TTL.
const EXPLANATION_TAG = "explanation";

// A grounded result could not be produced this attempt. Carries the honest Explanation so the caller
// can still return it, and — by being thrown — guarantees the Data Cache persists nothing.
class Ungrounded extends Error {
  constructor(readonly explanation: Explanation) {
    super("explanation not groundable — not cacheable");
    this.name = "Ungrounded";
  }
}

// Cross-instance, cold-start-surviving explanation lookup. Drop-in replacement for explain() at the
// route boundary; delegates the actual generation + grounding to explain() unchanged.
export async function cachedExplain(facts: Facts): Promise<Explanation> {
  // Set only when the cached function body actually runs — i.e. on a Data Cache MISS. On a HIT the
  // body is skipped, so this stays false and `cached: true` is reported honestly.
  let generated = false;
  // The result of the body, captured so a Data Cache fault AFTER generation can reuse it rather than
  // synthesize a second time.
  let produced: Explanation | undefined;

  const load = unstable_cache(
    async (): Promise<Explanation> => {
      generated = true;
      const result = await explain(facts);
      produced = result;
      // Never cache a non-success: throw so the Data Cache stores nothing and the next request gets
      // a fresh attempt at the flaky provider.
      if (!result.claims) throw new Ungrounded(result);
      return result;
    },
    // The versioned key IS the cache identity: any change to facts, prompt, model or schema yields a
    // different key and therefore cannot serve a stale narrative.
    [cacheKey(facts)],
    { revalidate: EXPLANATION_TTL_SECONDS, tags: [EXPLANATION_TAG] },
  );

  try {
    const result = await load();
    // A Data Cache HIT skips the body (generated stays false) → it IS cached, authoritatively. When
    // the body DID run, defer to explain()'s own flag: it may still have served from its in-process
    // L1 cache (a warm instance / repeat request), and that is honestly `cached` too. This layering
    // means the caching guarantee holds whether the persistent L2 is active (production) or a no-op
    // (a runtime with no incremental cache) — L1 alone still reports repeats correctly.
    return generated ? result : { ...result, cached: true };
  } catch (err) {
    // An honest non-success that we deliberately refused to cache — return it as-is.
    if (err instanceof Ungrounded) return err.explanation;
    // The persistent Data Cache is unavailable or errored (e.g. a plain Node/test runtime with no
    // Next incremental-cache context, or a platform hiccup). Losing the CACHE must never lose the
    // ANSWER: reuse the body's result if it already ran, otherwise generate directly via explain()'s
    // own in-process cache. We simply forgo cross-instance persistence for this request.
    if (produced) return produced;
    return explain(facts);
  }
}
