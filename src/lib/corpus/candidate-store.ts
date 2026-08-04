// CandidateCorpusStore — reads RAW candidate artifacts for generation reports + re-audit ONLY.
// Two hard guarantees, both enforced structurally:
//   1. It reads only from a candidate root (default `corpus-candidate/`), exactly as written by the
//      regen — the audit always sees the freshly generated claims, never a production projection.
//   2. It CANNOT be pointed at the live `corpus/` directory — the constructor rejects a root whose
//      basename is "corpus", so a candidate report can never silently read production artifacts.
// Used ONLY by candidate/re-audit tooling; no production route imports it.

import { readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { normalizeGeneSymbol, normalizeRsid } from "../facts";
import type { CorpusRecordV2, CorpusManifest, CorpusKind } from "./types";

export const DEFAULT_CANDIDATE_DIR = "corpus-candidate";

// Thrown when someone tries to build a candidate store over the live corpus root — a guard against
// the whole class of "the audit accidentally read production" bugs.
export class CandidateRootError extends Error {}

function assertNotProductionRoot(root: string): void {
  const base = basename(resolve(root)).toLowerCase();
  if (base === "corpus") {
    throw new CandidateRootError(
      `CandidateCorpusStore refuses the production root "${root}" (basename "corpus"). Use corpus-candidate/.`,
    );
  }
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf-8")) as T;
  } catch {
    return null;
  }
}

function safeNormalize(fn: (s: string) => string, raw: string): string | null {
  try {
    const id = fn(raw);
    return id || null;
  } catch {
    return null;
  }
}

export class CandidateCorpusStore {
  private readonly root: string;
  constructor(root: string = DEFAULT_CANDIDATE_DIR) {
    assertNotProductionRoot(root); // cannot be confused with production
    this.root = resolve(root);
  }

  // Raw candidate record, exactly as written by the regen — the strict v2 shape the audit sees.
  async getGene(symbol: string): Promise<CorpusRecordV2 | null> {
    const id = safeNormalize(normalizeGeneSymbol, symbol);
    if (!id) return null;
    return readJson<CorpusRecordV2>(join(this.root, "gene", `${id}.json`));
  }

  async getVariant(rsid: string): Promise<CorpusRecordV2 | null> {
    const id = safeNormalize(normalizeRsid, rsid);
    if (!id) return null;
    return readJson<CorpusRecordV2>(join(this.root, "variant", `${id}.json`));
  }

  async manifest(): Promise<CorpusManifest | null> {
    return readJson<CorpusManifest>(join(this.root, "manifest.json"));
  }

  private async listByKind(kind: CorpusKind): Promise<string[]> {
    const m = await this.manifest();
    return m ? m.records.filter((r) => r.kind === kind).map((r) => r.id) : [];
  }
  listGenes(): Promise<string[]> {
    return this.listByKind("gene");
  }
  listVariants(): Promise<string[]> {
    return this.listByKind("variant");
  }
}
