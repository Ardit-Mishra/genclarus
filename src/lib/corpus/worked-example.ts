// The homepage's worked example: one real corpus record, projected down to what the landing page
// shows above the fold.
//
// Why this exists at all. The homepage used to be a search box over an empty page -- a product whose
// entire argument is "every sentence is traceable to the record it came from" displayed no sentences
// and no records until you typed something. The fix is not a marketing panel; it is to show the
// actual output, built from the same corpus record and the same `toPublicRecord` projection that
// /variant/rs6025 renders. Nothing here is written by hand, so it cannot drift into claiming
// something the product does not do -- see worked-example.test.ts, which holds it to that.
//
// rs6025 (Factor V Leiden) is the record chosen because its ClinVar entry is genuinely
// heterogeneous: the same variant is Pathogenic for several conditions and a drug-response marker
// for another, at three different review-star levels. A variant with one tidy classification would
// make the product look simpler than the problem actually is.

import { corpusStore } from "./index";
import { toPublicRecord } from "./view";
import type { VariantFacts } from "../facts";

export const WORKED_EXAMPLE_ID = "rs6025";

// How many claims the card shows. The record has sixteen; five is what fits without the example
// turning into the page.
export const WORKED_EXAMPLE_CLAIM_LIMIT = 5;
export const WORKED_EXAMPLE_CONDITION_LIMIT = 4;

export type WorkedExampleClaim = {
  text: string;
  citations: { source: string; field: string }[];
};

export type WorkedExampleCondition = {
  condition: string;
  significance: string;
  significanceRank: number;
  reviewStars: number;
  reviewStatus: string;
  origin: string;
  lastEvaluated: string | null;
};

export type WorkedExample = {
  id: string;
  href: string;
  gene: string;
  preferredName: string;
  proteinChange: string;
  consequence: string;
  claims: WorkedExampleClaim[];
  claimsTotal: number;
  conditions: WorkedExampleCondition[];
  conditionsTotal: number;
  sources: { label: string; url: string }[];
  factsHash: string;
  retrievedAt: string;
};


/**
 * Which sentences the card shows.
 *
 * Not the first N. The first N of this record are five near-identical "classified as Pathogenic
 * for ..." lines, which makes the variant look simpler than it is and makes the card look like
 * filler. The rule instead is: the identity sentence, then the first sentence carrying each
 * distinct ClinVar significance the variant has.
 *
 * That selection is the point rather than a layout trick. rs6025 is simultaneously Pathogenic, a
 * drug-response marker, a risk factor, and of uncertain significance -- for different conditions,
 * at different review-star levels. A visitor who reads four sentences and sees four different
 * verdicts on one variant has understood in four sentences why a per-claim citation trail is
 * worth building.
 *
 * A claim is tied to its condition through its own supportingFactIds (`var.cond.<i>.<field>`),
 * not by assuming claim order matches the condition array.
 */
function pickClaims<T extends { text: string }>(
  stored: { text: string; supportingFactIds: string[] }[],
  projected: T[],
  facts: VariantFacts,
): T[] {
  const conditionIndex = (factIds: string[]): number | null => {
    for (const id of factIds) {
      const m = /^var\.cond\.(\d+)\./.exec(id);
      if (m) return Number(m[1]);
    }
    return null;
  };

  const picked: T[] = [];
  const seenSignificance = new Set<string>();

  for (let i = 0; i < projected.length && picked.length < WORKED_EXAMPLE_CLAIM_LIMIT; i++) {
    const supporting = stored[i]?.supportingFactIds ?? [];
    const idx = conditionIndex(supporting);
    if (idx === null) {
      // No condition behind it -- the identity sentence. Always worth the first line.
      picked.push(projected[i]);
      continue;
    }
    const significance = facts.conditionClassifications[idx]?.significance;
    if (!significance || seenSignificance.has(significance)) continue;
    seenSignificance.add(significance);
    picked.push(projected[i]);
  }
  return picked;
}

/**
 * Load the example, or null if the record is missing. Null is a real case, not a defensive
 * flourish: the corpus is a committed directory, and a page that hard-fails when one file is absent
 * would take the whole homepage down for a record it only uses as illustration.
 */
export async function getWorkedExample(): Promise<WorkedExample | null> {
  const record = await corpusStore.getVariant(WORKED_EXAMPLE_ID);
  if (!record) return null;

  const pub = toPublicRecord(record);
  const facts = pub.facts as VariantFacts;
  const claims = pub.explanation ?? [];

  return {
    id: pub.id,
    href: `/variant/${pub.id}`,
    gene: facts.gene ?? "",
    preferredName: facts.preferredName ?? "",
    proteinChange: facts.proteinChange ?? "",
    consequence: facts.consequence ?? "",
    claims: pickClaims(record.claims ?? [], claims, facts).map((c) => ({
      text: c.text,
      citations: c.citations.map((cit) => ({ source: cit.source, field: cit.field })),
    })),
    claimsTotal: claims.length,
    conditions: facts.conditionClassifications
      .slice(0, WORKED_EXAMPLE_CONDITION_LIMIT)
      .map((c) => ({
        condition: c.condition,
        significance: c.significance,
        significanceRank: c.significanceRank,
        reviewStars: c.reviewStars,
        reviewStatus: c.reviewStatus,
        origin: c.origin,
        lastEvaluated: c.lastEvaluated,
      })),
    conditionsTotal: facts.conditionClassifications.length,
    sources: facts.sources.map((s) => ({ label: s.label, url: s.url })),
    factsHash: pub.provenance.factsHash,
    retrievedAt: pub.provenance.retrievedAt,
  };
}
