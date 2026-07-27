// Indexable panel directory — lists every curated gene panel (corpus/panels.json). Static (SSG),
// no request-time inference.

import Link from "next/link";
import type { Metadata } from "next";
import { SITE_URL } from "@/lib/corpus/view";
import { listPanelDefinitions, panelCanonicalPath } from "./data";

export const dynamic = "force-static";

const TITLE = "Gene panels | Genclarus";
const DESCRIPTION =
  "Cited, plain-language overviews of common clinical gene panels — grouped, sourced explanations of the genes and variants tested together for a given condition.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/panel" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${SITE_URL}/panel`, type: "website" },
};

export default function PanelIndexPage() {
  const panels = listPanelDefinitions();
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-16 sm:py-20">
      <Link
        href="/"
        className="mb-6 font-mono text-xs text-zinc-400 transition hover:text-teal-600 dark:hover:text-teal-400"
      >
        ← Genclarus
      </Link>
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Gene panels
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-400">
        Curated groupings of genes and variants commonly tested together for a given condition,
        each linking to a cited, plain-language explanation.
      </p>

      <div className="mt-8 grid gap-3">
        {panels.map((p) => (
          <Link
            key={p.slug}
            href={panelCanonicalPath(p.slug)}
            className="block rounded-xl border border-zinc-100 p-4 transition hover:border-teal-300 hover:bg-teal-50/40 dark:border-zinc-900 dark:hover:border-teal-900 dark:hover:bg-teal-950/20"
          >
            <span className="font-semibold text-zinc-900 dark:text-zinc-50">{p.title}</span>
            <p className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              {p.description}
            </p>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-wide text-zinc-400">
              {p.geneIds.length} {p.geneIds.length === 1 ? "gene" : "genes"}
              {p.variantIds?.length
                ? ` · ${p.variantIds.length} ${p.variantIds.length === 1 ? "variant" : "variants"}`
                : ""}
            </p>
          </Link>
        ))}
      </div>

      <p className="mt-8 border-t border-zinc-100 pt-4 text-xs leading-relaxed text-zinc-400 dark:border-zinc-900">
        Educational information only — not medical advice, a diagnosis, or a clinical
        recommendation.
      </p>
    </main>
  );
}
