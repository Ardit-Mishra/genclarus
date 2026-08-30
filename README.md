# Genclarus

**A grounded gene & variant explainer.** Type a human gene (`BRCA1`, `TP53`, `CFTR`) or a variant
rsID (`rs6025`) and get a clear, **cited**, plain-language explanation built directly from public
bioinformatics databases — every sentence traceable to the exact source record it came from.

> ⚕️ Educational tool. Not medical advice, and not a personal genetic test.

## Live Demo

**→ [genclarus.com](https://genclarus.com)** — deployed on Vercel, auto-deploys from `main`.

Try: [`BRCA1`](https://genclarus.com/gene/BRCA1) · [`TP53`](https://genclarus.com/gene/TP53) ·
[`rs6025`](https://genclarus.com/variant/rs6025) (Factor V Leiden) · [`rs334`](https://genclarus.com/variant/rs334) (sickle cell).

## Overview

Public genomic databases (ClinVar, dbSNP, gnomAD, MyGene) are authoritative but dense and
jargon-heavy — hard for a student, patient, or non-specialist to read. Genclarus turns a gene symbol
or variant ID into an explanation a non-specialist can actually understand — *what it is, how it's
clinically classified, how common it is, where the variant sits in the protein* — while staying
**provably grounded** in those sources.

The design goal is **correctness over fluency**. Every clinical statement is rendered
**deterministically** from typed facts and bound to the specific source field it cites; a hardened
validator rejects anything it can't ground. **No language model writes the factual content**, so an
explanation cannot drift away from the underlying records or invent a clinical claim.

## How it works

```
gene / rsID
   │
   ├── live lookup ──► MyGene.info · MyVariant.info · ClinVar · dbSNP · gnomAD   (facts)
   │                        │
   │                   typed EvidenceFacts
   │                        │
   │                deterministic renderer ──► claim-level sentences, each bound to a cited fact
   │                        │
   │                 hardened validator (numeric fidelity, qualifier preservation,
   │                 per-condition authority, population/identity licensing) ──► fail-closed
   │
   └── enrichment (client, via same-origin SSRF-safe proxy):
           AlphaFold structure · pLDDT confidence · UniProt domains · AlphaMissense · RCSB PDB
```

Two layers serve results:

- **Curated corpus** — 173 precomputed, provenance-stamped public-record pages (67 genes + 106
  variants) that back the indexable `/gene/{id}` and `/variant/{id}` pages, the embeddable widgets
  (`/embed/*`), and the versioned read API (`/api/v1`). No request-time inference.
- **Live lookup** — any valid gene symbol or rsID, resolved on demand from the public databases.

Each explanation is a set of short sentences, and **every sentence carries its own source chips** so
a reader can click straight through to the record it came from.

## Features

- **Gene & variant explanations** grounded in public databases, with per-sentence source citations.
- **Clinical significance by condition** — ClinVar classifications with review confidence (stars),
  variant origin (germline/somatic), and last-evaluated dates; multi-condition variants are never
  collapsed into a single verdict.
- **Population frequency** from gnomAD, rendered as an honest overall allele frequency (no fabricated
  ancestry attributions).
- **3D protein structure viewer** — AlphaFold predicted structures and RCSB experimental structures,
  colored by pLDDT confidence or UniProt domain, with the variant's residue highlighted.
- **AlphaMissense** computational pathogenicity prediction, labeled distinctly from clinical significance.
- **Public API & embeds** — a versioned `/api/v1` read API, a batch panel-annotation endpoint, and
  embeddable widgets for any of the corpus records.
- **Natural-language search** (`/api/search`) — hybrid retrieval over the corpus: BM25 (lexical,
  always available) fused with a local embedding model via Reciprocal Rank Fusion. "the sickle cell
  mutation" → `rs334`. See [Retrieval](#retrieval) below for how it's built and measured.
- **Reliability engineering** — enforced CSP, SSRF-safe upstream proxy, persistent cross-instance
  caching, an in-memory per-instance rate limiter on every public API route, CI (tests + build +
  typecheck + dependency audit + secret scanning), and a `/api/health` endpoint exposing deployed
  version/commit for unambiguous rollback.

## Tech Stack

- **Frontend:** Next.js 16 (App Router), React, TypeScript, Tailwind CSS, IBM Plex fonts
- **Backend:** Next.js Route Handlers (Node runtime), same-origin SSRF-safe proxy
- **Data sources:** MyGene.info, MyVariant.info, ClinVar, dbSNP, gnomAD, AlphaFold, AlphaMissense, UniProt, RCSB PDB, NCBI
- **Retrieval:** hybrid BM25 + local embeddings (Ollama `nomic-embed-text`), Reciprocal Rank Fusion, committed index — see [Retrieval](#retrieval)
- **3D:** 3Dmol.js (lazy-loaded)
- **Testing/CI:** Vitest, `tsc`, GitHub Actions (build, audit, gitleaks), Dependabot
- **Deployment:** Vercel — runs at **$0** (free public data APIs, no paid inference on the request path)

## Retrieval

`/api/search` and the corpus's future natural-language entry points are backed by hybrid retrieval
over the 173-record corpus, built as a committed artifact rather than a hosted vector database —
the corpus is small enough that this is both simpler and genuinely faster than a network round trip
to an external index, and it keeps the project at $0 with no new service.

- **BM25** (`src/lib/retrieval/bm25.ts`) — deterministic, pure, always available. Scores every
  document's text against the query with no network call and no model.
- **Semantic** (`src/lib/retrieval/ollama-embeddings.ts`) — each corpus document and each live query
  is embedded with `nomic-embed-text` via a local Ollama instance (`OLLAMA_URL`, default
  `http://127.0.0.1:11434`). Ollama runs on the author's desktop, not on Vercel, so in production
  this call fails fast and every caller falls back to lexical-only — **never** a fabricated
  embedding. The response reports which ranking mode actually served the request
  (`semanticAvailable` / `semanticReason`), so a caller can tell the two apart.
- **Fusion** (`src/lib/retrieval/hybrid.ts`) — Reciprocal Rank Fusion combines the two ranked lists
  by rank rather than raw score, since BM25 (unbounded) and cosine similarity (`[-1, 1]`) live on
  incomparable scales.
- **Index build** — `npm run retrieval:build-index` reads the corpus manifest, embeds every record,
  and writes the committed `corpus/retrieval-index.json`. Reproducible in structure and document-text
  coverage (same corpus in, same doc set and shape out) — embedding vectors can drift by float
  precision between Ollama runs, so a rebuild is not expected to byte-match the committed file.

**Retrieval evaluation is a separate measurement from generation quality** (`npm run
measure:retrieval`): a 20-query hand-written golden set, each a natural-language paraphrase checked
against the actual corpus record it targets (`scripts/validation/retrieval-golden.ts`), scored with
Recall@10, MRR, and a retrieval-failure rate. Writes `docs/validation/retrieval.{json,md}`
(gitignored — regenerate locally to see current numbers). Latest local run, semantic index fully
built and Ollama reachable:

| Metric | Value |
| --- | --- |
| Recall@10 | 0.950 (19/20) |
| MRR | 0.775 |
| Retrieval-failure rate | 5.0% |
| Semantic ranking actually used | 20/20 queries |

The one miss ("why some adults can digest milk without discomfort" → expected `rs4988235`) is
reported, not hidden — see the generated report for the full per-query breakdown and why it missed.

## Screenshots

> Live demo: **[genclarus.com](https://genclarus.com)** — try a gene (`BRCA1`) and a variant (`rs6025`).
> *(Static screenshots to be added: homepage lookup, per-condition ClinVar breakdown, 3D structure viewer.)*

## How to Run Locally

```bash
git clone https://github.com/Ardit-Mishra/genclarus.git
cd genclarus
npm install
npm run dev        # http://localhost:3000
```

Run the test suite and type check:

```bash
npm test
npx tsc --noEmit
```

No API keys are required for the core deterministic explainer (it reads free public data APIs). The
committed `corpus/retrieval-index.json` already ships pre-built, so `/api/search` and `npm run
measure:retrieval` work out of the box in lexical-only (BM25) mode; to also exercise the semantic
half, run a local [Ollama](https://ollama.com) with `nomic-embed-text` pulled and rebuild the index:

```bash
ollama pull nomic-embed-text
npm run retrieval:build-index   # regenerates corpus/retrieval-index.json
npm run measure:retrieval       # Recall@K / MRR / retrieval-failure rate — see Retrieval above
npm run measure:grounding       # deterministic-render + validation-gate measurement — see Grounding measurement above
```

## Project Status

**Live / portfolio-ready.** Deployed at [genclarus.com](https://genclarus.com), with a committed
public-record corpus, a public API, and a full test suite. Actively developed.

## Limitations

- **Educational only — not medical advice, and not a personal genetic test.** Looking up a variant
  explains the *public* ClinVar/dbSNP record; it does **not** determine whether an individual carries it.
- Explanations are deterministic and **source-bound by design**: the plain-language narration is
  intentionally plain rather than expressive, in exchange for being unable to fabricate a clinical claim.
- Clinical classifications are only as current as the underlying public databases (ClinVar/gnomAD).
- AlphaMissense and AlphaFold outputs are **computational predictions**, not clinical determinations,
  and are labeled as such.
- Deep links resolve for the curated corpus; other identifiers are supported through the interactive lookup.

## Grounding measurement

`npm run measure:grounding` runs the real explanation pipeline (fact fetch → deterministic render →
the same hardened validation gate every claim passes through) over a 24-case matrix
(`scripts/validation/matrix.ts`) and writes `docs/validation/grounding.{json,md}` (gitignored).

Read this in light of the architecture note in [Overview](#overview): as of the Stage 5 rebuild, **no
language model is in the factual/live path at all** — both gene identity and variant clinical claims
are rendered deterministically from typed facts, because an earlier LLM-narration version
(Phase 3) was found to hallucinate identity/function facts (wrong chromosome, a pseudogene stated as
an enzyme) and was retired. This harness was originally built to measure that live NIM-narrated
grounding rate; with narration retired from the live path, its "AI-grounded" bucket reports **0% by
design**, not by failure — that's the honest number, and reporting it as anything else would misstate
what's actually running in production. What the harness still measures, correctly and usefully, is
whether the deterministic renderer + fail-closed validator actually produce a citable claim per case.
Latest local run (24 matrix cases): **23/24 produced at least one validated, source-bound claim**
(1–38 claims per case depending on how many ClinVar conditions/facts a record carries); the remaining
case had no groundable clinical claim for that record and correctly fell back to showing the raw
verified source facts rather than inventing one. Reproduce with `npm run measure:grounding` — this
part of the harness needs no API key, since the path it measures makes no model call.

## Future Improvements

- Static screenshots and an expanded gene/variant corpus.
- Wire `/api/search` into the site UI (it exists and is measured — see [Retrieval](#retrieval) — but
  the homepage lookup box doesn't call it yet).

## Author

**Ardit Mishra** — Bioinformatics + AI/ML · [github.com/Ardit-Mishra](https://github.com/Ardit-Mishra) · [arditmishra.com](https://arditmishra.com)
