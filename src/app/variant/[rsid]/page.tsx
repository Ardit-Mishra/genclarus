// Static, indexable variant page — prerendered from the committed corpus. No request-time inference.
// dynamicParams=false: only corpus variants get a page (others remain usable via the homepage lookup).

import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { corpusStore } from "@/lib/corpus";
import { toPublicRecord, jsonLd, canonicalPath, SITE_URL } from "@/lib/corpus/view";
import type { VariantFacts } from "@/lib/facts";
import CorpusRecordView from "@/components/CorpusRecordView";

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
  const title = `${f.rsid}${f.gene ? ` (${f.gene}` : ""}${f.gene && f.proteinChange ? ` ${f.proteinChange}` : ""}${f.gene ? ")" : ""} | Genclarus`;
  const description =
    record.explanation?.[0]?.text ??
    `A cited, plain-language overview of the ${f.rsid} variant, grounded in ClinVar, dbSNP and gnomAD.`;
  const url = canonicalPath(record);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url: `${SITE_URL}${url}`, type: "article" },
  };
}

export default async function VariantPage({ params }: { params: Promise<{ rsid: string }> }) {
  const { rsid } = await params;
  const record = await load(rsid);
  if (!record) notFound();
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-16 sm:py-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(record)) }}
      />
      <Link
        href="/"
        className="mb-6 font-mono text-xs text-zinc-400 transition hover:text-teal-600 dark:hover:text-teal-400"
      >
        ← Genclarus
      </Link>
      <CorpusRecordView record={record} />
    </main>
  );
}
