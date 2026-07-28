// Regression test for the /api/v1/variant/[rsid] JSON-404 contract (F2 fix, 2026-07-28 Founder
// Acceptance Test): an unknown rsID must return a structured JSON 404 (consistent with /api/v1/batch),
// not Next's HTML 404. A known rsID returns the PublicRecord.

import { describe, it, expect } from "vitest";
import { GET } from "./route";

function call(rsid: string) {
  return GET(new Request(`https://genclarus.com/api/v1/variant/${rsid}`), {
    params: Promise.resolve({ rsid }),
  });
}

describe("GET /api/v1/variant/[rsid]", () => {
  it("returns a structured JSON 404 for an unknown variant", async () => {
    const res = await call("rs999999999");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });

  it("returns the PublicRecord for a known corpus variant", async () => {
    const res = await call("rs6025");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("rs6025");
    expect(body.kind).toBe("variant");
    expect(body.provenance.factsHash).toBeTruthy();
  });
});
