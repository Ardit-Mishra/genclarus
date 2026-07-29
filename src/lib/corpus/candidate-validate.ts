// Strict validation of Stage-4 candidate artifacts (preflight item 2). A candidate record MUST be a
// well-formed CorpusRecordV2: every claim carries `origin`, `explanationState` is present and AGREES
// with computeExplanationState(origins), and provenance pins the v2 versions. A candidate manifest
// MUST be v2 and agree with its records. Pure — no I/O; the candidate store / regen tooling call it.

import { computeExplanationState, type ClaimOrigin } from "../explanation-state";
import { CORPUS_SCHEMA_VERSION, type CorpusRecordV2, type CorpusManifest } from "./types";
import { PROMPT_VERSION, OUTPUT_SCHEMA_VERSION } from "../version";

export type CandidateIssue = { id: string; rule: string; detail: string };

const ORIGINS: ReadonlySet<string> = new Set<ClaimOrigin>(["deterministic", "llm"]);

// Validate ONE candidate record against the strict v2 contract. Returns [] if clean.
export function validateCandidateRecord(rec: unknown): CandidateIssue[] {
  const issues: CandidateIssue[] = [];
  const r = rec as Partial<CorpusRecordV2> & { id?: string };
  const id = r?.id ?? "<unknown>";
  const push = (rule: string, detail: string) => issues.push({ id, rule, detail });

  if (!r || typeof r !== "object") return [{ id, rule: "not_object", detail: "record is not an object" }];
  if (r.kind !== "gene" && r.kind !== "variant") push("bad_kind", `kind=${String(r.kind)}`);
  if (!r.facts || typeof r.facts !== "object") push("missing_facts", "facts absent");
  if (!r.provenance) push("missing_provenance", "provenance absent");

  const p = r.provenance;
  if (p) {
    if (!p.factsHash) push("missing_facts_hash", "provenance.factsHash absent");
    if (!Array.isArray(p.sources) || p.sources.length === 0) push("missing_sources", "provenance.sources empty");
    if (p.corpusSchemaVersion !== CORPUS_SCHEMA_VERSION) push("bad_corpus_version", `corpusSchemaVersion=${p.corpusSchemaVersion} (want ${CORPUS_SCHEMA_VERSION})`);
    if (p.promptVersion !== PROMPT_VERSION) push("bad_prompt_version", `promptVersion=${p.promptVersion} (want ${PROMPT_VERSION})`);
    if (p.schemaVersion !== OUTPUT_SCHEMA_VERSION) push("bad_schema_version", `schemaVersion=${p.schemaVersion} (want ${OUTPUT_SCHEMA_VERSION})`);
  }

  // explanationState is REQUIRED on a v2 record and must agree with the claim origins.
  if (!r.explanationState) {
    push("missing_state", "explanationState absent (required on v2)");
  }
  if (r.claims !== null && !Array.isArray(r.claims)) {
    push("bad_claims", "claims is neither an array nor null");
  } else if (Array.isArray(r.claims)) {
    const origins: ClaimOrigin[] = [];
    r.claims.forEach((c, i) => {
      if (!c || typeof c.text !== "string" || !c.text) push("bad_claim", `claim[${i}] missing text`);
      if (!Array.isArray(c?.supportingFactIds) || c.supportingFactIds.length === 0) push("missing_citation", `claim[${i}] has no citations`);
      if (!c || !ORIGINS.has((c as { origin?: string }).origin ?? "")) push("missing_origin", `claim[${i}] missing/invalid origin`);
      else origins.push((c as { origin: ClaimOrigin }).origin);
    });
    // Stored state must equal the freshly-computed state from origins.
    if (r.explanationState && origins.length === r.claims.length) {
      const computed = computeExplanationState(origins);
      if (computed !== r.explanationState) push("state_disagrees", `stored=${r.explanationState} computed=${computed}`);
    }
  } else if (r.claims === null && r.explanationState && r.explanationState !== "source_only") {
    push("state_disagrees", `claims=null but state=${r.explanationState}`);
  }

  return issues;
}

// Validate a candidate MANIFEST: it must be v2 and its per-record entries must agree with the records.
export function validateCandidateManifest(
  manifest: CorpusManifest,
  records: CorpusRecordV2[],
): CandidateIssue[] {
  const issues: CandidateIssue[] = [];
  if (manifest.corpusSchemaVersion !== CORPUS_SCHEMA_VERSION)
    issues.push({ id: "<manifest>", rule: "manifest_version", detail: `manifest corpusSchemaVersion=${manifest.corpusSchemaVersion} (want ${CORPUS_SCHEMA_VERSION})` });
  // Every record's provenance version must match the manifest's (no mixed v1/v2 in one corpus).
  for (const r of records) {
    if (r.provenance.corpusSchemaVersion !== manifest.corpusSchemaVersion)
      issues.push({ id: r.id, rule: "mixed_version", detail: `record corpusSchemaVersion=${r.provenance.corpusSchemaVersion} != manifest ${manifest.corpusSchemaVersion}` });
  }
  const manifestIds = new Set(manifest.records.map((e) => `${e.kind}/${e.id}`));
  const recordIds = new Set(records.map((r) => `${r.kind}/${r.id}`));
  for (const k of manifestIds) if (!recordIds.has(k)) issues.push({ id: k, rule: "manifest_extra", detail: "manifest lists a record not present" });
  for (const k of recordIds) if (!manifestIds.has(k)) issues.push({ id: k, rule: "manifest_missing", detail: "record not listed in manifest" });
  return issues;
}
