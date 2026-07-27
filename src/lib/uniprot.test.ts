import { describe, it, expect } from "vitest";
import { pickBestPdb } from "./uniprot";

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
