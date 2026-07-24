// Route-integration tests for /api/gene against a fixed real MyGene.info record.
// Only the network boundary is stubbed; validation, parsing and response shape run for real.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { POST } from "./route";
import { brca1MyGene } from "@/test/fixtures/sources";

const realFetch = globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function post(body: unknown, contentType = "application/json"): Request {
  return new Request("https://genclarus.com/api/gene", {
    method: "POST",
    headers: { "content-type": contentType },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  delete process.env.NVIDIA_API_KEY; // assert the deterministic layer, not model output
  globalThis.fetch = vi.fn(async () => jsonResponse({ hits: brca1MyGene })) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe("POST /api/gene — request validation", () => {
  it("rejects a non-JSON content type with 415", async () => {
    expect((await POST(post({ gene: "BRCA1" }, "text/plain"))).status).toBe(415);
  });

  it("rejects unexpected body properties with 400", async () => {
    expect((await POST(post({ gene: "BRCA1", extra: 1 }))).status).toBe(400);
  });

  it("rejects a symbol with illegal characters and never calls out", async () => {
    expect((await POST(post({ gene: "BRCA1; DROP" }))).status).toBe(400);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe("POST /api/gene — BRCA1", () => {
  it("renders the source record's facts, uppercasing the symbol", async () => {
    const body = await (await POST(post({ gene: " brca1 " }))).json();
    expect(body.symbol).toBe("BRCA1");
    expect(body.name).toBe("BRCA1 DNA repair associated");
    expect(body.type).toBe("protein-coding");
    expect(body.summary).toContain("nuclear phosphoprotein");
    expect(body.aliases).toContain("FANCS");
    expect(body.uniprot).toBe("P38398");
  });

  it("formats the genomic location including the minus strand", async () => {
    const body = await (await POST(post({ gene: "BRCA1" }))).json();
    expect(body.location).toBe("chr17:43,044,292–43,170,245 (−)");
  });

  it("links every source the record supports", async () => {
    const body = await (await POST(post({ gene: "BRCA1" }))).json();
    const labels = (body.sources as { label: string }[]).map((s) => s.label);
    expect(labels).toEqual(["NCBI Gene", "Ensembl", "UniProt", "OMIM", "GeneCards"]);
  });

  it("stamps provenance and version metadata", async () => {
    const body = await (await POST(post({ gene: "BRCA1" }))).json();
    expect(body.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.meta.schemaVersion).toBeTruthy();
  });

  it("falls back to source-only output when the model is unavailable", async () => {
    const body = await (await POST(post({ gene: "BRCA1" }))).json();
    expect(body.aiUnavailable).toBe(true);
    expect(body.explanation).toBeNull();
    expect(body.summary.length).toBeGreaterThan(0); // page still has something true to show
  });
});

describe("POST /api/gene — upstream failures", () => {
  it("returns 404 when no human gene matches", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ hits: [] })) as typeof fetch;
    expect((await POST(post({ gene: "NOTAGENE" }))).status).toBe(404);
  });

  it("returns 502 when MyGene is unreachable", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("ETIMEDOUT");
    }) as typeof fetch;
    expect((await POST(post({ gene: "BRCA1" }))).status).toBe(502);
  });

  it("returns 502 when MyGene answers with an error status", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ error: "nope" }, 503)) as typeof fetch;
    expect((await POST(post({ gene: "BRCA1" }))).status).toBe(502);
  });
});
