// Shared tokenizer for the lexical (BM25) side of retrieval. Deliberately dumb and deterministic:
// lowercase, split on anything that isn't a letter or digit, drop empties. This keeps identifiers
// like "rs334" or "BRCA1" intact as single tokens (letters+digits, no internal punctuation) while
// still splitting normal prose. No stemming, no stopword list — the corpus is small (173 records)
// and clinical vocabulary (e.g. "Hb SS disease (SCD)") is exactly the kind of text a stemmer would
// mangle, so plain tokens keep the index easy to reason about and to test.

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}
