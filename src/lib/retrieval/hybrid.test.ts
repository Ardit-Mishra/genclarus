import { describe, it, expect } from "vitest";
import { reciprocalRankFusion } from "./hybrid";

describe("reciprocalRankFusion", () => {
  it("ranks a document that is #1 in both lists above one that is #1 in only one", () => {
    const lexical = [
      { id: "both-top", score: 10 },
      { id: "lex-only-top", score: 9 },
    ];
    const semantic = [
      { id: "both-top", score: 0.9 },
      { id: "sem-only-top", score: 0.8 },
    ];
    const fused = reciprocalRankFusion([lexical, semantic]);
    expect(fused[0].id).toBe("both-top");
  });

  it("includes a document present in only one list", () => {
    const lexical = [{ id: "only-lexical", score: 5 }];
    const semantic = [{ id: "only-semantic", score: 0.5 }];
    const fused = reciprocalRankFusion([lexical, semantic]);
    const ids = fused.map((f) => f.id);
    expect(ids).toContain("only-lexical");
    expect(ids).toContain("only-semantic");
  });

  it("is a pure function of ranks, not raw score magnitude", () => {
    // Wildly different scales (BM25-like vs cosine-like) should not distort combined ordering —
    // only the RANK within each list matters.
    const lexical = [
      { id: "a", score: 1000 },
      { id: "b", score: 999 },
    ];
    const semantic = [
      { id: "b", score: 0.99 },
      { id: "a", score: 0.98 },
    ];
    const fused = reciprocalRankFusion([lexical, semantic]);
    // a is rank1+rank2=1+2, b is rank2+rank1=2+1 — tied, so both present with equal score.
    expect(fused.find((f) => f.id === "a")!.score).toBeCloseTo(fused.find((f) => f.id === "b")!.score);
  });

  it("returns an empty array when given no lists or all-empty lists", () => {
    expect(reciprocalRankFusion([])).toEqual([]);
    expect(reciprocalRankFusion([[], []])).toEqual([]);
  });
});
