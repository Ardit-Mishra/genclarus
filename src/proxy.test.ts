// Regression tests for identifier-case canonicalization (src/proxy.ts). Guards the F1 fix from the
// 2026-07-28 Founder Acceptance Test: lowercase/mixed-case gene & variant ids must 308-redirect to
// the canonical URL across pages, /api/v1, and /embed — while canonical ids pass through untouched
// and there is no redirect loop.

import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

function run(path: string) {
  const res = proxy(new NextRequest(new URL(path, "https://genclarus.com")));
  return {
    status: res.status,
    location: res.headers.get("location"),
    isNext: res.headers.get("x-middleware-next") === "1",
  };
}

describe("proxy identifier canonicalization", () => {
  it("redirects lowercase gene page → canonical", () => {
    const r = run("/gene/brca1");
    expect(r.status).toBe(308);
    expect(r.location).toBe("https://genclarus.com/gene/BRCA1");
  });

  it("redirects lowercase gene API → canonical", () => {
    const r = run("/api/v1/gene/brca1");
    expect(r.status).toBe(308);
    expect(r.location).toBe("https://genclarus.com/api/v1/gene/BRCA1");
  });

  it("redirects mixed-case variant → lowercase rsid", () => {
    const r = run("/variant/RS6025");
    expect(r.status).toBe(308);
    expect(r.location).toBe("https://genclarus.com/variant/rs6025");
  });

  it("redirects lowercase embed → canonical", () => {
    const r = run("/embed/gene/brca1");
    expect(r.status).toBe(308);
    expect(r.location).toBe("https://genclarus.com/embed/gene/BRCA1");
  });

  it.each([
    "/gene/BRCA1",
    "/api/v1/gene/BRCA1",
    "/variant/rs6025",
    "/api/v1/variant/rs6025",
    "/embed/gene/BRCA1",
  ])("leaves canonical %s unchanged (no redirect)", (path) => {
    const r = run(path);
    expect(r.location).toBeNull();
    expect(r.isNext).toBe(true);
  });

  it("does not redirect an already-uppercase invalid gene (falls through to safe 404)", () => {
    const r = run("/gene/NOTAGENE");
    expect(r.location).toBeNull();
    expect(r.isNext).toBe(true);
  });

  it("does not redirect non-rsid-shaped variant input (leaves it for the route's own 404)", () => {
    const r = run("/variant/rsBAD");
    expect(r.location).toBeNull();
    expect(r.isNext).toBe(true);
  });

  it("has no redirect loop — the redirect target passes through unchanged", () => {
    const first = run("/gene/brca1");
    const target = new URL(first.location!).pathname;
    const second = run(target);
    expect(second.location).toBeNull();
    expect(second.isNext).toBe(true);
  });
});
