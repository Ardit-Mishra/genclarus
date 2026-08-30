// Route-integration tests for /api/search. The retrieval layer itself (BM25, hybrid fusion,
// embedding fallback) is unit-tested in src/lib/retrieval/*.test.ts — this file only covers the
// route's own job: request validation, rate limiting, and translating a search() result into the
// public response shape.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { clearRateLimitState } from "@/lib/rate-limit";

const searchMock = vi.fn();
vi.mock("@/lib/retrieval/search", () => ({ search: (...args: unknown[]) => searchMock(...args) }));

import { POST } from "./route";

function post(body: unknown, contentType = "application/json"): Request {
  return new Request("https://genclarus.com/api/search", {
    method: "POST",
    headers: { "content-type": contentType },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  clearRateLimitState();
  searchMock.mockReset();
  searchMock.mockResolvedValue({
    hits: [{ id: "rs334", kind: "variant", score: 0.9 }],
    semanticAvailable: true,
    semanticReason: null,
  });
});

describe("POST /api/search — request validation", () => {
  it("rejects a non-JSON content type with 415", async () => {
    expect((await POST(post({ query: "sickle cell" }, "text/plain"))).status).toBe(415);
  });

  it("rejects a body with unexpected fields with 400", async () => {
    expect((await POST(post({ query: "sickle cell", extra: 1 }))).status).toBe(400);
  });

  it("rejects a missing query with 400", async () => {
    expect((await POST(post({}))).status).toBe(400);
  });

  it("rejects an empty/whitespace-only query with 400", async () => {
    expect((await POST(post({ query: "   " }))).status).toBe(400);
  });

  it("rejects a query over the length cap with 400", async () => {
    expect((await POST(post({ query: "x".repeat(201) }))).status).toBe(400);
  });

  it("rejects a non-integer k with 400", async () => {
    expect((await POST(post({ query: "sickle cell", k: 1.5 }))).status).toBe(400);
  });

  it("rejects a k outside 1..20 with 400", async () => {
    expect((await POST(post({ query: "sickle cell", k: 0 }))).status).toBe(400);
    expect((await POST(post({ query: "sickle cell", k: 21 }))).status).toBe(400);
  });
});

describe("POST /api/search — happy path", () => {
  it("returns the ranked hits and semantic status from search()", async () => {
    const res = await POST(post({ query: "the sickle cell mutation" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toEqual([{ id: "rs334", kind: "variant", score: 0.9 }]);
    expect(body.semanticAvailable).toBe(true);
    expect(searchMock).toHaveBeenCalledWith("the sickle cell mutation", 5);
  });

  it("passes a custom k through to search()", async () => {
    await POST(post({ query: "cystic fibrosis", k: 3 }));
    expect(searchMock).toHaveBeenCalledWith("cystic fibrosis", 3);
  });

  it("reports semanticAvailable:false and a reason when search() degrades to lexical-only", async () => {
    searchMock.mockResolvedValue({ hits: [], semanticAvailable: false, semanticReason: "ollama_unreachable" });
    const res = await POST(post({ query: "cystic fibrosis" }));
    const body = await res.json();
    expect(body.semanticAvailable).toBe(false);
    expect(body.semanticReason).toBe("ollama_unreachable");
  });
});

describe("POST /api/search — rate limiting", () => {
  it("returns 429 once the search budget for a client is exhausted", async () => {
    const req = () =>
      new Request("https://genclarus.com/api/search", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "1.1.1.1" },
        body: JSON.stringify({ query: "brca1" }),
      });
    for (let i = 0; i < 30; i++) {
      expect((await POST(req())).status).toBe(200);
    }
    expect((await POST(req())).status).toBe(429);
  });
});
