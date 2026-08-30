import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { embedText, cosineSimilarity } from "./ollama-embeddings";

describe("cosineSimilarity", () => {
  it("is 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });

  it("is 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("returns 0 rather than NaN for a zero vector", () => {
    expect(cosineSimilarity([0, 0], [1, 2])).toBe(0);
  });

  it("returns 0 for mismatched lengths rather than throwing", () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });
});

describe("embedText", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns the embedding on a successful call", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ embedding: [0.1, 0.2, 0.3] }),
    }) as unknown as typeof fetch;
    const result = await embedText("BRCA1");
    expect(result).toEqual({ embedding: [0.1, 0.2, 0.3] });
  });

  it("returns a reason (never throws) when the endpoint is unreachable", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED")) as unknown as typeof fetch;
    const result = await embedText("BRCA1");
    expect("reason" in result && result.reason).toBe("ollama_unreachable");
  });

  it("returns a reason on a non-OK HTTP response", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;
    const result = await embedText("BRCA1");
    expect("reason" in result && result.reason).toBe("ollama_http_500");
  });

  it("returns a reason when the response shape is malformed", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ embedding: "not-an-array" }),
    }) as unknown as typeof fetch;
    const result = await embedText("BRCA1");
    expect("reason" in result && result.reason).toBe("ollama_bad_response");
  });
});
