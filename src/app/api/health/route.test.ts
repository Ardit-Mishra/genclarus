import { describe, it, expect } from "vitest";
import { GET } from "./route";
import { PROMPT_VERSION, MODEL_ID, OUTPUT_SCHEMA_VERSION } from "@/lib/version";

describe("GET /api/health", () => {
  it("reports ok plus the live prompt/model/schema versions", async () => {
    const body = await GET().json();
    expect(body.status).toBe("ok");
    expect(body.versions).toEqual({
      prompt: PROMPT_VERSION,
      model: MODEL_ID,
      schema: OUTPUT_SCHEMA_VERSION,
    });
    // Deploy identity: a commit and region are always present (a literal "local" off-platform).
    expect(typeof body.commit).toBe("string");
    expect(body.commit.length).toBeGreaterThan(0);
    expect(typeof body.region).toBe("string");
  });

  it("never leaks secrets", async () => {
    const raw = JSON.stringify(await GET().json());
    expect(raw).not.toMatch(/API_KEY|Bearer|sk-|secret/i);
  });
});
