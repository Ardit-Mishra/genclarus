import { describe, it, expect } from "vitest";
import { pickBestPdb, domainRegions } from "./uniprot";

describe("pickBestPdb", () => {
  it("prefers lowest-resolution X-ray", () => {
    expect(
      pickBestPdb([
        { id: "1AAA", method: "X-ray", resolution: 2.5 },
        { id: "1BBB", method: "X-ray", resolution: 1.4 },
        { id: "1CCC", method: "NMR", resolution: null },
      ]),
    ).toBe("1BBB");
  });

  it("falls back to the first entry when no X-ray with resolution exists", () => {
    expect(
      pickBestPdb([
        { id: "1CCC", method: "NMR", resolution: null },
        { id: "1DDD", method: "EM", resolution: null },
      ]),
    ).toBe("1CCC");
  });

  it("returns null for empty", () => {
    expect(pickBestPdb([])).toBeNull();
  });
});

describe("domainRegions", () => {
  it("colors domains and active sites distinctly and cycles colors", () => {
    const r = domainRegions([
      { type: "Domain", start: 10, end: 50, description: "Kinase" },
      { type: "Domain", start: 60, end: 90, description: "SH2" },
      { type: "Active site", start: 45, end: 45, description: "" },
    ]);
    expect(r).toHaveLength(3);
    expect(r[0].color).not.toBe(r[1].color);
    expect(r[2].label).toMatch(/active site/i);
  });
});
