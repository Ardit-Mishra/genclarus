import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Live retrieval-quality measurement, separate from generation quality (measure:grounding measures
// whether the AI narrative grounds; this measures whether hybrid search finds the right corpus
// record at all — a distinct question most portfolios conflate into one number). Calls the local
// Ollama embedder for the semantic half; if it's unreachable every query still gets a real BM25-
// only measurement (never a fabricated semantic score) — see scripts/validation/retrieval.test.ts.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("../../src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["scripts/validation/retrieval.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
