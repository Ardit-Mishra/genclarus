// Tier 0 corpus generator — deterministic, idempotent, resumable. See docs/CORPUS-INCREMENT-1-ADR.md.
//
// Pipeline per approved identifier (corpus/identifiers.json):
//   1 read manifest  2 retrieve public source records  3 normalize deterministic facts
//   4 stable facts hash  5 diff vs previous artifact  6 call NIM ONLY when facts hash / versions
//   changed  7 grounding-validate (inside explain())  8 write validated explanation OR a valid
//   source-only artifact  9 preserve provenance  10 rewrite the latest manifest.
//
// Idempotent: an unchanged record is reused byte-for-byte (its generatedAt is preserved), so a
// re-run with no upstream change produces NO diff and makes NO NIM calls. Resumable: interrupt and
// re-run — already-generated records are skipped. Facts that don't resolve are skipped (not
// published); facts that resolve but can't be grounded become source-only artifacts (still published).
//
// Run: npm run corpus:generate   (loads .env.local for NVIDIA_API_KEY)

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { getGeneFacts, getVariantFacts, type Facts } from "../../src/lib/facts";
import { explain, factsHash } from "../../src/lib/explain";
import { PROMPT_VERSION, MODEL_ID, OUTPUT_SCHEMA_VERSION } from "../../src/lib/version";
import {
  CORPUS_SCHEMA_VERSION,
  type CorpusRecord,
  type CorpusManifest,
  type CorpusManifestEntry,
  type CorpusIdentifiers,
} from "../../src/lib/corpus/types";

const ROOT = join(process.cwd(), "corpus");
const NIM_THROTTLE_MS = 1500; // gentle on the free tier; only applied when we actually call NIM
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf-8")) as T;
  } catch {
    return null;
  }
}

// A stored artifact is reusable iff its facts hash AND every generation version match the current
// world — exactly the refresh policy (ADR §5). Any mismatch means regenerate.
function isFresh(prev: CorpusRecord | null, hash: string): boolean {
  return (
    !!prev &&
    prev.provenance.factsHash === hash &&
    prev.provenance.promptVersion === PROMPT_VERSION &&
    prev.provenance.modelId === MODEL_ID &&
    prev.provenance.schemaVersion === OUTPUT_SCHEMA_VERSION &&
    prev.provenance.corpusSchemaVersion === CORPUS_SCHEMA_VERSION
  );
}

type Outcome = { record: CorpusRecord; regenerated: boolean } | { skipped: string };

async function processOne(kind: "gene" | "variant", rawId: string): Promise<Outcome> {
  // 2–3: retrieve + normalize public-record facts. A retrieval failure = not publishable → skip.
  let facts: Facts;
  try {
    facts = kind === "gene" ? await getGeneFacts(rawId) : await getVariantFacts(rawId);
  } catch (err) {
    return { skipped: `${rawId}: facts unavailable (${(err as Error).message})` };
  }
  const id = facts.kind === "gene" ? facts.symbol : facts.rsid;

  // 4–5: stable hash, diff against the previous artifact.
  const hash = factsHash(facts);
  const prev = await readJson<CorpusRecord>(join(ROOT, kind, `${id}.json`));
  if (isFresh(prev, hash)) return { record: prev!, regenerated: false }; // 6: no NIM call

  // 6–7: generate (NIM + grounding gate). explain() returns claims=null on any ungroundable outcome.
  await sleep(NIM_THROTTLE_MS);
  const ex = await explain(facts);

  // 8–9: write validated explanation OR a valid source-only artifact; preserve provenance.
  const record: CorpusRecord = {
    kind,
    id,
    facts,
    claims: ex.claims,
    aiAvailable: ex.aiAvailable,
    fallbackReason: ex.claims ? null : ex.fallbackReason,
    provenance: {
      factsHash: hash,
      promptVersion: PROMPT_VERSION,
      modelId: MODEL_ID,
      schemaVersion: OUTPUT_SCHEMA_VERSION,
      corpusSchemaVersion: CORPUS_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      retrievedAt: facts.retrievedAt,
      sources: facts.sources,
    },
  };
  return { record, regenerated: true };
}

async function main() {
  const ids = await readJson<CorpusIdentifiers>(join(ROOT, "identifiers.json"));
  if (!ids) throw new Error("corpus/identifiers.json not found");
  await mkdir(join(ROOT, "gene"), { recursive: true });
  await mkdir(join(ROOT, "variant"), { recursive: true });

  let jobs: { kind: "gene" | "variant"; id: string }[] = [
    ...ids.genes.map((id) => ({ kind: "gene" as const, id })),
    ...ids.variants.map((id) => ({ kind: "variant" as const, id })),
  ];
  // CORPUS_LIMIT caps the run for smoke tests (resumable: a later full run fills in the rest).
  const limit = Number(process.env.CORPUS_LIMIT || 0);
  if (limit > 0) jobs = jobs.slice(0, limit);

  const records: CorpusRecord[] = [];
  let regen = 0;
  let reused = 0;
  const skipped: string[] = [];

  for (let i = 0; i < jobs.length; i++) {
    const { kind, id } = jobs[i];
    const out = await processOne(kind, id);
    if ("skipped" in out) {
      skipped.push(out.skipped);
      console.log(`[${i + 1}/${jobs.length}] SKIP  ${id} — ${out.skipped}`);
      continue;
    }
    // Write only when regenerated (idempotent: reused artifacts are already on disk, untouched).
    if (out.regenerated) {
      await writeFile(
        join(ROOT, kind, `${out.record.id}.json`),
        JSON.stringify(out.record, null, 2) + "\n",
      );
      regen++;
    } else {
      reused++;
    }
    records.push(out.record);
    const state = out.regenerated ? (out.record.claims ? "GEN " : "GEN*") : "keep";
    console.log(
      `[${i + 1}/${jobs.length}] ${state} ${out.record.id}` +
        (out.record.claims ? ` (${out.record.claims.length} claims)` : " (source-only)"),
    );
  }

  // 10: rewrite the latest manifest — deterministic order; generatedAt derived from the newest
  // record so an unchanged re-run yields a byte-identical manifest.
  records.sort((a, b) => (a.kind === b.kind ? a.id.localeCompare(b.id) : a.kind.localeCompare(b.kind)));
  const entries: CorpusManifestEntry[] = records.map((r) => ({
    kind: r.kind,
    id: r.id,
    factsHash: r.provenance.factsHash,
    hasExplanation: r.claims != null,
    generatedAt: r.provenance.generatedAt,
  }));
  const newest = entries.reduce((mx, e) => (e.generatedAt > mx ? e.generatedAt : mx), "");
  const manifest: CorpusManifest = {
    corpusSchemaVersion: CORPUS_SCHEMA_VERSION,
    generatedAt: newest || new Date().toISOString(),
    counts: {
      genes: records.filter((r) => r.kind === "gene").length,
      variants: records.filter((r) => r.kind === "variant").length,
      withExplanation: records.filter((r) => r.claims != null).length,
      sourceOnly: records.filter((r) => r.claims == null).length,
    },
    records: entries,
  };
  await writeFile(join(ROOT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

  console.log(
    `\nDone. ${records.length} in corpus (${manifest.counts.withExplanation} grounded, ` +
      `${manifest.counts.sourceOnly} source-only) · ${regen} regenerated · ${reused} reused · ` +
      `${skipped.length} skipped.`,
  );
  if (skipped.length) console.log("Skipped:\n  " + skipped.join("\n  "));
}

main().catch((e) => {
  console.error("corpus generation failed:", e);
  process.exit(1);
});
