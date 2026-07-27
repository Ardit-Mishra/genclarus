// Panel data loader — curated gene-panel definitions (corpus/panels.json) resolved against the
// shared Tier 0 corpus. Every member id in corpus/panels.json is expected to already exist as a
// corpus record; getPanelMembers filters out anything that doesn't resolve so a stale panel
// definition degrades gracefully instead of breaking the build.
//
// This module only READS the shared corpus (via corpusStore + toPublicRecord) — it never writes to
// or modifies src/lib/corpus/* or corpus/*.

import { corpusStore } from "@/lib/corpus";
import { toPublicRecord, canonicalPath, SITE_URL } from "@/lib/corpus/view";
import type { PublicRecord } from "@/lib/corpus/view";
import panelsData from "../../../corpus/panels.json";

export type PanelDefinition = {
  slug: string;
  title: string;
  description: string;
  geneIds: string[];
  variantIds?: string[];
};

export type PanelMember = {
  kind: "gene" | "variant";
  id: string;
  record: PublicRecord;
};

const PANELS: PanelDefinition[] = (panelsData as { panels: PanelDefinition[] }).panels;

export function listPanelDefinitions(): PanelDefinition[] {
  return PANELS;
}

export function getPanelDefinition(slug: string): PanelDefinition | null {
  return PANELS.find((p) => p.slug === slug) ?? null;
}

export async function getPanelMembers(panel: PanelDefinition): Promise<PanelMember[]> {
  const geneMembers = await Promise.all(
    panel.geneIds.map(async (id): Promise<PanelMember | null> => {
      const rec = await corpusStore.getGene(id);
      return rec ? { kind: "gene", id, record: toPublicRecord(rec) } : null;
    }),
  );
  const variantMembers = await Promise.all(
    (panel.variantIds ?? []).map(async (id): Promise<PanelMember | null> => {
      const rec = await corpusStore.getVariant(id);
      return rec ? { kind: "variant", id, record: toPublicRecord(rec) } : null;
    }),
  );
  return [...geneMembers, ...variantMembers].filter((m): m is PanelMember => m !== null);
}

export function panelCanonicalPath(slug: string): string {
  return `/panel/${slug}`;
}

// Structured data for a panel page: a MedicalWebPage (matching the gene/variant pages) whose
// hasPart is an ItemList of the member record pages. Educational — never a clinical assertion.
export function panelJsonLd(
  panel: PanelDefinition,
  members: PanelMember[],
): Record<string, unknown> {
  const url = `${SITE_URL}${panelCanonicalPath(panel.slug)}`;
  return {
    "@context": "https://schema.org",
    "@type": "MedicalWebPage",
    name: panel.title,
    description: panel.description,
    url,
    isPartOf: { "@type": "WebSite", name: "Genclarus", url: SITE_URL },
    audience: { "@type": "Audience", audienceType: "Educational / patient information" },
    hasPart: {
      "@type": "ItemList",
      numberOfItems: members.length,
      itemListElement: members.map((m, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${SITE_URL}${canonicalPath(m.record)}`,
        name: m.kind === "gene" ? `${m.id} gene` : `${m.id} — genetic variant`,
      })),
    },
  };
}
