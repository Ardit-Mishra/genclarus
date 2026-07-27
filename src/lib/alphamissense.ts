// AlphaMissense computational pathogenicity lookup for a single protein substitution. AlphaFold
// publishes AlphaMissense scores as a per-protein CSV (indexed by UniProt accession) alongside its
// structure predictions. This resolves the row for one substitution from that CSV.
//
// A prediction, never a clinical classification — callers must keep it labeled as such (see the
// AM chip's `title` attribute in the variant card).

import { parseSubstitution } from "./protein";
import { safeFetch } from "./http";

export type AmResult = {
  score: number;
  class: "likely_pathogenic" | "likely_benign" | "ambiguous";
};

export function amClassFromCode(code: string): AmResult["class"] {
  if (code === "LPath") return "likely_pathogenic";
  if (code === "LBen") return "likely_benign";
  return "ambiguous";
}

// Scans the AlphaMissense CSV (header: protein_variant,am_pathogenicity,am_class) for one exact
// substitution row, e.g. "R534Q". A linear scan is fine here — this runs once per variant lookup
// against a file that's fetched fresh and discarded, so building an index would cost more than it
// saves.
export function findAmRow(csv: string, variant: string): AmResult | null {
  for (const line of csv.split("\n")) {
    if (!line.startsWith(variant + ",")) continue;
    const [, score, code] = line.split(",");
    return { score: Number(score), class: amClassFromCode(code.trim()) };
  }
  return null;
}

// Fetches the AlphaMissense annotations CSV for a protein and looks up one substitution.
// Degrades to null on any failure — no parseable substitution, an unreachable/slow upstream, or
// the substitution simply isn't in the file — so a missing prediction is a normal, silent outcome
// and never blocks the verified variant facts around it.
export async function lookupAlphaMissense(
  amUrl: string,
  proteinChange: string,
): Promise<AmResult | null> {
  const sub = parseSubstitution(proteinChange);
  if (!sub) return null;
  try {
    const res = await safeFetch(
      amUrl,
      {
        headers: {
          Accept: "text/csv, text/plain, */*",
          // AlphaFold's edge 403s requests carrying Node's default fetch User-Agent — see
          // src/app/api/structure/route.ts for the same workaround.
          "User-Agent": "Genclarus/1.0 (https://genclarus.com; alphamissense lookup)",
        },
      },
      12000,
    );
    if (!res.ok) return null;
    return findAmRow(await res.text(), `${sub.ref}${sub.pos}${sub.alt}`);
  } catch {
    return null;
  }
}
