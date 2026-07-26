import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Live grounding-measurement pass (Phase 3 §12). Separate from run.test.ts so the biological
// validation and the grounding measurement can be run independently. This one calls NIM, so it
// needs NVIDIA_API_KEY set and can take many minutes over the full matrix.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("../../src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["scripts/validation/grounding.test.ts"],
    testTimeout: 1_800_000,
    hookTimeout: 1_800_000,
  },
});
