# Genclarus

**Grounded gene & variant explainer.** Type a human gene (`BRCA1`, `TP53`, `CFTR`) or a variant rsID
(`rs6025`) and get a clear, **cited**, plain-language explanation built directly from public
bioinformatics data — every sentence linked back to the record it came from.

> Educational, not medical advice.

## Why

Gene databases are dense and jargon-heavy. Genclarus turns a gene symbol or rsID into an explanation
a non-specialist can actually read — *what it is, its clinical classifications, key facts* — while
staying provably grounded in authoritative sources.

## How it works

```
gene / rsID  →  public databases (facts)  →  deterministic rendering + validation  →  cited explanation
```

Each statement is **rendered deterministically from typed facts** — allele frequencies, ClinVar
classifications, review status, origin — and bound to the exact source field it cites. A hardened
validator gates every claim (numeric fidelity, qualifier preservation, source existence); anything
that can't be grounded is withheld and the verified source data stands on its own. **No model writes
the factual content**, so the explanation cannot drift from the underlying records.

- **Data:** [MyGene.info](https://mygene.info), [MyVariant.info](https://myvariant.info), ClinVar,
  dbSNP, gnomAD — free, no key.
- **Structure:** AlphaFold / RCSB 3D viewer, UniProt domains, AlphaMissense — all via same-origin
  proxies.
- **App:** Next.js (App Router) + TypeScript + Tailwind, deployed on Vercel. Runs at **$0**.

## Surfaces

- **Interactive lookup** — any valid gene symbol or rsID, resolved live from the public databases.
- **Curated corpus** — 173 precomputed, provenance-stamped public-record pages (`/gene/{id}`,
  `/variant/{id}`) with an embeddable widget (`/embed/*`) and a versioned read API (`/api/v1`).

## Run locally

```bash
npm install
npm run dev        # http://localhost:3000
```

## Author

Ardit Mishra — Bioinformatics + AI/ML · [github.com/Ardit-Mishra](https://github.com/Ardit-Mishra)
