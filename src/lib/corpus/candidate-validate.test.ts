// Preflight item 2 — strict v2 candidate validation rejects mixed v1/v2, missing origins, stored
// state disagreeing with computed state, and a manifest whose version disagrees with its records.

import { describe, it, expect } from "vitest";
import { validateCandidateRecord, validateCandidateManifest } from "./candidate-validate";
import { CORPUS_SCHEMA_VERSION, type CorpusRecordV2, type CorpusManifest } from "./types";
import { PROMPT_VERSION, OUTPUT_SCHEMA_VERSION } from "../version";

function clean(overrides: Partial<CorpusRecordV2> = {}): CorpusRecordV2 {
  return {
    kind: "variant",
    id: "rs1",
    facts: { kind: "variant", id: "rs1" } as unknown as CorpusRecordV2["facts"],
    claims: [
      { text: "clinical", supportingFactIds: ["var.cond.0.significance"], claimType: "classification_context", origin: "deterministic" },
      { text: "context", supportingFactIds: ["var.gene"], claimType: "function", origin: "llm" },
    ],
    explanationState: "grounded",
    aiAvailable: true,
    fallbackReason: null,
    provenance: {
      factsHash: "h", promptVersion: PROMPT_VERSION, modelId: "m", schemaVersion: OUTPUT_SCHEMA_VERSION,
      corpusSchemaVersion: CORPUS_SCHEMA_VERSION, generatedAt: "x", retrievedAt: "y",
      sources: [{ label: "dbSNP", url: "https://example.test" }],
    },
    ...overrides,
  };
}
const rules = (r: unknown) => validateCandidateRecord(r).map((i) => i.rule);

describe("validateCandidateRecord", () => {
  it("accepts a clean v2 record", () => {
    expect(validateCandidateRecord(clean())).toEqual([]);
  });

  it("rejects a claim missing origin (v1-style claim in a v2 record → mixed)", () => {
    const r = clean();
    delete (r.claims![0] as { origin?: string }).origin;
    expect(rules(r)).toContain("missing_origin");
  });

  it("rejects a missing explanationState", () => {
    const r = clean();
    delete (r as { explanationState?: string }).explanationState;
    expect(rules(r)).toContain("missing_state");
  });

  it("rejects stored state disagreeing with computed state", () => {
    // claims include an llm origin → computed 'grounded', but stored says 'deterministic_only'.
    expect(rules(clean({ explanationState: "deterministic_only" }))).toContain("state_disagrees");
  });

  it("rejects claims=null paired with a non-source_only state", () => {
    expect(rules(clean({ claims: null, explanationState: "grounded" }))).toContain("state_disagrees");
  });

  it("accepts claims=null with source_only", () => {
    expect(validateCandidateRecord(clean({ claims: null, explanationState: "source_only", aiAvailable: false, fallbackReason: "provider_unavailable" }))).toEqual([]);
  });

  it("rejects wrong prompt/schema/corpus versions", () => {
    const r = clean();
    r.provenance.promptVersion = "2.0.0";
    r.provenance.corpusSchemaVersion = "1.0.0";
    const got = rules(r);
    expect(got).toContain("bad_prompt_version");
    expect(got).toContain("bad_corpus_version");
  });

  it("rejects a claim with no citations", () => {
    const r = clean();
    r.claims![0].supportingFactIds = [];
    expect(rules(r)).toContain("missing_citation");
  });
});

describe("validateCandidateManifest", () => {
  const rec = clean();
  const manifest = (over: Partial<CorpusManifest> = {}): CorpusManifest => ({
    corpusSchemaVersion: CORPUS_SCHEMA_VERSION,
    generatedAt: "x",
    counts: { genes: 0, variants: 1, withExplanation: 1, sourceOnly: 0 },
    records: [{ kind: "variant", id: "rs1", factsHash: "h", hasExplanation: true, generatedAt: "x" }],
    ...over,
  });

  it("accepts an agreeing manifest", () => {
    expect(validateCandidateManifest(manifest(), [rec])).toEqual([]);
  });

  it("rejects a manifest whose version disagrees with its records (mixed)", () => {
    const rules2 = validateCandidateManifest(manifest({ corpusSchemaVersion: "1.0.0" }), [rec]).map((i) => i.rule);
    expect(rules2).toContain("manifest_version");
    expect(rules2).toContain("mixed_version");
  });

  it("flags a record missing from the manifest and vice versa", () => {
    const extra = validateCandidateManifest(manifest({ records: [] }), [rec]).map((i) => i.rule);
    expect(extra).toContain("manifest_missing");
  });
});
