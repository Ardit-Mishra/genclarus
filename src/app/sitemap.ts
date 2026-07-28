import type { MetadataRoute } from "next";
import { corpusStore } from "@/lib/corpus";
import { SITE_URL } from "@/lib/corpus/view";
import { listPanelDefinitions } from "./panel/data";

// Built once from the committed corpus (same source as the pages), so the sitemap always matches
// exactly the set of indexable records.
export const dynamic = "force-static";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [genes, variants] = await Promise.all([
    corpusStore.listGenes(),
    corpusStore.listVariants(),
  ]);
  const panels = listPanelDefinitions();
  return [
    { url: SITE_URL, priority: 1 },
    { url: `${SITE_URL}/developers`, priority: 0.6 },
    { url: `${SITE_URL}/panel`, priority: 0.6 },
    ...panels.map((p) => ({ url: `${SITE_URL}/panel/${p.slug}`, priority: 0.7 })),
    ...genes.map((symbol) => ({ url: `${SITE_URL}/gene/${symbol}`, priority: 0.7 })),
    ...variants.map((rsid) => ({ url: `${SITE_URL}/variant/${rsid}`, priority: 0.7 })),
  ];
  // /embed/* is intentionally omitted — those pages are noindex (widget targets, not SEO pages).
}
