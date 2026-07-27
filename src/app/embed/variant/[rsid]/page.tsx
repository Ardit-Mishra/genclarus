// Embeddable, iframe-friendly variant page — prerendered from the committed corpus, same read path
// (corpusStore + toPublicRecord) as /variant/[rsid], just rendered compactly with no site header/nav
// via EmbedCard instead of CorpusRecordView. dynamicParams=false: only corpus variants get a page.
//
// noindex: this duplicates content the canonical /variant/[rsid] page already serves and exists only
// to be embedded on THIRD-PARTY pages, so it must not compete with the canonical page in search.
//
// Frameability: see src/app/embed/gene/[symbol]/page.tsx — same CSP caveat applies here.

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { corpusStore } from "@/lib/corpus";
import { toPublicRecord, canonicalPath, SITE_URL } from "@/lib/corpus/view";
import type { VariantFacts } from "@/lib/facts";
import EmbedCard from "@/components/EmbedCard";

export const dynamicParams = false;

export async function generateStaticParams() {
  return (await corpusStore.listVariants()).map((rsid) => ({ rsid }));
}

async function load(rsid: string) {
  const record = await corpusStore.getVariant(rsid);
  return record ? toPublicRecord(record) : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ rsid: string }>;
}): Promise<Metadata> {
  const { rsid } = await params;
  const record = await load(rsid);
  if (!record) return {};
  const f = record.facts as VariantFacts;
  const title = `${f.rsid}${f.gene ? ` (${f.gene})` : ""} — embeddable widget | Genclarus`;
  const description =
    record.explanation?.[0]?.text ??
    `A cited, plain-language overview of the ${f.rsid} variant, grounded in ClinVar, dbSNP and gnomAD.`;
  return {
    title,
    description,
    robots: { index: false, follow: true },
    alternates: { canonical: `${SITE_URL}${canonicalPath(record)}` },
  };
}

export default async function EmbedVariantPage({
  params,
}: {
  params: Promise<{ rsid: string }>;
}) {
  const { rsid } = await params;
  const record = await load(rsid);
  if (!record) notFound();
  return <EmbedCard record={record} />;
}
