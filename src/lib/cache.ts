// A small TTL cache with a bounded entry count.
//
// SCOPE, honestly stated: this lives in the process memory of one serverless instance. A warm
// instance serving repeat lookups of popular queries (BRCA1, TP53, rs6025) benefits; a cold
// instance starts empty, and nothing is shared between instances. It is therefore a latency
// optimisation, NOT a guarantee that "the second visitor gets it instantly". A cross-instance
// cache needs a platform data cache or KV store and is a separate decision (it carries cost and
// vendor implications this project has not taken on).

type Entry<T> = { value: T; expiresAt: number };

export class TtlCache<T> {
  private store = new Map<string, Entry<T>>();

  constructor(
    private ttlMs: number,
    private maxEntries = 200,
  ) {}

  get(key: string): T | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (Date.now() >= hit.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    // Refresh recency so eviction drops genuinely cold entries, not merely old ones.
    this.store.delete(key);
    this.store.set(key, hit);
    return hit.value;
  }

  set(key: string, value: T): void {
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}
