import { describe, it, expect } from "vitest";
import { parseResidue, parseSubstitution } from "./protein";

describe("parseResidue", () => {
  it("extracts the position", () => {
    expect(parseResidue("p.Arg534Gln")).toBe(534);
    expect(parseResidue("p.Ala222Val")).toBe(222);
  });
  it("returns null for synonymous / empty / malformed", () => {
    expect(parseResidue("p.Gln534=")).toBeNull();
    expect(parseResidue("")).toBeNull();
    expect(parseResidue(null)).toBeNull();
  });
});

describe("parseSubstitution", () => {
  it("returns one-letter ref/alt and position", () => {
    expect(parseSubstitution("p.Arg534Gln")).toEqual({ ref: "R", pos: 534, alt: "Q" });
  });
  it("returns null when either residue is not a standard AA", () => {
    expect(parseSubstitution("p.Xaa534Gln")).toBeNull();
    expect(parseSubstitution("p.Gln534=")).toBeNull();
  });
});
