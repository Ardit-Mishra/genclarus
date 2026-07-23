// Shared NVIDIA NIM synthesis — single source of truth for model config + call behaviour.
// The nemotron model intermittently returns empty content (~1 in 3) despite "detailed thinking
// off"; we retry once on an empty (but otherwise successful) response. Hard failures (non-OK
// status, timeout, network) are NOT retried — the graceful "source data only" fallback applies.

import { safeFetch, readJsonBounded } from "./http";
import { MODEL_ID } from "./version";

const NIM_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const NIM_MODEL = MODEL_ID;

export type NimMessage = { role: "system" | "user"; content: string };

export type NimResult = {
  explanation: string | null;
  // true only when the model could not be reached (no key / non-OK / timeout) — drives the
  // "AI synthesis activates once the model key is configured" hint. Empty content leaves it false.
  aiUnavailable: boolean;
};

export async function synthesize(messages: NimMessage[]): Promise<NimResult> {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) return { explanation: null, aiUnavailable: true };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await safeFetch(
        NIM_URL,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model: NIM_MODEL,
            temperature: 0.2,
            max_tokens: 500,
            messages,
          }),
        },
        30000,
      );
      if (!res.ok) return { explanation: null, aiUnavailable: true };
      const data = await readJsonBounded<{
        choices?: { message?: { content?: string } }[];
      }>(res, 256 * 1024);
      const text = data.choices?.[0]?.message?.content?.trim();
      const cleaned = text
        ? text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim() || null
        : null;
      if (cleaned) return { explanation: cleaned, aiUnavailable: false };
      // Empty content — fall through to retry once.
    } catch {
      return { explanation: null, aiUnavailable: true };
    }
  }
  // Both attempts returned empty content: model reachable, just unproductive.
  return { explanation: null, aiUnavailable: false };
}
