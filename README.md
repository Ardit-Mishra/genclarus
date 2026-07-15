# GeneLens

**AI gene explainer.** Type a human gene (`BRCA1`, `TP53`, `CFTR`) and get a clear, **cited**,
plain-language explanation grounded in real biology — pulled from public bioinformatics data and
synthesized by an LLM, with source links you can verify.

> Educational, not medical advice.

## Why

Gene databases are dense and jargon-heavy. GeneLens turns a gene symbol into an explanation a
non-specialist can actually read — *what it does, why it matters, key facts* — while staying
grounded in authoritative sources (so it doesn't hallucinate).

## How it works

```
gene symbol  →  MyGene.info (facts)  →  LLM synthesis  →  grounded explanation + sources
```

- **Data:** [MyGene.info](https://mygene.info) — free, no key.
- **AI:** NVIDIA NIM free tier (OpenAI-compatible), called server-side.
- **App:** Next.js (App Router) + TypeScript + Tailwind, deployed on Vercel.

Runs at **$0** (free data API + free model tier).

## Status

Gene-only MVP, in active development. Roadmap: rsID/variant lookup + ClinVar clinical significance,
shareable result links, per-gene SEO pages.

## Run locally

```bash
npm install
npm run dev        # http://localhost:3000
```

Set `NVIDIA_API_KEY` in your environment (and in Vercel project settings for deploys).

## Author

Ardit Mishra — Bioinformatics + AI/ML · [github.com/Ardit-Mishra](https://github.com/Ardit-Mishra)
