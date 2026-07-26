// Health + version endpoint. Two jobs, both operational-maturity (Phase 4):
//   1. A cheap liveness probe (`status: "ok"`) with no upstream calls.
//   2. Deploy identification — the prompt/model/schema versions plus the deployed commit sha, so a
//      rollback target is unambiguous: hit /api/health before and after a Vercel rollback to confirm
//      which build is actually live. `VERCEL_GIT_COMMIT_SHA`/`VERCEL_REGION` are injected in
//      production and absent locally (→ "local").
//
// It exposes nothing sensitive: the model id is already public provenance in /api/explain's meta,
// and no secrets, request data, or biomedical payloads are involved.

import { PROMPT_VERSION, MODEL_ID, OUTPUT_SCHEMA_VERSION } from "@/lib/version";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    status: "ok",
    versions: {
      prompt: PROMPT_VERSION,
      model: MODEL_ID,
      schema: OUTPUT_SCHEMA_VERSION,
    },
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    region: process.env.VERCEL_REGION ?? "local",
  });
}
