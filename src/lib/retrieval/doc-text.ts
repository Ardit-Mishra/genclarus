// Builds the retrieval document text for a corpus record — the string that gets tokenized (BM25)
// and embedded (semantic). Deterministic and built ONLY from committed facts fields, so re-running
// the index build over an unchanged corpus produces byte-identical documents. This module is the
// single definition of "what a record looks like to retrieval" — the index build script and any
// runtime re-derivation must both go through it, never hand-roll their own concatenation.

import type { CorpusRecord } from "../corpus/types";
import type { Facts } from "../facts";

function geneDocText(facts: Extract<Facts, { kind: "gene" }>): string {
  const parts = [
    facts.symbol,
    facts.name,
    facts.type,
    facts.summary,
    facts.aliases.join(" "),
  ];
  return parts.filter(Boolean).join(". ");
}

function variantDocText(facts: Extract<Facts, { kind: "variant" }>): string {
  const conditions = facts.conditionClassifications.map((c) => c.condition);
  const parts = [
    facts.rsid,
    facts.gene,
    facts.preferredName ?? "",
    facts.proteinChange,
    facts.consequence,
    facts.variantType,
    conditions.length ? `Associated conditions: ${conditions.join(", ")}` : "",
    facts.distinctSignificances.length
      ? `Clinical significance: ${facts.distinctSignificances.join(", ")}`
      : "",
  ];
  return parts.filter(Boolean).join(". ");
}

export function buildDocText(record: CorpusRecord): string {
  return record.facts.kind === "gene" ? geneDocText(record.facts) : variantDocText(record.facts);
}
