// Public entry point for the Tier 0 corpus. Consumers (pages, /api/v1) import `corpusStore` and the
// types from here — never a concrete implementation — so the storage backend stays swappable.

export * from "./types";
export { FileCorpusStore } from "./file-store";

import { FileCorpusStore } from "./file-store";
import type { CorpusStore } from "./types";

// The process-wide store. Reassign in a future increment to migrate off committed files.
export const corpusStore: CorpusStore = new FileCorpusStore();
