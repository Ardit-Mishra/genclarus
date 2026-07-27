// Static, indexable gene-panel page — aggregates several corpus records (genes and/or variants)
// that make up a common clinical panel (e.g. hereditary breast/ovarian cancer). Prerendered from
// the committed corpus + corpus/panels.json; no request-time inference.
// dynamicParams=false: only curated panels (corpus/panels.json) get a page.

import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { SITE_URL } from "@/lib/corpus/view";
import PanelMemberCard from "@/components/PanelMemberCard";
import {
  listPanelDefinitions,
  getPanelDefinition,
  getPanelMembers,
  panelCanonicalPath,
  panelJsonLd,
} from "../data";

export const dynamicParams = false;

export async function generateStaticParams() {
  return listPanelDefinitions().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const panel = getPanelDefinition(slug);
  if (!panel) return {};
  const title = `${panel.title} | Genclarus`;
  const url = panelCanonicalPath(panel.slug);
  return {
    title,
    description: panel.description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description: panel.description,
      url: `${SITE_URL}${url}`,
      type: "article",
    },
  };
}

export default async function PanelPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const panel = getPanelDefinition(slug);
  if (!panel) notFound();

  const members = await getPanelMembers(panel);
  const geneCount = members.filter((m) => m.kind === "gene").length;
  const variantCount = members.filter((m) => m.kind === "variant").length;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-16 sm:py-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(panelJsonLd(panel, members)) }}
      />
      <Link
        href="/"
        className="mb-6 font-mono text-xs text-zinc-400 transition hover:text-teal-600 dark:hover:text-teal-400"
      >
        ← Genclarus
      </Link>
      <Link
        href="/panel"
        className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400 transition hover:text-teal-600 dark:hover:text-teal-400"
      >
        Gene panels
      </Link>
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        {panel.title}
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-400">
        {panel.description}
      </p>
      <p className="mt-2 font-mono text-xs text-zinc-400">
        {geneCount} {geneCount === 1 ? "gene" : "genes"}
        {variantCount > 0
          ? ` · ${variantCount} ${variantCount === 1 ? "variant" : "variants"}`
          : ""}
      </p>

      <div className="mt-8 grid gap-3">
        {members.map((m) => (
          <PanelMemberCard key={`${m.kind}-${m.id}`} record={m.record} />
        ))}
      </div>

      <p className="mt-8 border-t border-zinc-100 pt-4 text-xs leading-relaxed text-zinc-400 dark:border-zinc-900">
        Educational information only — not medical advice, a diagnosis, or a clinical
        recommendation. This panel is a curated grouping of public-record gene and variant pages
        for reference; it does not reflect your own genome or personal risk. Consult a qualified
        genetics professional or genetic counselor for interpretation relevant to you.
      </p>
    </main>
  );
}
