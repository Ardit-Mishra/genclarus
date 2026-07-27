# Genclarus corpus (Tier 0)

Precomputed, cited, plain-language explanations of **public database records** — the backing store
for the indexable `/gene/[symbol]` and `/variant/[rsid]` pages and the `/api/v1` read API. Records
are non-personalized (they explain public records, never a user's own genome), which is what makes
them safe to publish and cheap to serve (no request-time model inference).

Design rationale: [`../docs/CORPUS-INCREMENT-1-ADR.md`](../docs/CORPUS-INCREMENT-1-ADR.md).

## Layout

```
corpus/
  identifiers.json   # APPROVED input — curated gene symbols + rsIDs to attempt generating
  manifest.json      # OUTPUT snapshot — only successfully generated records (drives pages/API/sitemap)
  gene/<SYMBOL>.json  # one artifact per gene record
  variant/<rsid>.json # one artifact per variant record
```

Each artifact is a `CorpusRecord` (`src/lib/corpus/types.ts`): the deterministic `facts`, the grounded
`claims` (or `null` = a valid **source-only** record), and `provenance` (facts hash, source
accessions, retrieval date, prompt/model/schema/corpus versions, generation date).

## Updating the corpus

```bash
npm run corpus:generate     # reads .env.local for NVIDIA_API_KEY
```

The generator (`scripts/corpus/generate.ts`) is **deterministic, idempotent, and resumable**:

- Regenerates a record **only** when its normalized-facts hash **or** a generation version
  (prompt / model / output-schema / corpus-schema) changed. Unchanged records are reused byte-for-byte
  — a re-run with no upstream change produces **no diff** and makes **no** model calls.
- Identifiers whose facts don't resolve are **skipped** (not published). Facts that resolve but can't
  be grounded become **source-only** artifacts (still published, `claims: null`).
- Rewrites `manifest.json` from whatever is in the corpus.

**Refresh cadence:** the corpus is a versioned *snapshot*, not permanent — public biomedical records
change. Re-run periodically (and after any prompt/model/schema bump); commit the changed artifacts.
Review the diff like any other change before shipping.

## What's committed

The generated JSON is committed as the canonical source of truth for this stage (small at this
scale). All reads go through the `CorpusStore` interface, so this can later move to object storage
without touching the pages or API.
