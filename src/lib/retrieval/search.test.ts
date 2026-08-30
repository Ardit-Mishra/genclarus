import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LoadedIndex } from "./index-store";

const getRetrievalIndex = vi.fn<() => Promise<LoadedIndex>>();
vi.mock("./index-store", () => ({ getRetrievalIndex: () => getRetrievalIndex() }));

const embedText = vi.fn();
vi.mock("./ollama-embeddings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./ollama-embeddings")>();
  return { ...actual, embedText: (...args: unknown[]) => embedText(...args) };
});

import { buildBm25Index } from "./bm25";
import { search } from "./search";

const docs = [
  { id: "BRCA1", kind: "gene" as const, text: "BRCA1 breast cancer gene DNA repair", embedding: [1, 0] },
  { id: "rs334", kind: "variant" as const, text: "HBB sickle cell disease pathogenic missense", embedding: [0, 1] },
];

function fullyEmbeddedIndex(): LoadedIndex {
  const file = { schemaVersion: "1.0.0", generatedAt: "2026-01-01T00:00:00.000Z", embeddingModel: "nomic-embed-text", docCount: docs.length, docs };
  return { file, bm25: buildBm25Index(docs), semanticAvailable: true };
}

function lexicalOnlyIndex(): LoadedIndex {
  const noEmbed = docs.map((d) => ({ ...d, embedding: null }));
  const file = { schemaVersion: "1.0.0", generatedAt: "2026-01-01T00:00:00.000Z", embeddingModel: null, docCount: noEmbed.length, docs: noEmbed };
  return { file, bm25: buildBm25Index(noEmbed), semanticAvailable: false };
}

describe("search", () => {
  beforeEach(() => {
    getRetrievalIndex.mockReset();
    embedText.mockReset();
  });

  it("returns lexical matches when the index has no embeddings at all", async () => {
    getRetrievalIndex.mockResolvedValue(lexicalOnlyIndex());
    const result = await search("sickle cell disease", 5);
    expect(result.semanticAvailable).toBe(false);
    expect(result.semanticReason).toBe("index_not_fully_embedded");
    expect(result.hits[0].id).toBe("rs334");
  });

  it("uses the fused hybrid ranking when the query embeds successfully", async () => {
    getRetrievalIndex.mockResolvedValue(fullyEmbeddedIndex());
    embedText.mockResolvedValue({ embedding: [0, 1] }); // matches rs334's embedding exactly
    const result = await search("the sickle cell mutation", 5);
    expect(result.semanticAvailable).toBe(true);
    expect(result.semanticReason).toBeNull();
    expect(result.hits[0].id).toBe("rs334");
  });

  it("degrades to lexical-only when the live embedding call fails, even with a fully-embedded index", async () => {
    getRetrievalIndex.mockResolvedValue(fullyEmbeddedIndex());
    embedText.mockResolvedValue({ embedding: null, reason: "ollama_unreachable" });
    const result = await search("sickle cell disease", 5);
    expect(result.semanticAvailable).toBe(false);
    expect(result.semanticReason).toBe("ollama_unreachable");
    expect(result.hits[0].id).toBe("rs334"); // still ranks correctly via BM25 alone
  });

  it("returns no hits for an empty query without calling the embedder", async () => {
    getRetrievalIndex.mockResolvedValue(fullyEmbeddedIndex());
    const result = await search("   ", 5);
    expect(result.hits).toEqual([]);
    expect(embedText).not.toHaveBeenCalled();
  });

  it("respects the k limit", async () => {
    getRetrievalIndex.mockResolvedValue(lexicalOnlyIndex());
    const result = await search("gene", 1);
    expect(result.hits.length).toBeLessThanOrEqual(1);
  });
});
