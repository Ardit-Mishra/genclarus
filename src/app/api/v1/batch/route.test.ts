// Route tests for POST /api/v1/batch against the real committed corpus (no network — corpus reads
// only). Verifies: mixed gene/variant/unknown ids resolve correctly, batch results match the same
// PublicRecord shape the single-record /api/v1/{gene,variant}/[id] routes return, and malformed/
// oversized bodies are rejected with 400 before any corpus read.

import { describe, it, expect, beforeEach } from "vitest";
import { POST } from "./route";
import { GET as getGene } from "../gene/[symbol]/route";
import { GET as getVariant } from "../variant/[rsid]/route";
import { clearRateLimitState } from "@/lib/rate-limit";

function post(body: unknown, contentType = "application/json"): Request {
  return new Request("https://genclarus.com/api/v1/batch", {
    method: "POST",
    headers: { "content-type": contentType },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  clearRateLimitState(); // otherwise this suite's own request volume could self-trip the limiter
});

describe("POST /api/v1/batch — request validation", () => {
  it("rejects a non-JSON content type with 415", async () => {
    expect((await POST(post({ ids: ["BRCA1"] }, "text/plain"))).status).toBe(415);
  });

  it("rejects a body with unexpected fields with 400", async () => {
    expect((await POST(post({ ids: ["BRCA1"], extra: 1 }))).status).toBe(400);
  });

  it("rejects a missing ids field with 400", async () => {
    expect((await POST(post({}))).status).toBe(400);
  });

  it("rejects a non-array ids field with 400", async () => {
    expect((await POST(post({ ids: "BRCA1" }))).status).toBe(400);
  });

  it("rejects an empty ids array with 400", async () => {
    expect((await POST(post({ ids: [] }))).status).toBe(400);
  });

  it("rejects a non-string element with 400", async () => {
    expect((await POST(post({ ids: ["BRCA1", 123] }))).status).toBe(400);
  });

  it("rejects a blank string element with 400", async () => {
    expect((await POST(post({ ids: ["BRCA1", "   "] }))).status).toBe(400);
  });

  it("rejects a batch over the cap with 400", async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `GENE${i}`);
    const res = await POST(post({ ids }));
    expect(res.status).toBe(400);
  });

  it("accepts a batch exactly at the cap", async () => {
    const ids = Array.from({ length: 100 }, (_, i) => `GENE${i}`);
    const res = await POST(post({ ids }));
    expect(res.status).toBe(200);
  });
});

describe("POST /api/v1/batch — mixed gene/variant/unknown lookup", () => {
  it("resolves a gene, a variant, and an unknown id in one call", async () => {
    const res = await POST(post({ ids: ["BRCA1", "rs6025", "NOTAREALIDENTIFIER"] }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.counts).toEqual({ requested: 3, found: 2, notFound: 1 });
    expect(body.results).toHaveLength(3);

    const [brca1, rs6025, unknown] = body.results;
    expect(brca1.id).toBe("BRCA1");
    expect(brca1.found).toBe(true);
    expect(brca1.record.kind).toBe("gene");
    expect(brca1.record.id).toBe("BRCA1");

    expect(rs6025.id).toBe("rs6025");
    expect(rs6025.found).toBe(true);
    expect(rs6025.record.kind).toBe("variant");
    expect(rs6025.record.id).toBe("rs6025");

    expect(unknown.id).toBe("NOTAREALIDENTIFIER");
    expect(unknown.found).toBe(false);
    expect(unknown).not.toHaveProperty("record");
  });

  it("routes rsid-shaped ids to the variant store even with mixed case", async () => {
    const res = await POST(post({ ids: ["RS6025"] }));
    const body = await res.json();
    expect(body.results[0].found).toBe(true);
    expect(body.results[0].record.kind).toBe("variant");
  });

  it("normalizes a lowercase/whitespace-padded gene symbol the same way the store does", async () => {
    const res = await POST(post({ ids: [" brca1 "] }));
    const body = await res.json();
    expect(body.results[0].found).toBe(true);
    expect(body.results[0].record.id).toBe("BRCA1");
  });

  it("returns not-found (never an error) for a malformed identifier", async () => {
    const res = await POST(post({ ids: ["; DROP TABLE"] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results[0].found).toBe(false);
  });

  it("matches the single-record /api/v1/gene/[symbol] route byte-for-byte", async () => {
    const single = await (
      await getGene(new Request("https://genclarus.com/api/v1/gene/BRCA1"), {
        params: Promise.resolve({ symbol: "BRCA1" }),
      })
    ).json();
    const batch = await (await POST(post({ ids: ["BRCA1"] }))).json();
    expect(batch.results[0].record).toEqual(single);
  });

  it("matches the single-record /api/v1/variant/[rsid] route byte-for-byte", async () => {
    const single = await (
      await getVariant(new Request("https://genclarus.com/api/v1/variant/rs6025"), {
        params: Promise.resolve({ rsid: "rs6025" }),
      })
    ).json();
    const batch = await (await POST(post({ ids: ["rs6025"] }))).json();
    expect(batch.results[0].record).toEqual(single);
  });

  it("resolves every id in a larger multi-gene, multi-variant panel", async () => {
    const ids = ["TP53", "CFTR", "rs334", "rs429358", "NOTREAL1", "NOTREAL2"];
    const res = await POST(post({ ids }));
    const body = await res.json();
    expect(body.counts).toEqual({ requested: 6, found: 4, notFound: 2 });
  });
});
