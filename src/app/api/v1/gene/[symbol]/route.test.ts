// Regression test for the /api/v1/gene/[symbol] JSON-404 contract (F2 fix, 2026-07-28 Founder
// Acceptance Test): an unknown gene must return a structured JSON 404 (consistent with /api/v1/batch),
// not Next's HTML 404. A known gene returns the PublicRecord. dynamicParams=true is what makes the
// handler run for unknown ids in production; here we exercise the handler directly.

import { describe, it, expect } from "vitest";
import { GET } from "./route";

function call(symbol: string) {
  return GET(new Request(`https://genclarus.com/api/v1/gene/${symbol}`), {
    params: Promise.resolve({ symbol }),
  });
}

describe("GET /api/v1/gene/[symbol]", () => {
  it("returns a structured JSON 404 for an unknown gene", async () => {
    const res = await call("NOTAGENE");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });

  it("returns the PublicRecord for a known corpus gene", async () => {
    const res = await call("BRCA1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("BRCA1");
    expect(body.kind).toBe("gene");
    expect(body.provenance.factsHash).toBeTruthy();
  });
});
