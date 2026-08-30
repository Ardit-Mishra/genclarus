// Local embedding backend — Ollama's /api/embeddings, model nomic-embed-text. Deliberately NOT
// routed through src/lib/http.ts's safeFetch: that module's allowlist is for outbound calls to
// public internet upstreams (MyGene, NIM, ...), a different trust boundary than a loopback-only
// dev tool. Ollama runs on Ardit's desktop, not on Vercel — so in production this will simply fail
// to connect, fast, and every caller here treats that as "semantic unavailable", never an error.
//
// $0 by construction: local model, no API key, no metered call. If Ollama is unreachable this
// returns null rather than throwing — callers (index build, live search) must fall back to
// lexical-only retrieval and say so, rather than inventing an embedding.

const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
export const EMBEDDING_MODEL = "nomic-embed-text";

// Short timeout: a reachable Ollama answers in well under a second for this model, and an
// unreachable one (production) should fail fast rather than eating into a request's time budget.
const EMBED_TIMEOUT_MS = Number(process.env.OLLAMA_EMBED_TIMEOUT_MS) || 8000;

export type EmbedResult = { embedding: number[] } | { embedding: null; reason: string };

export async function embedText(text: string, timeoutMs: number = EMBED_TIMEOUT_MS): Promise<EmbedResult> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: text }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { embedding: null, reason: `ollama_http_${res.status}` };
    const data = (await res.json()) as { embedding?: unknown };
    if (!Array.isArray(data.embedding) || !data.embedding.every((n) => typeof n === "number")) {
      return { embedding: null, reason: "ollama_bad_response" };
    }
    return { embedding: data.embedding as number[] };
  } catch (err) {
    const reason = err instanceof Error && err.name === "TimeoutError" ? "ollama_timeout" : "ollama_unreachable";
    return { embedding: null, reason };
  }
}

// Cosine similarity between two equal-length vectors. Returns 0 for a degenerate (zero) vector
// rather than NaN, so a bad embedding can never poison a ranking with NaN comparisons.
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
