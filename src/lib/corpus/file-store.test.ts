import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileCorpusStore } from "./file-store";
import { CORPUS_SCHEMA_VERSION, type CorpusRecord, type CorpusManifest } from "./types";

let root: string;
let store: FileCorpusStore;

function record(kind: "gene" | "variant", id: string): CorpusRecord {
  return {
    kind,
    id,
    // Minimal facts stub — the store does not interpret facts, it only serves the artifact.
    facts: { kind, id } as unknown as CorpusRecord["facts"],
    claims: kind === "gene" ? [{ text: "x", supportingFactIds: ["f1"], claimType: "identity" }] : null,
    aiAvailable: kind === "gene",
    fallbackReason: kind === "gene" ? null : "failed_grounding",
    provenance: {
      factsHash: `hash-${id}`,
      promptVersion: "2.0.0",
      modelId: "m",
      schemaVersion: "2.0.0",
      corpusSchemaVersion: CORPUS_SCHEMA_VERSION,
      generatedAt: "2026-07-27T00:00:00.000Z",
      retrievedAt: "2026-07-27",
      sources: [{ label: "dbSNP", url: "https://example.test" }],
    },
  };
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "corpus-test-"));
  await mkdir(join(root, "gene"), { recursive: true });
  await mkdir(join(root, "variant"), { recursive: true });
  await writeFile(join(root, "gene", "TP53.json"), JSON.stringify(record("gene", "TP53")));
  await writeFile(join(root, "variant", "rs100200300.json"), JSON.stringify(record("variant", "rs100200300")));
  const manifest: CorpusManifest = {
    corpusSchemaVersion: CORPUS_SCHEMA_VERSION,
    generatedAt: "2026-07-27T00:00:00.000Z",
    counts: { genes: 1, variants: 1, withExplanation: 1, sourceOnly: 1 },
    records: [
      { kind: "gene", id: "TP53", factsHash: "hash-TP53", hasExplanation: true, generatedAt: "2026-07-27T00:00:00.000Z" },
      { kind: "variant", id: "rs100200300", factsHash: "hash-rs100200300", hasExplanation: false, generatedAt: "2026-07-27T00:00:00.000Z" },
    ],
  };
  await writeFile(join(root, "manifest.json"), JSON.stringify(manifest));
  store = new FileCorpusStore(root);
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("FileCorpusStore", () => {
  it("reads a gene record and normalizes the key (case-insensitive)", async () => {
    const r = await store.getGene("tp53");
    expect(r?.id).toBe("TP53");
    expect(r?.claims?.length).toBe(1);
    expect(r?.provenance.factsHash).toBe("hash-TP53");
  });

  it("reads a variant source-only record", async () => {
    const r = await store.getVariant("RS100200300");
    expect(r?.id).toBe("rs100200300");
    expect(r?.claims).toBeNull();
    expect(r?.fallbackReason).toBe("failed_grounding");
  });

  it("returns null for absent or malformed ids", async () => {
    expect(await store.getGene("NOTAREALGENE123")).toBeNull();
    expect(await store.getVariant("rs999999999")).toBeNull();
    expect(await store.getVariant("not-an-rsid")).toBeNull();
  });

  it("lists corpus ids by kind from the manifest", async () => {
    expect(await store.listGenes()).toEqual(["TP53"]);
    expect(await store.listVariants()).toEqual(["rs100200300"]);
  });

  it("degrades to empty lists when no manifest exists", async () => {
    const empty = new FileCorpusStore(join(root, "does-not-exist"));
    expect(await empty.listGenes()).toEqual([]);
    expect(await empty.listVariants()).toEqual([]);
  });
});
