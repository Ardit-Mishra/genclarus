# Genclarus — project context

> Read at the start of every session in this repo. Also read `@AGENTS.md` — this is a newer
> Next.js with breaking changes; check `node_modules/next/dist/docs/` before writing framework code.

@AGENTS.md

## What this is
Genclarus is an **AI gene explainer**. Type a human gene (`BRCA1`, `TP53`, `CFTR`) → a clear,
**cited**, plain-language explanation grounded in real biology. Not a chatbot — a focused,
credible lookup tool. Explicitly **educational, not medical advice**.

Part of Ardit Mishra's portfolio (bioinformatics + AI/ML) and his first project shipped through
the laptop → GitHub → Vercel pipeline. Owner: Ardit Mishra (github.com/Ardit-Mishra).

## MVP scope (current)
- **Gene-only** lookup. Input a gene symbol → structured facts from **MyGene.info** (free, no key)
  → **free NVIDIA NIM LLM** synthesizes a grounded explanation with source links + disclaimer.
- Stateless: no login, no DB. Single Next.js app on Vercel (API route = backend).
- v1.1 (later): rsID/variant lookup + ClinVar significance, shareable links, optional query history.

## Tech stack
- **Frontend/Backend:** Next.js (App Router) + TypeScript + Tailwind — one app on **Vercel**.
- **AI:** NVIDIA NIM free tier (OpenAI-compatible, `https://integrate.api.nvidia.com/v1`), called
  server-side only. Key in a Vercel env var (`NVIDIA_API_KEY`) — never in client code or git.
- **Data:** MyGene.info REST (free, no key).
- **Design:** use the `impeccable` + `frontend-design` skills; professional, light/dark, responsive.

## Constraints
- **$0 to run:** free data API + free NIM tier. No metered/paid API.
- **Secrets:** server-side only, in Vercel env vars. Never commit keys or `.env*`.
- **Credibility:** the model explains ONLY the facts MyGene returns (+ real source links) to
  minimize hallucination. Always show sources + the "educational, not medical advice" disclaimer.

## Business
- **Revenue model:** freemium. Free public lookups (portfolio/demo); paid tier later = higher
  rate limits, batch/API access, saved reports, variant + ClinVar depth.
- **Target customer:** patients/curious consumers researching a gene or result; genetic-counseling
  and patient-education contexts; students. Later: developers wanting a simple gene-explanation API.
- **Pricing direction:** free tier + a low monthly "pro" ($5–15/mo) and/or usage-based API pricing.
- **Growth path:** ship gene-only demo → add variant/ClinVar depth → SEO gene pages (one indexable
  page per gene = organic traffic) → API product. Keep clear of clinical/diagnostic claims (regulatory).

## How to run locally
```bash
npm install
npm run dev        # http://localhost:3000
```
Deploy: push to `main` → Vercel auto-builds (git-push-to-deploy). Set `NVIDIA_API_KEY` in Vercel
project env vars.

## Status
Phase 1 — pipeline skeleton (scaffold + deploy). Gene lookup + UI come next.
