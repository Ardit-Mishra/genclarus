// FileCorpusStore — reads committed corpus artifacts from the `corpus/` directory. This is the
// increment-1 CorpusStore implementation; a future ObjectCorpusStore can replace it behind the same
// interface with zero consumer change (see docs/CORPUS-INCREMENT-1-ADR.md §1, §3).
//
// Reads happen at BUILD time only: pages and /api/v1 are statically prerendered from the corpus via
// generateStaticParams, so there is no request-time filesystem access (and no request-time NIM).
// CORPUS_DIR overrides the root (used by tests).

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { normalizeGeneSymbol, normalizeRsid } from "../facts";
import type { CorpusStore, CorpusRecord, CorpusManifest, CorpusKind } from "./types";

function corpusRoot(): string {
  return process.env.CORPUS_DIR || join(process.cwd(), "corpus");
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf-8")) as T;
  } catch {
    return null; // missing / unparseable artifact → treated as absent
  }
}

// Normalizers can throw on malformed input; a bad key is simply "not in the corpus", never an error.
function safeNormalize(fn: (s: string) => string, raw: string): string | null {
  try {
    const id = fn(raw);
    return id || null;
  } catch {
    return null;
  }
}

export class FileCorpusStore implements CorpusStore {
  constructor(private readonly root: string = corpusRoot()) {}

  async getGene(symbol: string): Promise<CorpusRecord | null> {
    const id = safeNormalize(normalizeGeneSymbol, symbol);
    if (!id) return null;
    return readJson<CorpusRecord>(join(this.root, "gene", `${id}.json`));
  }

  async getVariant(rsid: string): Promise<CorpusRecord | null> {
    const id = safeNormalize(normalizeRsid, rsid);
    if (!id) return null;
    return readJson<CorpusRecord>(join(this.root, "variant", `${id}.json`));
  }

  async listGenes(): Promise<string[]> {
    return this.listByKind("gene");
  }

  async listVariants(): Promise<string[]> {
    return this.listByKind("variant");
  }

  private async listByKind(kind: CorpusKind): Promise<string[]> {
    const manifest = await readJson<CorpusManifest>(join(this.root, "manifest.json"));
    if (!manifest) return [];
    return manifest.records.filter((r) => r.kind === kind).map((r) => r.id);
  }
}
