// Route-integration tests for /api/variant, driven by fixed real MyVariant records.
// Only the network boundary is stubbed (global fetch) — request validation, host allowlisting,
// bounded JSON reads, ClinVar interpretation and the response shape all run for real.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { POST } from "./route";
import { rs6025Clinvar, rs1000000Dbsnp } from "@/test/fixtures/sources";

const realFetch = globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Route the stub the same way MyVariant does: the ClinVar query first, dbSNP only as fallback.
function stubMyVariant(hits: { clinvar?: unknown[]; dbsnp?: unknown[] }) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("clinvar.rsid")) return jsonResponse({ hits: hits.clinvar ?? [] });
    if (url.includes("dbsnp.rsid")) return jsonResponse({ hits: hits.dbsnp ?? [] });
    throw new Error(`unexpected outbound call: ${url}`);
  }) as typeof fetch;
}

function post(body: unknown, contentType = "application/json"): Request {
  return new Request("https://genclarus.com/api/variant", {
    method: "POST",
    headers: { "content-type": contentType },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  // Unset so synthesize() short-circuits: these tests assert the deterministic data layer,
  // not model output. The NIM path gets its own test below.
  delete process.env.NVIDIA_API_KEY;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe("POST /api/variant — request validation", () => {
  it("rejects a non-JSON content type with 415", async () => {
    const res = await POST(post("rs6025", "text/plain"));
    expect(res.status).toBe(415);
  });

  it("rejects unexpected body properties with 400", async () => {
    const res = await POST(post({ rsid: "rs6025", extra: "x" }));
    expect(res.status).toBe(400);
  });

  it("rejects anything that is not an rsID with 400 and never calls out", async () => {
    stubMyVariant({ clinvar: rs6025Clinvar });
    const res = await POST(post({ rsid: "BRCA1" }));
    expect(res.status).toBe(400);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("returns a generic error carrying a request id, never internals", async () => {
    const body = await (await POST(post({ rsid: "nope" }))).json();
    expect(body.requestId).toMatch(/^[0-9a-f]{8}$/);
    expect(JSON.stringify(body)).not.toMatch(/myvariant|stack|Error:/i);
  });
});

describe("POST /api/variant — rs6025 (F5 Leiden)", () => {
  beforeEach(() => stubMyVariant({ clinvar: rs6025Clinvar }));

  it("selects the pathogenic alt-allele record, not the reference-allele one", async () => {
    const body = await (await POST(post({ rsid: "rs6025" }))).json();
    expect(body.variantId).toBe(642); // ClinVar Variation 642 (T allele), not 226007 (C allele)
    expect(body.proteinChange).toBe("p.Arg534Gln");
    expect(body.gene).toBe("F5");
    expect(body.hasClinvar).toBe(true);
  });

  it("reports classifications PER CONDITION and never as one overall verdict", async () => {
    const body = await (await POST(post({ rsid: "rs6025" }))).json();

    // The collapsed fields the old "most severe" model exposed must be gone for good.
    expect(body).not.toHaveProperty("primarySignificance");
    expect(body).not.toHaveProperty("significanceRank");
    expect(body).not.toHaveProperty("significances");
    expect(body).not.toHaveProperty("conditions");

    const rows = body.conditionClassifications as { condition: string; significance: string }[];
    const sig = (name: string) => rows.find((r) => r.condition === name)?.significance;
    expect(sig("Thrombophilia due to activated protein C resistance (THPH2)")).toBe("Pathogenic");
    expect(sig("hormonal contraceptives for systemic use response - Toxicity")).toBe("Drug response");
    expect(sig("Susceptibility to severe coronavirus disease (COVID-19) due to an impaired coagulation process")).toBe(
      "Uncertain significance",
    );
    // One variant, genuinely different answers depending on the condition asked about.
    expect(new Set(body.distinctSignificances).size).toBeGreaterThan(1);
  });

  it("expands an RCV that asserts several conditions into a row for each", async () => {
    const body = await (await POST(post({ rsid: "rs6025" }))).json();
    const names = (body.conditionClassifications as { condition: string }[]).map((r) => r.condition);
    // Only reachable via RCV005049305's conditions ARRAY — taking [0] would drop these.
    expect(names).toContain("Budd-Chiari syndrome (BDCHS)");
    expect(names).toContain("Pregnancy loss, recurrent, susceptibility to, 1 (RPRGL1)");
  });

  it("carries review status, stars, origin and evaluation date for each row", async () => {
    const body = await (await POST(post({ rsid: "rs6025" }))).json();
    const rows = body.conditionClassifications as Record<string, unknown>[];
    const expertPanel = rows.find(
      (r) => r.condition === "hormonal contraceptives for systemic use response - Toxicity",
    )!;
    expect(expertPanel.reviewStatus).toBe("reviewed by expert panel");
    expect(expertPanel.reviewStars).toBe(3);
    expect(expertPanel.origin).toBe("germline");
    expect(expertPanel.lastEvaluated).toBe("2021-03-24");
    // Every row keeps its verbatim ClinVar string alongside the normalized label.
    expect(rows.every((r) => typeof r.rawSignificance === "string")).toBe(true);
  });

  it("sorts uninformative conditions last", async () => {
    const body = await (await POST(post({ rsid: "rs6025" }))).json();
    const names = (body.conditionClassifications as { condition: string }[]).map((r) => r.condition);
    const vague = names.filter((n) => n === "not specified" || n === "not provided");
    expect(vague.length).toBeGreaterThan(0);
    expect(names.slice(-vague.length).sort()).toEqual(vague.sort());
  });

  it("prefers GRCh38 coordinates and only links gnomAD at that assembly", async () => {
    const body = await (await POST(post({ rsid: "rs6025" }))).json();
    expect(body.assembly).toBe("GRCh38");
    expect(body.position).toBe(169549811); // hg38, not the hg19 169519049 in the _id
    const gnomad = (body.sources as { label: string; url: string }[]).find(
      (s) => s.label === "gnomAD",
    )!;
    expect(gnomad.url).toContain("1-169549811-C-T");
  });

  it("stamps provenance and version metadata on every response", async () => {
    const body = await (await POST(post({ rsid: "rs6025" }))).json();
    expect(body.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.meta.promptVersion).toBeTruthy();
    expect(body.meta.modelId).toBeTruthy();
    expect(body.meta.schemaVersion).toBeTruthy();
    expect(body.sources.map((s: { label: string }) => s.label)).toContain("ClinVar");
  });

  it("falls back to source-only output when the model is unavailable", async () => {
    const body = await (await POST(post({ rsid: "rs6025" }))).json();
    expect(body.aiAvailable).toBe(false);
    expect(body.fallbackReason).toBe("not_configured");
    expect(body.explanation).toBeNull();
    // The classifications still stand on their own — the page stays useful without the LLM.
    expect(body.conditionClassifications.length).toBeGreaterThan(0);
  });

  it("normalizes the rsID case before lookup", async () => {
    const body = await (await POST(post({ rsid: " RS6025 " }))).json();
    expect(body.rsid).toBe("rs6025");
  });
});

describe("POST /api/variant — variants without a ClinVar record", () => {
  it("falls back to dbSNP and reports no classifications", async () => {
    stubMyVariant({ clinvar: [], dbsnp: rs1000000Dbsnp });
    const body = await (await POST(post({ rsid: "rs1000000" }))).json();
    expect(body.hasClinvar).toBe(false);
    expect(body.conditionClassifications).toEqual([]);
    expect(body.distinctSignificances).toEqual([]);
    expect(body.variantId).toBeNull();
    // No hg38 record, so no gnomAD link — better absent than pointing at the wrong coordinate.
    expect((body.sources as { label: string }[]).some((s) => s.label === "gnomAD")).toBe(false);
  });

  it("returns 404 when neither index knows the rsID", async () => {
    stubMyVariant({ clinvar: [], dbsnp: [] });
    expect((await POST(post({ rsid: "rs999999999" }))).status).toBe(404);
  });

  it("returns 502 when the variant database is unreachable", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("ECONNRESET");
    }) as typeof fetch;
    expect((await POST(post({ rsid: "rs6025" }))).status).toBe(502);
  });

  it("returns 502 when the upstream answers with non-JSON", async () => {
    globalThis.fetch = vi.fn(
      async () => new Response("<html>maintenance</html>", { headers: { "content-type": "text/html" } }),
    ) as typeof fetch;
    expect((await POST(post({ rsid: "rs6025" }))).status).toBe(502);
  });
});

describe("POST /api/variant — model synthesis", () => {
  it("attaches the explanation and hands the model per-condition facts only", async () => {
    process.env.NVIDIA_API_KEY = "test-key";
    let nimBody: { messages: { content: string }[] } | undefined;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("myvariant.info")) return jsonResponse({ hits: rs6025Clinvar });
      nimBody = JSON.parse(String(init?.body));
      return jsonResponse({ choices: [{ message: { content: "## What this variant is\nFactor V." } }] });
    }) as typeof fetch;

    const body = await (await POST(post({ rsid: "rs6025" }))).json();
    expect(body.aiAvailable).toBe(true);
    expect(body.fallbackReason).toBeNull();
    expect(body.explanation).toContain("Factor V");

    const facts = nimBody!.messages.map((m) => m.content).join("\n");
    expect(facts).toContain("clinvarByCondition");
    // The model is never handed a pre-collapsed verdict to parrot back.
    expect(facts).not.toContain("primarySignificance");
    expect(nimBody!.messages[0].content).toMatch(/PER CONDITION/);
  });
});
