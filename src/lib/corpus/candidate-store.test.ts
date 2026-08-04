// Preflight item 1 — the candidate store reads corrected candidate artifacts WITHOUT containment,
// cannot be confused with production, and never silently falls back to the live corpus.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CandidateCorpusStore, CandidateRootError } from "./candidate-store";
import { FileCorpusStore } from "./file-store";
import { CORPUS_SCHEMA_VERSION, type CorpusRecordV2, type CorpusRecord } from "./types";

// rs4149056 was the F-01 Blocker (the incident's fabricated-ancestry record). The candidate store
// surfaces its corrected claims exactly as regenerated; the production store now serves them too
// (containment lifted 2026-08-03 after the full re-audit).
const CONTAINED_ID = "rs4149056";

function v2(id: string): CorpusRecordV2 {
  return {
    kind: "variant",
    id,
    facts: { kind: "variant", id, sources: [{ label: "dbSNP", url: "https://example.test" }] } as unknown as CorpusRecordV2["facts"],
    claims: [
      { text: "corrected candidate claim", supportingFactIds: ["var.gnomadAf"], claimType: "frequency_context", origin: "deterministic" },
    ],
    explanationState: "deterministic_only",
    aiAvailable: false,
    fallbackReason: null,
    provenance: {
      factsHash: `hash-${id}`, promptVersion: "3.0.0", modelId: "m", schemaVersion: "3.0.0",
      corpusSchemaVersion: CORPUS_SCHEMA_VERSION, generatedAt: "2026-07-29T00:00:00.000Z",
      retrievedAt: "2026-07-29", sources: [{ label: "dbSNP", url: "https://example.test" }],
    },
  };
}
// A production-shaped grounded record used to seed the live store for the withholding check.
function prod(id: string): CorpusRecord {
  return { ...v2(id), claims: v2(id).claims } as unknown as CorpusRecord;
}

describe("CandidateCorpusStore — isolation guarantees", () => {
  let candRoot: string, prodRoot: string;
  let cand: CandidateCorpusStore, prodStore: FileCorpusStore;

  beforeAll(async () => {
    candRoot = join(await mkdtemp(join(tmpdir(), "cand-")), "corpus-candidate");
    prodRoot = join(await mkdtemp(join(tmpdir(), "prod-")), "corpus");
    await mkdir(join(candRoot, "variant"), { recursive: true });
    await mkdir(join(prodRoot, "variant"), { recursive: true });
    // Candidate has the CORRECTED record; production has the (grounded, pre-containment) record.
    await writeFile(join(candRoot, "variant", `${CONTAINED_ID}.json`), JSON.stringify(v2(CONTAINED_ID)));
    await writeFile(join(prodRoot, "variant", `${CONTAINED_ID}.json`), JSON.stringify(prod(CONTAINED_ID)));
    await writeFile(join(candRoot, "manifest.json"), JSON.stringify({ corpusSchemaVersion: CORPUS_SCHEMA_VERSION, generatedAt: "x", counts: { genes: 0, variants: 1, withExplanation: 1, sourceOnly: 0 }, records: [{ kind: "variant", id: CONTAINED_ID, factsHash: "h", hasExplanation: true, generatedAt: "x" }] }));
    cand = new CandidateCorpusStore(candRoot);
    prodStore = new FileCorpusStore(prodRoot);
  });
  afterAll(async () => {
    await rm(candRoot, { recursive: true, force: true });
    await rm(prodRoot, { recursive: true, force: true });
  });

  it("surfaces the corrected candidate claims from the raw candidate store", async () => {
    const r = await cand.getVariant(CONTAINED_ID);
    expect(r?.claims?.[0]?.text).toBe("corrected candidate claim");
    expect(r?.claims?.[0]?.origin).toBe("deterministic");
    expect(r?.fallbackReason).toBeNull();
  });

  it("the production FileCorpusStore serves that id's claims as committed (containment lifted)", async () => {
    const r = await prodStore.getVariant(CONTAINED_ID);
    expect(r?.claims?.[0]?.text).toBe("corrected candidate claim");
    expect(r?.fallbackReason).toBeNull();
  });

  it("candidate and production roots cannot be confused — a 'corpus' root is refused", () => {
    expect(() => new CandidateCorpusStore(prodRoot)).toThrow(CandidateRootError);
    expect(() => new CandidateCorpusStore("corpus")).toThrow(CandidateRootError);
    expect(() => new CandidateCorpusStore("/some/path/corpus")).toThrow(CandidateRootError);
  });

  it("does NOT fall back to the production corpus — an id absent from the candidate root is null", async () => {
    // Present in production, absent from candidate → the candidate store returns null, never prod data.
    const onlyInProd = "rs334";
    await writeFile(join(prodRoot, "variant", `${onlyInProd}.json`), JSON.stringify(prod(onlyInProd)));
    expect(await cand.getVariant(onlyInProd)).toBeNull();
  });
});
