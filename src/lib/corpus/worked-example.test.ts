// The homepage's worked example is shown to every first-time visitor as evidence of what the
// product does. The risk it carries is specific: that it drifts into showing something the corpus
// does not actually say -- a sentence edited for the landing page, a citation that resolves to
// nothing, a hash that no longer matches the record behind the "Full record" link. Then the one
// page whose subject is provenance would be the page with none.
//
// These tests hold the card to the record. Everything it displays must be traceable back to
// corpus/variant/rs6025.json through the same projection the /variant page uses.

import { describe, it, expect } from "vitest";
import { corpusStore } from "./index";
import { toPublicRecord } from "./view";
import {
  getWorkedExample,
  WORKED_EXAMPLE_ID,
  WORKED_EXAMPLE_CLAIM_LIMIT,
  WORKED_EXAMPLE_CONDITION_LIMIT,
} from "./worked-example";
import type { VariantFacts } from "../facts";

describe("the homepage worked example", () => {
  it("resolves to a record that is actually in the corpus", async () => {
    // If this fails the card still renders, but its "Full record ↗" link 404s -- the page would be
    // citing a page that does not exist, which is the exact failure the product exists to avoid.
    const record = await corpusStore.getVariant(WORKED_EXAMPLE_ID);
    expect(record, `corpus/variant/${WORKED_EXAMPLE_ID}.json is missing`).not.toBeNull();
  });

  it("invents no sentence: every claim is the record's own, verbatim", async () => {
    const example = await getWorkedExample();
    const record = await corpusStore.getVariant(WORKED_EXAMPLE_ID);
    const stored = new Set((record!.claims ?? []).map((c) => c.text));

    expect(example!.claims.length).toBeGreaterThan(0);
    for (const claim of example!.claims) {
      expect(stored.has(claim.text), `not a stored claim: ${claim.text}`).toBe(true);
    }
  });

  it("shows the record's own citations, unedited", async () => {
    const example = await getWorkedExample();
    const record = await corpusStore.getVariant(WORKED_EXAMPLE_ID);
    const byText = new Map(
      toPublicRecord(record!).explanation!.map((c) => [c.text, c.citations] as const),
    );

    for (const claim of example!.claims) {
      const expected = byText.get(claim.text);
      expect(expected, `claim not in the record: ${claim.text}`).toBeDefined();
      expect(claim.citations).toEqual(
        expected!.map((cit) => ({ source: cit.source, field: cit.field })),
      );
    }
  });

  it("shows one sentence per distinct ClinVar significance, not the first N", async () => {
    // The selection rule is the card's whole argument: rs6025 is Pathogenic, a drug-response
    // marker, a risk factor AND of uncertain significance, depending on the condition. Showing
    // the first five sentences instead would show five Pathogenic lines and make the variant look
    // settled. If this ever silently degrades to "first N", the card stops making the point.
    const example = await getWorkedExample();
    const record = await corpusStore.getVariant(WORKED_EXAMPLE_ID);
    const facts = toPublicRecord(record!).facts as VariantFacts;
    const stored = record!.claims ?? [];

    const significances: string[] = [];
    let identitySentences = 0;

    for (const claim of example!.claims) {
      const source = stored.find((c) => c.text === claim.text)!;
      const match = source.supportingFactIds
        .map((id) => /^var\.cond\.(\d+)\./.exec(id))
        .find(Boolean);
      if (!match) {
        identitySentences++;
        continue;
      }
      significances.push(facts.conditionClassifications[Number(match[1])].significance);
    }

    expect(identitySentences).toBe(1);
    expect(significances.length).toBeGreaterThan(1);
    expect(new Set(significances).size).toBe(significances.length);
  });

  it("gives every displayed sentence at least one citation", async () => {
    // A sentence with no chips beside it looks like an assertion the product cannot back, which is
    // worse on this card than anywhere else on the site.
    const example = await getWorkedExample();
    for (const claim of example!.claims) {
      expect(claim.citations.length, `uncited on the landing page: ${claim.text}`).toBeGreaterThan(0);
    }
  });

  it("reports the true totals, so the '+N more' lines cannot lie", async () => {
    const example = await getWorkedExample();
    const record = await corpusStore.getVariant(WORKED_EXAMPLE_ID);
    const pub = toPublicRecord(record!);
    const facts = pub.facts as VariantFacts;

    expect(example!.claimsTotal).toBe(pub.explanation!.length);
    expect(example!.conditionsTotal).toBe(facts.conditionClassifications.length);
    expect(example!.claims.length).toBeLessThanOrEqual(WORKED_EXAMPLE_CLAIM_LIMIT);
    expect(example!.conditions.length).toBeLessThanOrEqual(WORKED_EXAMPLE_CONDITION_LIMIT);
  });

  it("carries the record's ClinVar rows unaltered", async () => {
    const example = await getWorkedExample();
    const record = await corpusStore.getVariant(WORKED_EXAMPLE_ID);
    const facts = toPublicRecord(record!).facts as VariantFacts;

    expect(example!.conditions).toEqual(
      facts.conditionClassifications.slice(0, WORKED_EXAMPLE_CONDITION_LIMIT).map((c) => ({
        condition: c.condition,
        significance: c.significance,
        significanceRank: c.significanceRank,
        reviewStars: c.reviewStars,
        reviewStatus: c.reviewStatus,
        origin: c.origin,
        lastEvaluated: c.lastEvaluated,
      })),
    );
  });

  it("prints the same factsHash the full record and the API print", async () => {
    // The hash is the card's strongest claim: it says this text was derived from exactly these
    // facts. It is only worth printing while it matches.
    const example = await getWorkedExample();
    const record = await corpusStore.getVariant(WORKED_EXAMPLE_ID);
    expect(example!.factsHash).toBe(record!.provenance.factsHash);
    expect(example!.retrievedAt).toBe(record!.provenance.retrievedAt);
  });

  it("links every source the record lists, and no others", async () => {
    const example = await getWorkedExample();
    const record = await corpusStore.getVariant(WORKED_EXAMPLE_ID);
    const facts = record!.facts as VariantFacts;
    expect(example!.sources).toEqual(facts.sources.map((s) => ({ label: s.label, url: s.url })));
    expect(example!.sources.length).toBeGreaterThan(0);
  });

  it("points its own link at the record it rendered", async () => {
    const example = await getWorkedExample();
    expect(example!.href).toBe(`/variant/${WORKED_EXAMPLE_ID}`);
    expect(example!.id).toBe(WORKED_EXAMPLE_ID);
  });
});
