import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Provenance measurement. Unlike grounding.config.ts this calls NO language model — it exercises
// the deterministic path that actually ships, so it needs no API key and runs in CI.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("../../src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["scripts/validation/provenance.test.ts"],
    testTimeout: 900_000,
    hookTimeout: 900_000,
  },
});
