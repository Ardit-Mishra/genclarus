// Prompt assembly for grounded synthesis. This is the request half of the grounding contract:
// it turns the deterministic EvidenceFact list into the messages the model sees, and pulls the
// JSON object back out of the reply. It states the schema; the grounding validator ENFORCES it —
// the prompt is a request, the validator is the guarantee. Kept separate from explain.ts so the
// orchestration (cache, backend selection, escalation) never tangles with prompt wording.

import type { Facts } from "./facts";
import type { EvidenceFact } from "./evidence";
import type { NimMessage } from "./nim";

// Serialize the evidence as terse numbered lines the model cites by id. The ids are the ONLY thing
// a claim may reference, so they are the most prominent token on each line.
function serializeEvidence(evidence: EvidenceFact[]): string {
  return evidence
    .map((f) => {
      const q = f.qualifiers && Object.keys(f.qualifiers).length
        ? " [" + Object.entries(f.qualifiers).map(([k, v]) => `${k}: ${v}`).join("; ") + "]"
        : "";
      return `id "${f.id}" (${f.source} · ${f.field}): ${f.value}${q}`;
    })
    .join("\n");
}

// Shared, compact rules. The schema is stated here AND enforced by the validator — the prompt is a
// request, the validator is the guarantee.
// The model writes NON-CLINICAL context only. Every clinical/numeric statement (classification,
// condition verdict, frequency, drug-response, review status, penetrance, germline/somatic) is now
// built deterministically from the facts by src/lib/render-clinical.ts and is NOT the model's job —
// the validator rejects any clinical claim the model returns. This keeps the LLM to what it is good
// at (plain-language identity + general biological function) and out of the numbers.
const SYSTEM = [
  "You explain what a human gene or variant IS and what it broadly DOES, for curious non-specialists.",
  "Return ONLY a JSON object of this exact shape, with no markdown, no code fences and no text outside it:",
  '{"claims":[{"text":string,"supportingFactIds":string[],"claimType":string}]}',
  "Rules — follow every one:",
  "- Write NO MORE THAN 3 claims total. This is a hard limit.",
  "- Write ONLY non-clinical context: gene identity and general biological function. claimType MUST be 'identity' or 'function' only.",
  "- Do NOT state any clinical classification, condition verdict, pathogenicity, allele frequency, percentage, drug response, toxicity, review status, penetrance, or germline/somatic status — those are added separately and will be REJECTED if you write them.",
  "- Each claim is exactly ONE sentence of at most 35 words, citing 1 to 3 supportingFactIds, using ONLY ids from the facts given.",
  "- Every gene symbol, protein change and entity in a claim MUST appear verbatim in the facts it cites. Invent nothing.",
  "- Do not address the reader ('you'/'your'). No diagnosis, prognosis, treatment, dosage, personal risk, or causal/actionable claims.",
].join("\n");

const REPAIR =
  "Your previous reply did not match the schema. Return ONLY a JSON object {\"claims\":[...]} with AT MOST 3 claims of claimType 'identity' or 'function' only, each exactly one sentence citing 1-3 of the given ids, and no text outside the JSON.";

export function messagesFor(facts: Facts, evidence: EvidenceFact[], repair: boolean): NimMessage[] {
  const subject =
    facts.kind === "gene"
      ? `the human gene ${facts.symbol}${facts.name ? ` (${facts.name})` : ""}`
      : `the human variant ${facts.rsid}${facts.gene ? ` in the ${facts.gene} gene` : ""}`;
  const messages: NimMessage[] = [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content:
        `Facts about ${subject}:\n${serializeEvidence(evidence)}\n\n` +
        "Write the grounded claims JSON now, citing only the ids above.",
    },
  ];
  if (repair) messages.push({ role: "system", content: REPAIR });
  return messages;
}

// Pull the JSON object out of the model's reply: strip any code fence, then slice to the outermost
// braces. Keeps the grounding parser strict while tolerating the wrapping a free-tier model adds.
export function extractJson(text: string): string {
  let t = text.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  return start >= 0 && end > start ? t.slice(start, end + 1) : t;
}
