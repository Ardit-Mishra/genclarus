// Regression lock for the 2026-07-28 grounding-incident containment. These ids MUST be served as
// source-only (claims withheld, facts intact) until the validator is hardened and the corpus is
// re-audited. If a fix removes an id from the contained set, that is a deliberate change and this
// test's expectations should be updated alongside it — never silently.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileCorpusStore } from "./file-store";
import {
  applyContainment,
  CONTAINED_VARIANT_IDS,
  CONTAINMENT_FALLBACK_REASON,
} from "./containment";
import { CORPUS_SCHEMA_VERSION, type CorpusRecord } from "./types";

function grounded(kind: "gene" | "variant", id: string): CorpusRecord {
  return {
    kind,
    id,
    facts: { kind, id, sources: [{ label: "dbSNP", url: "https://example.test" }] } as unknown as CorpusRecord["facts"],
    claims: [{ text: "an unverified claim", supportingFactIds: ["f1"], claimType: "function" }],
    aiAvailable: true,
    fallbackReason: null,
    provenance: {
      factsHash: `hash-${id}`,
      promptVersion: "2.0.0",
      modelId: "m",
      schemaVersion: "2.0.0",
      corpusSchemaVersion: CORPUS_SCHEMA_VERSION,
      generatedAt: "2026-07-28T00:00:00.000Z",
      retrievedAt: "2026-07-28",
      sources: [{ label: "dbSNP", url: "https://example.test" }],
    },
  };
}

describe("corpus containment (incident 2026-07-28)", () => {
  it("covers every Layer C Blocker/Major corpus variant", () => {
    for (const id of ["rs4149056", "rs1799963", "rs6025", "rs1801133"]) {
      expect(CONTAINED_VARIANT_IDS.has(id)).toBe(true);
    }
  });

  it("withholds claims for a contained record but keeps facts + provenance", () => {
    const contained = applyContainment(grounded("variant", "rs4149056"))!;
    expect(contained.claims).toBeNull();
    expect(contained.aiAvailable).toBe(false);
    expect(contained.fallbackReason).toBe(CONTAINMENT_FALLBACK_REASON);
    expect(contained.facts).toBeTruthy();
    expect(contained.provenance.factsHash).toBe("hash-rs4149056");
  });

  it("passes non-contained records through untouched", () => {
    const rec = grounded("variant", "rs334");
    expect(applyContainment(rec)).toBe(rec);
    expect(applyContainment(grounded("gene", "BRCA1"))!.claims?.length).toBe(1);
    expect(applyContainment(null)).toBeNull();
  });

  describe("through the FileCorpusStore read path", () => {
    let root: string;
    let store: FileCorpusStore;

    beforeAll(async () => {
      root = await mkdtemp(join(tmpdir(), "containment-test-"));
      await mkdir(join(root, "variant"), { recursive: true });
      // A contained id is stored WITH claims — containment must strip them on read.
      await writeFile(join(root, "variant", "rs4149056.json"), JSON.stringify(grounded("variant", "rs4149056")));
      await writeFile(join(root, "variant", "rs334.json"), JSON.stringify(grounded("variant", "rs334")));
      store = new FileCorpusStore(root);
    });

    afterAll(async () => {
      await rm(root, { recursive: true, force: true });
    });

    it("serves a contained variant as source-only", async () => {
      const r = await store.getVariant("rs4149056");
      expect(r?.claims).toBeNull();
      expect(r?.fallbackReason).toBe(CONTAINMENT_FALLBACK_REASON);
    });

    it("still serves a non-contained variant's claims", async () => {
      const r = await store.getVariant("rs334");
      expect(r?.claims?.length).toBe(1);
    });
  });
});
