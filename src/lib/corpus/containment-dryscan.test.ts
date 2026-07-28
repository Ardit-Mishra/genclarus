// Regression lock for the 2026-07-28 containment EXPANSION: the 43 records the Stage-3 hardened-
// validator dry scan rejected (docs/qa/corpus-dryscan.json) must all be served source-only until
// each is corrected and re-audited. Asserts: (1) every rejected record is contained; (2) no record
// outside that set is newly contained; (3) facts + provenance survive; (4) claims → null with
// withheld_review. Independent of any Stage-3 implementation file.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileCorpusStore } from "./file-store";
import {
  applyContainment,
  CONTAINED_GENE_IDS,
  CONTAINED_VARIANT_IDS,
  CONTAINMENT_FALLBACK_REASON,
} from "./containment";
import { CORPUS_SCHEMA_VERSION, type CorpusRecord } from "./types";

// The exact rejected set from docs/qa/corpus-dryscan.json (43 = 2 genes + 41 variants).
const REJECTED_GENES = ["BRCA1", "GJB2"];
const REJECTED_VARIANTS = [
  "rs1042713", "rs1042714", "rs1045642", "rs1051730", "rs1056836", "rs1057910", "rs1138272",
  "rs113993960", "rs116855232", "rs121908025", "rs121908755", "rs121913529", "rs12721627",
  "rs1695", "rs17580", "rs1799945", "rs1799963", "rs1799983", "rs1800497", "rs1800562", "rs1800896",
  "rs1801133", "rs1801282", "rs2306283", "rs28897696", "rs28929474", "rs28934574", "rs34637584",
  "rs3745274", "rs4149056", "rs4149117", "rs4244285", "rs4986893", "rs5275", "rs6025", "rs662",
  "rs731236", "rs74315329", "rs75527207", "rs80359550", "rs887829",
];
// Records that were NOT rejected — must stay grounded / uncontained.
const CONTROLS_GENE = ["TP53", "CFTR", "APC"];
const CONTROLS_VARIANT = ["rs334", "rs7903146", "rs28897696x_notreal", "rs671"].filter((x) => x !== "rs28897696x_notreal");

function grounded(kind: "gene" | "variant", id: string): CorpusRecord {
  return {
    kind,
    id,
    facts: { kind, id, sources: [{ label: "dbSNP", url: "https://example.test" }] } as unknown as CorpusRecord["facts"],
    claims: [{ text: "some published claim", supportingFactIds: ["f1"], claimType: "classification_context" }],
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

describe("containment expansion — the 43 dry-scan-rejected records", () => {
  it("(1) contains every rejected record", () => {
    for (const g of REJECTED_GENES) expect(CONTAINED_GENE_IDS.has(g)).toBe(true);
    for (const v of REJECTED_VARIANTS) expect(CONTAINED_VARIANT_IDS.has(v)).toBe(true);
  });

  it("(1b) the contained set is EXACTLY the rejected set — no more, no fewer", () => {
    expect([...CONTAINED_GENE_IDS].sort()).toEqual([...REJECTED_GENES].sort());
    expect([...CONTAINED_VARIANT_IDS].sort()).toEqual([...REJECTED_VARIANTS].sort());
    expect(CONTAINED_GENE_IDS.size + CONTAINED_VARIANT_IDS.size).toBe(43);
  });

  it("(2) contains no record outside that set", () => {
    for (const g of CONTROLS_GENE) expect(CONTAINED_GENE_IDS.has(g)).toBe(false);
    for (const v of CONTROLS_VARIANT) expect(CONTAINED_VARIANT_IDS.has(v)).toBe(false);
  });

  it("(3)(4) a contained record → claims null + withheld_review, facts + provenance unchanged", () => {
    for (const kind of ["gene", "variant"] as const) {
      const id = kind === "gene" ? REJECTED_GENES[0] : REJECTED_VARIANTS[0];
      const src = grounded(kind, id);
      const out = applyContainment(src)!;
      expect(out.claims).toBeNull();
      expect(out.aiAvailable).toBe(false);
      expect(out.fallbackReason).toBe(CONTAINMENT_FALLBACK_REASON);
      expect(out.facts).toBe(src.facts); // untouched reference
      expect(out.provenance).toBe(src.provenance);
    }
  });

  it("(2b) a control record passes through untouched", () => {
    const ctrl = grounded("variant", "rs334");
    expect(applyContainment(ctrl)).toBe(ctrl);
    expect(applyContainment(grounded("gene", "TP53"))!.claims?.length).toBe(1);
  });

  describe("through the FileCorpusStore read path", () => {
    let root: string;
    let store: FileCorpusStore;
    beforeAll(async () => {
      root = await mkdtemp(join(tmpdir(), "containment-expand-"));
      await mkdir(join(root, "gene"), { recursive: true });
      await mkdir(join(root, "variant"), { recursive: true });
      await writeFile(join(root, "gene", "BRCA1.json"), JSON.stringify(grounded("gene", "BRCA1")));
      await writeFile(join(root, "gene", "TP53.json"), JSON.stringify(grounded("gene", "TP53")));
      await writeFile(join(root, "variant", "rs4149056.json"), JSON.stringify(grounded("variant", "rs4149056")));
      await writeFile(join(root, "variant", "rs334.json"), JSON.stringify(grounded("variant", "rs334")));
      store = new FileCorpusStore(root);
    });
    afterAll(async () => {
      await rm(root, { recursive: true, force: true });
    });

    it("serves a contained gene + variant source-only, controls still grounded", async () => {
      expect((await store.getGene("BRCA1"))?.claims).toBeNull();
      expect((await store.getGene("BRCA1"))?.fallbackReason).toBe(CONTAINMENT_FALLBACK_REASON);
      expect((await store.getVariant("rs4149056"))?.claims).toBeNull();
      expect((await store.getGene("TP53"))?.claims?.length).toBe(1);
      expect((await store.getVariant("rs334"))?.claims?.length).toBe(1);
    });
  });
});
