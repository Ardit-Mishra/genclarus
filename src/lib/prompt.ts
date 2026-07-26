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
const SYSTEM = [
  "You turn verified biomedical facts into short, grounded claims for curious non-specialists.",
  "Return ONLY a JSON object of this exact shape, with no markdown, no code fences and no text outside it:",
  '{"claims":[{"text":string,"supportingFactIds":string[],"claimType":string}]}',
  "Rules — follow every one:",
  "- Write NO MORE THAN 4 claims total. This is a hard limit. Do NOT write one claim per condition.",
  "- Classifications are PER CONDITION and must not be merged into a single overall verdict; but when a variant has many conditions, SUMMARIZE how the classifications vary in one or two claims (e.g. name the most severe classification and note that others differ) rather than listing every condition.",
  "- Each claim is exactly ONE sentence of at most 35 words, citing 1 to 3 supportingFactIds, using ONLY ids from the facts given.",
  "- State each condition's classification using the EXACT classification value given for it. Never upgrade a benign, risk-factor, uncertain, drug-response or protective classification to 'pathogenic'.",
  "- Every number, gene symbol, protein change, classification label and condition name in a claim MUST appear verbatim in the facts it cites. Invent nothing.",
  "- Do not address the reader ('you'/'your'). No diagnosis, prognosis, treatment, dosage, personal risk, or causal/actionable claims.",
  "- If a cited classification is uncertain or conflicting, the claim must say so.",
  "- claimType is one of: identity, function, classification_context, condition_context, frequency_context, uncertainty.",
].join("\n");

const REPAIR =
  "Your previous reply did not match the schema. Return ONLY a JSON object {\"claims\":[...]} with AT MOST 4 claims, each exactly one sentence citing 1-3 of the given ids, and no text outside the JSON.";

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
