// Shared inbound-request guardrails for /api/gene and /api/variant: Content-Type enforcement,
// a hard body-size cap, strict single-field body shape, Unicode normalization, and generic
// error responses carrying a short request id (never leak internals to the client).

const MAX_BODY_BYTES = 10 * 1024; // 10 KB — these routes only ever need a short identifier string

export class RequestValidationError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// Confirms Content-Type: application/json, then reads the body bounded to MAX_BODY_BYTES
// regardless of what (or whether) Content-Length claims, and parses it as JSON.
export async function readJsonBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new RequestValidationError("Unsupported content type.", 415);
  }

  const declaredLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new RequestValidationError("Request body too large.", 413);
  }

  if (!request.body) {
    throw new RequestValidationError("Invalid request.", 400);
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new RequestValidationError("Request body too large.", 413);
      }
      chunks.push(value);
    }
  }
  const text = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf-8");
  try {
    return JSON.parse(text);
  } catch {
    throw new RequestValidationError("Invalid request.", 400);
  }
}

// Extracts exactly one expected string field from a parsed JSON body. Rejects any body that
// isn't a plain object, has extra/missing/wrong-named properties, or a non-string value — then
// Unicode-normalizes (NFKC) the value before it reaches the caller's identifier regex, so
// visually-confusable/decomposed characters can't slip past validation.
export function extractSingleField(body: unknown, field: string): string {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new RequestValidationError("Invalid request.", 400);
  }
  const keys = Object.keys(body as Record<string, unknown>);
  if (keys.length !== 1 || keys[0] !== field) {
    throw new RequestValidationError("Invalid request.", 400);
  }
  const value = (body as Record<string, unknown>)[field];
  if (typeof value !== "string") {
    throw new RequestValidationError("Invalid request.", 400);
  }
  return value.normalize("NFKC");
}

// Generic client-facing error response: never includes internal details, always carries a
// short request id so a report from a user can be correlated with server-side logs.
export function jsonError(status: number, message: string): Response {
  const requestId = crypto.randomUUID().slice(0, 8);
  return Response.json({ error: message, requestId }, { status });
}
