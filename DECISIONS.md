# Why no language model writes the facts

Genclarus explains genes and variants in plain language. The obvious way to build
that is to give an LLM the source records and ask it to summarise. This project
does the opposite, and the reason is the whole design.

---

## The decision

**No language model sits anywhere in the factual path.**

Every sentence is rendered deterministically from typed facts drawn from ClinVar,
dbSNP, gnomAD, UniProt, MyGene and MyVariant, and each sentence is bound to the
source field it came from.

The consequence is worth stating exactly: **hallucination is not mitigated here,
reduced, or filtered. The generation step that would produce one does not
exist.** There is no model to be careful with, no prompt to harden, no evaluation
suite measuring how often it invents a clinical claim — because inventing one is
not a thing the system can do.

## What that costs

This is not free, and the tradeoff went the way it did on purpose.

Deterministic rendering is **less fluent**. A language model would write more
naturally, vary its phrasing, and handle unusual record shapes gracefully.
Templates cannot. Sentences here occasionally read stiffly, and every new fact
shape needs code rather than a better prompt.

For a tool a student or a non-specialist might use to understand a variant
associated with disease, that trade is not close. Fluent and occasionally
fabricated is worse than stiff and always sourced.

## Fail closed, not best effort

A validator checks numeric fidelity, qualifier preservation and per-condition
authority before anything is served. When it cannot ground a statement, the
statement is **not served** — no partial answer, no hedged phrasing, no
"information may be incomplete" banner over a guess.

The failure mode of a grounded system should be silence, not a plausible
sentence.

## Retrieval

Hybrid **BM25 + embedding** retrieval with reciprocal rank fusion over a
173-record corpus, measured at **Recall@10 0.950, MRR 0.775**. Retrieval decides
which records are shown. It does not write anything, and a retrieval miss
produces less information, never wrong information.

## What is still unknown

- The corpus is 173 records: 67 genes and 106 variants. Coverage is the hard
  limit on usefulness, and expanding it is manual work, not a model upgrade.
- Recall@10 0.950 is measured on that corpus. It says nothing about behaviour on
  a corpus an order of magnitude larger.
- Determinism guarantees the same input gives the same output. It does not
  guarantee the underlying source record is correct — if ClinVar is wrong, this
  is faithfully wrong, and says where it got it so that is checkable.
- No user study. Whether the stiffer phrasing actually reads better to a
  non-specialist than a fluent generated paragraph is an assumption, not a
  finding.

## Scope

Educational and research use. Nothing here is clinical advice, and the
significance labels shown are the source databases' own, not this project's
judgement.
