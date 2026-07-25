import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rs121913529Clinvar } from "@/test/fixtures/sources";
import { clearFactCaches, getVariantFacts } from "./facts";

const realFetch = globalThis.fetch;

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  clearFactCaches();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("clinvar.rsid")) return jsonResponse({ hits: rs121913529Clinvar });
    throw new Error(`unexpected outbound call: ${url}`);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe("getVariantFacts multi-allelic rsID selection", () => {
  it("selects KRAS G12D by characterization and discloses G12A and G12V", async () => {
    const facts = await getVariantFacts("rs121913529");

    expect(facts.proteinChange).toBe("p.Gly12Asp");
    expect(facts.alleleCount).toBe(3);
    expect(facts.otherAlleles).toEqual([
      {
        proteinChange: "p.Gly12Val",
        refAlt: "C>A",
        variantId: 12583,
        significance: "Pathogenic",
      },
      {
        proteinChange: "p.Gly12Ala",
        refAlt: "C>G",
        variantId: 45122,
        significance: "Pathogenic",
      },
    ]);
  });
});
