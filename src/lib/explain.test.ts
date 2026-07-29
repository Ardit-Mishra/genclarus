// The cache key is a correctness feature, not a performance one: a cached narrative must never
// outlive the facts, prompt, model or schema that produced it.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { cacheKey, factsHash, explain, clearExplanationCache } from "./explain";
import type { GeneFacts, VariantFacts } from "./facts";
import type { NimResult } from "./nim";

// The synthesis I/O boundary is mocked so explain()'s ORCHESTRATION can be tested with the real
// grounding validator. primaryBackend = nim, escalationBackend = openrouter; synthesize answers per
// backend so a test states "primary did X, escalation did Y" and asserts the combined outcome.
const { synthesizeMock } = vi.hoisted(() => ({ synthesizeMock: vi.fn() }));
vi.mock("./nim", () => ({
  synthesize: synthesizeMock,
  primaryBackend: () => ({ label: "nim", url: "n", model: "m", apiKey: "k" }),
  escalationBackend: () => ({ label: "openrouter", url: "o", model: "m:free", apiKey: "k" }),
}));

function ok(explanation: string): NimResult {
  return { explanation, aiAvailable: true, fallbackReason: null, failureCategory: null, attempts: 1 };
}
// The model answered but the text is unusable — ground() will fail to parse/validate it.
const UNGROUNDABLE = "not json, just prose the validator cannot verify";
// The provider never produced text (outage / rate-limit) — ground() reports no_output.
function down(): NimResult {
  return { explanation: null, aiAvailable: false, fallbackReason: "provider_unavailable", failureCategory: "rate_limited", attempts: 3 };
}

const gene: GeneFacts = {
  kind: "gene",
  symbol: "BRCA1",
  name: "BRCA1 DNA repair associated",
  type: "protein-coding",
  summary: "This gene encodes a nuclear phosphoprotein.",
  aliases: ["FANCS"],
  location: "chr17:43,044,292–43,170,245 (−)",
  uniprot: "P38398",
  sources: [{ label: "NCBI Gene", url: "https://www.ncbi.nlm.nih.gov/gene/672" }],
  retrievedAt: "2026-07-24T00:00:00.000Z",
};

const variant: VariantFacts = {
  kind: "variant",
  rsid: "rs6025",
  gene: "F5",
  consequence: "missense variant",
  proteinChange: "p.Arg534Gln",
  uniprot: "P12259",
  residue: 534,
  alleleCount: 2,
  otherAlleles: [
    {
      proteinChange: "",
      refAlt: "C>C",
      variantId: 226007,
      significance: "Conflicting interpretations",
    },
  ],
  variantType: "single nucleotide variant",
  preferredName: "NM_000130.4(F5):c.1601G>A (p.Arg534Gln)",
  chrom: "1",
  position: 169549811,
  refAlt: "C>T",
  assembly: "GRCh38",
  conditionClassifications: [
    {
      condition: "Thrombophilia due to activated protein C resistance (THPH2)",
      significance: "Pathogenic",
      rawSignificance: "Pathogenic/Pathogenic, low penetrance",
      significanceRank: 0,
      reviewStatus: "criteria provided, multiple submitters, no conflicts",
      reviewStars: 2,
      origin: "germline",
      lastEvaluated: "2023-07-12",
    },
  ],
  distinctSignificances: ["Pathogenic"],
  hasSomatic: false,
  hasGermline: true,
  gnomadAf: 0.0123,
  hasClinvar: true,
  hgvsId: "chr1:g.169519049C>T",
  variantId: 642,
  sources: [{ label: "dbSNP", url: "https://www.ncbi.nlm.nih.gov/snp/rs6025" }],
  retrievedAt: "2026-07-24T00:00:00.000Z",
};

describe("factsHash", () => {
  it("is stable for identical facts", () => {
    expect(factsHash(gene)).toBe(factsHash({ ...gene }));
  });

  it("ignores changes the model never sees", () => {
    // A fresh retrieval stamp or an extra source link cannot change the narrative, so it must
    // not throw away a perfectly good cached one.
    expect(factsHash({ ...gene, retrievedAt: "2027-01-01T00:00:00.000Z" })).toBe(factsHash(gene));
    expect(factsHash({ ...gene, sources: [] })).toBe(factsHash(gene));
  });

  it("changes when the biology changes", () => {
    expect(factsHash({ ...gene, summary: "A different summary." })).not.toBe(factsHash(gene));
  });

  it("changes when a ClinVar classification changes", () => {
    const reclassified: VariantFacts = {
      ...variant,
      conditionClassifications: [
        { ...variant.conditionClassifications[0], significance: "Uncertain significance" },
      ],
    };
    // The scenario this exists for: ClinVar reclassifies a variant and yesterday's confident
    // explanation is now wrong. It must not be served.
    expect(factsHash(reclassified)).not.toBe(factsHash(variant));
  });
});

describe("cacheKey", () => {
  it("includes the identifier, fact hash, prompt, model and schema versions", () => {
    const parts = cacheKey(gene).split("|");
    expect(parts[0]).toBe("gene");
    expect(parts[1]).toBe("BRCA1");
    expect(parts[2]).toBe(factsHash(gene));
    expect(parts).toHaveLength(6);
    expect(parts.every(Boolean)).toBe(true);
  });

  it("separates genes from variants that share a name", () => {
    expect(cacheKey(gene)).not.toBe(cacheKey(variant));
  });
});

// The production regression that motivated this: adding a flaky free escalation made variant
// lookups WORSE. When the primary produced ungroundable text (failed_grounding) and the escalation
// call then errored, the escalation's provider_unavailable overwrote the primary's honest outcome.
// Escalation must be a bonus, never a downgrade.
describe("explain — escalation must never worsen the primary's outcome", () => {
  beforeEach(() => {
    clearExplanationCache();
    synthesizeMock.mockReset();
  });

  // Tested via a GENE: genes have no deterministic clinical rendering, so the outcome is purely the
  // LLM-context path — the exact binary this invariant is about. (The escalation orchestration is
  // identical for variants; the variant-specific improvement is covered separately below.)
  it("keeps the primary's failed_grounding when the escalation fails to produce text", async () => {
    // Primary answers but the text can't be grounded; escalation is down.
    synthesizeMock.mockImplementation((_msgs: unknown, backend: { label: string }) =>
      Promise.resolve(backend.label === "openrouter" ? down() : ok(UNGROUNDABLE)),
    );
    const r = await explain(gene);
    expect(r.claims).toBeNull();
    // The honest report is that we could not GROUND the answer — not that the provider was down.
    expect(r.fallbackReason).toBe("failed_grounding");
    expect(r.aiAvailable).toBe(true);
  });

  it("adopts the escalation only when it actually grounds", async () => {
    // Primary ungroundable, escalation returns a NON-CLINICAL claim that DOES ground → served.
    synthesizeMock.mockImplementation((_msgs: unknown, backend: { label: string }) => {
      if (backend.label === "openrouter") {
        const good = JSON.stringify({
          claims: [{
            text: `The ${gene.symbol} gene encodes a nuclear phosphoprotein.`,
            supportingFactIds: ["gene.symbol", "gene.summary"],
            claimType: "function",
          }],
        });
        return Promise.resolve(ok(good));
      }
      return Promise.resolve(ok(UNGROUNDABLE));
    });
    const r = await explain(gene);
    expect(r.fallbackReason).toBeNull();
    expect(r.claims).not.toBeNull();
    expect(r.claims!.length).toBeGreaterThan(0);
    expect(r.state).toBe("grounded");
  });

  it("still reports a genuine primary outage honestly (no escalation rescue)", async () => {
    // Both backends down → the outage IS the truth; the fix must not mask it as failed_grounding.
    synthesizeMock.mockResolvedValue(down());
    const r = await explain(gene);
    expect(r.claims).toBeNull();
    expect(r.fallbackReason).toBe("provider_unavailable");
    expect(r.aiAvailable).toBe(false);
  });

  it("a variant still renders deterministic clinical statements when the LLM is down (deterministic_only)", async () => {
    // The core incident improvement: clinical output no longer depends on the flaky LLM.
    synthesizeMock.mockResolvedValue(down());
    const r = await explain(variant);
    expect(r.state).toBe("deterministic_only");
    expect(r.claims).not.toBeNull();
    expect(r.claims!.length).toBeGreaterThan(0);
    // No unverified LLM prose; the honest reason for the missing narrative is surfaced.
    expect(r.fallbackReason).toBe("provider_unavailable");
    // Low-penetrance qualifier from the raw significance is preserved deterministically.
    expect(r.claims!.map((c) => c.text).join(" ").toLowerCase()).toContain("low penetrance");
  });
});
