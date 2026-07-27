import { describe, it, expect } from "vitest";
import { amClassFromCode, findAmRow } from "./alphamissense";

const CSV =
  "protein_variant,am_pathogenicity,am_class\nR534A,0.7833,LPath\nR534Q,0.9123,LPath\nA222V,0.10,LBen\n";

describe("amClassFromCode", () => {
  it("maps codes", () => {
    expect(amClassFromCode("LPath")).toBe("likely_pathogenic");
    expect(amClassFromCode("LBen")).toBe("likely_benign");
    expect(amClassFromCode("Amb")).toBe("ambiguous");
  });
});

describe("findAmRow", () => {
  it("finds the exact substitution", () => {
    expect(findAmRow(CSV, "R534Q")).toEqual({ score: 0.9123, class: "likely_pathogenic" });
    expect(findAmRow(CSV, "A222V")).toEqual({ score: 0.1, class: "likely_benign" });
  });
  it("returns null when absent", () => {
    expect(findAmRow(CSV, "R534Z")).toBeNull();
  });
});
