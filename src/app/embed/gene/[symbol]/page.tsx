// Embeddable, iframe-friendly gene page — prerendered from the committed corpus, same read path
// (corpusStore + toPublicRecord) as /gene/[symbol], just rendered compactly with no site header/nav
// via EmbedCard instead of CorpusRecordView. dynamicParams=false: only corpus genes get a page.
//
// noindex: this duplicates content the canonical /gene/[symbol] page already serves and exists only
// to be embedded on THIRD-PARTY pages, so it must not compete with the canonical page in search.
//
// Frameability: this route intentionally does not set X-Frame-Options / frame-ancestors itself —
// Next.js has no per-route header override here, so the app-wide CSP in next.config.ts (currently
// `frame-ancestors 'none'` + `X-Frame-Options: DENY` on `/:path*`) still applies and WILL block real
// iframe embedding of this page today. See the /embed index page and the agent report for the fix
// next.config.ts (owned by another lane) needs.

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { corpusStore } from "@/lib/corpus";
import { toPublicRecord, canonicalPath, SITE_URL } from "@/lib/corpus/view";
import type { GeneFacts } from "@/lib/facts";
import EmbedCard from "@/components/EmbedCard";

export const dynamicParams = false;

export async function generateStaticParams() {
  return (await corpusStore.listGenes()).map((symbol) => ({ symbol }));
}

async function load(symbol: string) {
  const record = await corpusStore.getGene(symbol);
  return record ? toPublicRecord(record) : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ symbol: string }>;
}): Promise<Metadata> {
  const { symbol } = await params;
  const record = await load(symbol);
  if (!record) return {};
  const f = record.facts as GeneFacts;
  const title = `${f.symbol} gene — embeddable widget | Genclarus`;
  const description =
    record.explanation?.[0]?.text ??
    `A cited, plain-language overview of the ${f.symbol} gene, grounded in public biomedical databases.`;
  return {
    title,
    description,
    robots: { index: false, follow: true },
    alternates: { canonical: `${SITE_URL}${canonicalPath(record)}` },
  };
}

export default async function EmbedGenePage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;
  const record = await load(symbol);
  if (!record) notFound();
  return <EmbedCard record={record} />;
}
