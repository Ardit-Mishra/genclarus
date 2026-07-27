import type { MetadataRoute } from "next";
import { corpusStore } from "@/lib/corpus";
import { SITE_URL } from "@/lib/corpus/view";

// Built once from the committed corpus (same source as the pages), so the sitemap always matches
// exactly the set of indexable records.
export const dynamic = "force-static";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [genes, variants] = await Promise.all([
    corpusStore.listGenes(),
    corpusStore.listVariants(),
  ]);
  return [
    { url: SITE_URL, priority: 1 },
    ...genes.map((symbol) => ({ url: `${SITE_URL}/gene/${symbol}`, priority: 0.7 })),
    ...variants.map((rsid) => ({ url: `${SITE_URL}/variant/${rsid}`, priority: 0.7 })),
  ];
}
