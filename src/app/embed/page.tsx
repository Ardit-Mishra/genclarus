// /embed — documents the iframe embed usage for the widget prototype. This is the "how to embed"
// surface for education/publisher customers: HOMELINK owns the full site homepage (src/app/page.tsx)
// so this doc page lives entirely under our own src/app/embed/** lane instead.
//
// noindex: this is product/docs surface, not a corpus record — it shouldn't rank alongside the
// gene/variant pages.

import Link from "next/link";
import type { Metadata } from "next";
import { corpusStore } from "@/lib/corpus";
import { SITE_URL } from "@/lib/corpus/view";
import CopySnippet from "./CopySnippet";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Embed a Genclarus widget | Genclarus",
  description:
    "Drop a grounded, cited gene or variant explanation into your own page with a single iframe.",
  robots: { index: false, follow: true },
};

const EXAMPLE_GENE = "BRCA1";
const EXAMPLE_VARIANT = "rs6025";

function iframeSnippet(path: string) {
  return `<iframe
  src="${SITE_URL}${path}"
  width="100%"
  height="480"
  style="border:1px solid #e4e4e7;border-radius:12px"
  loading="lazy"
  title="Genclarus gene/variant explainer"
></iframe>`;
}

export default async function EmbedIndexPage() {
  const [genes, variants] = await Promise.all([
    corpusStore.listGenes(),
    corpusStore.listVariants(),
  ]);
  const geneExample = genes.includes(EXAMPLE_GENE) ? EXAMPLE_GENE : genes[0];
  const variantExample = variants.includes(EXAMPLE_VARIANT) ? EXAMPLE_VARIANT : variants[0];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-16 sm:py-20">
      <Link
        href="/"
        className="mb-6 font-mono text-xs text-zinc-400 transition hover:text-teal-600 dark:hover:text-teal-400"
      >
        ← Genclarus
      </Link>

      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Embed a Genclarus widget
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-400">
        Every gene and variant in the Genclarus corpus has a compact, embeddable version of its
        page — a cited, plain-language explanation with sources and a disclaimer, sized to drop
        into an <code className="font-mono text-sm">&lt;iframe&gt;</code> on your own site. No
        script, no account, no request-time inference: it&apos;s the same precomputed, cited
        record the full page renders.
      </p>

      <section className="mt-10">
        <h2 className="font-mono text-xs uppercase tracking-[0.14em] text-zinc-400">
          Embed a gene
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          <code className="font-mono text-xs">/embed/gene/[symbol]</code> — e.g.{" "}
          <span className="font-mono text-xs">{geneExample}</span>.
        </p>
        <div className="mt-3">
          <CopySnippet code={iframeSnippet(`/embed/gene/${geneExample}`)} />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-mono text-xs uppercase tracking-[0.14em] text-zinc-400">
          Embed a variant
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          <code className="font-mono text-xs">/embed/variant/[rsid]</code> — e.g.{" "}
          <span className="font-mono text-xs">{variantExample}</span>.
        </p>
        <div className="mt-3">
          <CopySnippet code={iframeSnippet(`/embed/variant/${variantExample}`)} />
        </div>
      </section>

      <section className="mt-10 border-t border-zinc-100 pt-6 dark:border-zinc-900">
        <h2 className="font-mono text-xs uppercase tracking-[0.14em] text-zinc-400">
          Coverage &amp; scope
        </h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
          <li>
            Only identifiers already in the corpus render — {genes.length} genes and{" "}
            {variants.length} variants today. An unknown symbol or rsID 404s rather than falling
            back to live lookup, so an embed only ever serves precomputed, source-cited corpus
            content.
          </li>
          <li>
            Every explanation is Tier 0: precomputed, cited public-record content. Nothing here is
            personalized or clinical advice — see the disclaimer on each embedded card.
          </li>
          <li>Widgets carry a &quot;Powered by Genclarus&quot; link back to the full page.</li>
        </ul>
      </section>
    </main>
  );
}
