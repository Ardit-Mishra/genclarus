import { describe, it, expect } from "vitest";
import { buildBm25Index, bm25Score } from "./bm25";

const docs = [
  { id: "sickle", text: "HBB sickle cell disease pathogenic missense variant" },
  { id: "cftr", text: "CFTR cystic fibrosis deletion pathogenic variant" },
  { id: "noise", text: "an unrelated gene with an unrelated summary about metabolism" },
];

describe("bm25Score", () => {
  it("ranks the document matching more/rarer query terms highest", () => {
    const index = buildBm25Index(docs);
    const scores = bm25Score(index, "sickle cell disease");
    const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
    expect(ranked[0]).toBe("sickle");
  });

  it("gives a document containing every query term a strictly positive score", () => {
    const index = buildBm25Index(docs);
    const scores = bm25Score(index, "cystic fibrosis");
    expect(scores.get("cftr")).toBeGreaterThan(0);
  });

  it("never scores a document with none of the query terms", () => {
    const index = buildBm25Index(docs);
    const scores = bm25Score(index, "sickle cell");
    expect(scores.has("noise")).toBe(false);
  });

  it("returns an empty map for an empty query or empty corpus", () => {
    const index = buildBm25Index(docs);
    expect(bm25Score(index, "").size).toBe(0);
    expect(bm25Score(buildBm25Index([]), "sickle").size).toBe(0);
  });

  it("a term appearing in every document contributes ~0 (IDF collapses toward zero)", () => {
    const uniform = [
      { id: "a", text: "gene variant explanation" },
      { id: "b", text: "gene variant explanation" },
    ];
    const index = buildBm25Index(uniform);
    const scores = bm25Score(index, "gene");
    // Not asserting exactly 0 (the +1 IDF variant keeps it slightly positive), only that it is
    // far smaller than a distinguishing term's score in the corpus above.
    const distinguishing = bm25Score(buildBm25Index(docs), "sickle").get("sickle")!;
    expect(scores.get("a")!).toBeLessThan(distinguishing);
  });
});
