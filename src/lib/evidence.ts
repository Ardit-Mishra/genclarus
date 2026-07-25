// The evidence layer — Phase 3's single source of truth.
//
// It converts the subset of server-derived Facts the model is allowed to see into an ordered list
// of atomic EvidenceFacts. This exact list is BOTH serialized into the prompt AND handed to the
// grounding validator, so a claim can only ever cite something the model actually saw, and the
// validator checks against precisely what was offered — no drift between the two.
//
// IDs are position/field-derived, never content-derived: the same fact in the same slot always
// gets the same id. That stability is what lets citations survive a ClinVar reclassification and
// keeps the cache key meaningful. Nothing here calls the LLM.

import type { Facts, GeneFacts, VariantFacts } from "./facts";

export type EvidenceSource = "mygene" | "clinvar" | "dbsnp" | "gnomad";

export type EvidenceFact = {
  id: string; // immutable, position/field-derived (see file header)
  source: EvidenceSource;
  field: string; // human label, e.g. "summary", "classification", "frequency"
  value: string; // normalized string the model may reference
  qualifiers?: {
    condition?: string;
    classificationType?: string; // germline | somatic | ...
    uncertainty?: string; // uncertain | conflicting | predicted
  };
};

// ClinVar returns at most this many condition groups into the prompt (matches modelFacts()).
const MAX_CONDITIONS = 8;

// Only germline/somatic are meaningful classification qualifiers; "unknown" carries no obligation.
function classificationType(origin: string): string | undefined {
  const o = origin.toLowerCase();
  return o === "germline" || o === "somatic" ? o : undefined;
}

// The uncertainty a claim must preserve if it discusses this classification. Derived from the
// normalized significance label so it can never disagree with what the badge shows.
function uncertaintyOf(significance: string): string | undefined {
  const s = significance.toLowerCase();
  if (s.includes("conflicting")) return "conflicting";
  if (s.includes("uncertain")) return "uncertain";
  return undefined;
}

// A single readable frequency string carrying both the percentage and the raw allele fraction, so
// whichever the model quotes is present in the fact's value for the validator to confirm.
function formatFrequency(af: number): string {
  const pct = (af * 100).toPrecision(2).replace(/\.?0+$/, "");
  return `${pct}% (gnomAD allele frequency ${af})`;
}

function geneEvidence(g: GeneFacts): EvidenceFact[] {
  const out: EvidenceFact[] = [];
  const push = (id: string, field: string, value: string) => {
    if (value) out.push({ id, source: "mygene", field, value });
  };
  push("gene.summary", "summary", g.summary);
  push("gene.name", "name", g.name);
  push("gene.type", "gene type", g.type);
  push("gene.location", "location", g.location);
  g.aliases.forEach((alias, i) => push(`gene.alias.${i}`, "alias", alias));
  return out;
}

function variantEvidence(v: VariantFacts): EvidenceFact[] {
  const out: EvidenceFact[] = [];
  if (v.gene) out.push({ id: "var.gene", source: "dbsnp", field: "gene", value: v.gene });
  if (v.consequence)
    out.push({ id: "var.consequence", source: "clinvar", field: "consequence", value: v.consequence });
  if (v.proteinChange)
    out.push({ id: "var.protein", source: "clinvar", field: "protein change", value: v.proteinChange });
  if (v.variantType)
    out.push({ id: "var.type", source: "clinvar", field: "variant type", value: v.variantType });
  if (v.gnomadAf != null)
    out.push({
      id: "var.gnomadAf",
      source: "gnomad",
      field: "frequency",
      value: formatFrequency(v.gnomadAf),
    });

  v.conditionClassifications.slice(0, MAX_CONDITIONS).forEach((c, i) => {
    const qualifiers = {
      condition: c.condition,
      classificationType: classificationType(c.origin),
      uncertainty: uncertaintyOf(c.significance),
    };
    // Drop undefined keys so equality/serialization stays clean.
    const q = Object.fromEntries(Object.entries(qualifiers).filter(([, val]) => val != null));
    out.push({
      id: `var.cond.${i}.significance`,
      source: "clinvar",
      field: "classification",
      value: c.significance,
      qualifiers: q,
    });
    out.push({
      id: `var.cond.${i}.reviewStars`,
      source: "clinvar",
      field: "review confidence",
      value: `${c.reviewStars} of 4 review stars`,
      qualifiers: { condition: c.condition },
    });
    const ct = classificationType(c.origin);
    if (ct)
      out.push({
        id: `var.cond.${i}.origin`,
        source: "clinvar",
        field: "origin",
        value: ct,
        qualifiers: { condition: c.condition, classificationType: ct },
      });
  });
  return out;
}

export function buildEvidence(facts: Facts): EvidenceFact[] {
  return facts.kind === "gene" ? geneEvidence(facts) : variantEvidence(facts);
}
