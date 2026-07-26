// Pure protein-notation helpers for the 3D structure viewer. No network calls — parsing and
// classification only, so this stays trivially unit-testable and safe to share between the
// server (variant facts) and the client (residue highlighting).

export const AA3to1: Record<string, string> = {
  Ala: "A", Arg: "R", Asn: "N", Asp: "D", Cys: "C", Gln: "Q", Glu: "E",
  Gly: "G", His: "H", Ile: "I", Leu: "L", Lys: "K", Met: "M", Phe: "F",
  Pro: "P", Ser: "S", Thr: "T", Trp: "W", Tyr: "Y", Val: "V",
};

// Extracts the residue position from a HGVS protein change, e.g. "p.Arg534Gln" -> 534.
// Returns null for anything that isn't a clean three-letter/digits/three-letter substitution
// (synonymous "p.Gln534=", frameshift/Ter notations, empty, or missing) — callers must treat
// null as "no residue to highlight", never guess.
export function parseResidue(proteinChange: string | null | undefined): number | null {
  if (!proteinChange) return null;
  const m = /^p\.[A-Za-z]{3}(\d+)[A-Za-z]{3}$/.exec(proteinChange.trim());
  return m ? Number(m[1]) : null;
}

// Extracts a one-letter ref/pos/alt substitution from a HGVS protein change, e.g.
// "p.Arg534Gln" -> { ref: "R", pos: 534, alt: "Q" }. Returns null when either residue isn't a
// standard amino acid (e.g. "Ter", "Xaa") or the change isn't a substitution.
export function parseSubstitution(
  proteinChange: string | null | undefined,
): { ref: string; pos: number; alt: string } | null {
  if (!proteinChange) return null;
  const m = /^p\.([A-Za-z]{3})(\d+)([A-Za-z]{3})$/.exec(proteinChange.trim());
  if (!m) return null;
  const ref = AA3to1[m[1]];
  const alt = AA3to1[m[3]];
  if (!ref || !alt) return null;
  return { ref, pos: Number(m[2]), alt };
}
