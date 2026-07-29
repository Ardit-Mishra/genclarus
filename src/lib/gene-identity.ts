// Safe gene-identity resolution (incident 2026-07-28). The dynamic layer served a variant's gene as
// "LOC126807122" — an uncurated dbSNP locus placeholder — even though ClinVar's preferredName resolved
// ADH1B. This module NEVER silently promotes a LOC… placeholder, and never silently prefers one
// curated source over a disagreeing one. Curated identity is used ONLY on explicit agreement; any
// disagreement or placeholder-only signal is reported as conflicting/unresolved with attribution. Pure.

export type IdentitySource = { source: string; symbol: string };

export type GeneIdentity =
  | { status: "resolved"; symbol: string; sources: IdentitySource[] }
  | { status: "conflicting"; sources: IdentitySource[] }
  | { status: "unresolved"; sources: IdentitySource[] };

// A curated symbol is anything that is NOT a bare dbSNP "LOC<digits>" locus placeholder.
export function isCuratedSymbol(sym: string): boolean {
  return !!sym && !/^LOC\d+$/i.test(sym.trim());
}

// Pull the curated symbol out of a ClinVar preferredName, e.g.
// "NM_000668.5(ADH1B):c.143A>G (p.His48Arg)" → "ADH1B". Returns null if none/uncurated.
export function extractPreferredSymbol(preferredName: string | null): string | null {
  if (!preferredName) return null;
  const m = preferredName.match(/\(([A-Za-z][A-Za-z0-9-]{0,19})\)/);
  return m && isCuratedSymbol(m[1]) ? m[1] : null;
}

export function resolveGeneIdentity(candidates: IdentitySource[]): GeneIdentity {
  const named = candidates.filter((c) => c.symbol && c.symbol.trim());
  const curated = named.filter((c) => isCuratedSymbol(c.symbol));
  const distinct = [...new Set(curated.map((c) => c.symbol.trim().toUpperCase()))];
  const hasUncurated = named.some((c) => !isCuratedSymbol(c.symbol));

  if (distinct.length === 0) return { status: "unresolved", sources: named };
  if (distinct.length > 1) return { status: "conflicting", sources: named };
  // Exactly one curated symbol. A disagreeing LOC placeholder means we do NOT silently promote it.
  if (hasUncurated) return { status: "conflicting", sources: named };
  return { status: "resolved", symbol: curated[0].symbol.trim(), sources: named };
}

// Convenience for the variant pipeline: build candidates from the stored gene + preferredName.
export function resolveVariantGene(gene: string, preferredName: string | null): GeneIdentity {
  const candidates: IdentitySource[] = [];
  if (gene) candidates.push({ source: "dbsnp/clinvar", symbol: gene });
  const pref = extractPreferredSymbol(preferredName);
  if (pref) candidates.push({ source: "clinvar-preferredName", symbol: pref });
  return resolveGeneIdentity(candidates);
}
