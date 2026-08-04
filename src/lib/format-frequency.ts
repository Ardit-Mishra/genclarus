// Single canonical allele-frequency formatter (incident 2026-07-28, Stage-3 correction B). ONE source
// of truth shared by the evidence layer, the clinical renderer, the grounding validator and the UI, so
// a percentage can never disagree with itself and a frequency claim's number can only ever be a
// rounding of THIS value. Every rendering is a LABELLED quantity — a percentage, or, for very small
// values, an explicitly-labelled raw allele fraction. It NEVER emits a bare scientific-notation number
// where a surrounding "%"/"frequency" field would imply a percentage. Pure.

// Precision thresholds (as percentages). >=1% → 1 decimal; >=0.01% → 2 decimals; below → the value is
// too small to render meaningfully as a percentage, so we show the raw allele fraction, explicitly
// labelled as such, rather than an unlabelled 0.00% or a bare 1.2e-5.
export const AF_PCT_ONE_DECIMAL = 1;
export const AF_PCT_TWO_DECIMAL = 0.01;

export type AfDisplay = {
  rawFraction: number; // the allele fraction as retrieved (e.g. 0.0000042)
  canonicalPercent: number | null; // the % value when it renders as a percentage, else null
  unit: "percent" | "fraction"; // which the display string is expressed in
  display: string; // the human string — always labelled ("14.0%" or "0.0000042 (allele fraction)")
};

export function afDisplay(af: number): AfDisplay {
  const pct = af * 100;
  if (pct >= AF_PCT_ONE_DECIMAL) {
    const canonicalPercent = Number(pct.toFixed(1));
    return { rawFraction: af, canonicalPercent, unit: "percent", display: `${pct.toFixed(1)}%` };
  }
  if (pct >= AF_PCT_TWO_DECIMAL) {
    const canonicalPercent = Number(pct.toFixed(2));
    return { rawFraction: af, canonicalPercent, unit: "percent", display: `${pct.toFixed(2)}%` };
  }
  // Too small for a meaningful percentage — show the labelled raw fraction, never a bare number.
  return { rawFraction: af, canonicalPercent: null, unit: "fraction", display: `${af} (allele fraction)` };
}

// The display string for an allele frequency (canonical, always labelled).
export function formatAf(af: number): string {
  return afDisplay(af).display;
}

// The NUMERIC TOKENS (as the validator's number regex would extract them) that a claim may
// legitimately use for this allele frequency — DERIVED from the canonical rounding, never a
// hand-maintained whitelist. For a percentage value both the decimal and integer roundings are
// allowed so "30.5%" and "~30%" both validate; a wrong-magnitude value like "3%" does not. For a
// sub-threshold value only the raw fraction is licensed (no percentage token — the claim must not
// state a percentage for a value we deliberately do not render as one).
export function frequencyRenderings(af: number): Set<string> {
  const d = afDisplay(af);
  const out = new Set<string>();
  if (d.canonicalPercent != null) {
    out.add(String(d.canonicalPercent)); // the canonical 1-/2-decimal value, e.g. "30.5"
    out.add(d.display.replace("%", "")); // the EXACT token the display shows, e.g. "26.0" — keeps the
    //   display string and the gate in lockstep so a whole-number percent ("26.0%") never fails its own
    //   check (Number("26.0")→26 would otherwise render only "26" and drop the frequency claim).
    out.add(String(Math.round(af * 100))); // the integer rounding of the RAW %, e.g. "30" (not 31)
  }
  out.add(String(af)); // the raw fraction may always be quoted verbatim
  return out;
}

// Acceptable numeric tokens for a review-star count: the count itself and the "of 4" denominator.
export function starsRenderings(stars: number): Set<string> {
  return new Set([String(stars), "4"]);
}
