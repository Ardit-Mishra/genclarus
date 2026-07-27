// /demo — the "try it" playground used in sales demos (docs/GTM-VALIDATION-SPRINT.md §7 step 3).
// Static shell (this file, SSG) + a client island (DemoPlayground) for the actual interactivity —
// no request-time inference anywhere. The example ids offered are computed here at BUILD time from
// the real corpus (corpusStore), so the playground never suggests an id that isn't actually
// published.
//
// noindex: like /embed, this is a product/sales surface, not corpus content — it shouldn't compete
// with /gene, /variant, or /developers in search. (Left as a note for the orchestrator: consider
// whether this should be indexed instead — see the agent report.)

import Link from "next/link";
import type { Metadata } from "next";
import { corpusStore } from "@/lib/corpus";
import DemoPlayground from "./DemoPlayground";

export const dynamic = "force-static";

const TITLE = "Try the widget — live demo | Genclarus";
const DESCRIPTION =
  "Type a gene symbol or rsID and see the Genclarus embeddable widget load live, plus the matching API call and copyable embed/curl snippets.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  robots: { index: false, follow: true },
  alternates: { canonical: "/demo" },
};

// Mirrors the homepage's example lists (src/app/page.tsx) so the "try" buttons stay familiar
// across surfaces, but is filtered against the real corpus here so a renamed/removed record can
// never leave a dead example button on this page.
const CANDIDATE_GENES = ["BRCA1", "TP53", "CFTR"];
const CANDIDATE_VARIANTS = ["rs6025", "rs334", "rs1801133"];

export default async function DemoPage() {
  const [genes, variants] = await Promise.all([
    corpusStore.listGenes(),
    corpusStore.listVariants(),
  ]);
  const geneExamples = CANDIDATE_GENES.filter((g) => genes.includes(g));
  const variantExamples = CANDIDATE_VARIANTS.filter((v) => variants.includes(v));

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-16 sm:py-20">
      <Link
        href="/"
        className="mb-6 font-mono text-xs text-zinc-400 transition hover:text-teal-600 dark:hover:text-teal-400"
      >
        ← Genclarus
      </Link>

      <span className="font-mono text-xs uppercase tracking-[0.2em] text-teal-700 dark:text-teal-400">
        Live demo
      </span>
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
        Try the widget
      </h1>
      <p className="mt-4 text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-400">
        Type a gene symbol or rsID already in the Tier 0 corpus ({genes.length} genes,{" "}
        {variants.length} variants today) and this page loads the exact embeddable widget a
        customer would iframe on their own site — plus the matching API URL and copyable snippets
        for both.
      </p>

      <DemoPlayground geneExamples={geneExamples} variantExamples={variantExamples} />

      <p className="mt-10 border-t border-zinc-100 pt-4 text-xs leading-relaxed text-zinc-400 dark:border-zinc-900">
        Educational information only — not medical advice, a diagnosis, or a clinical
        recommendation.
      </p>
    </main>
  );
}
