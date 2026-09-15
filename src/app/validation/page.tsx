// /validation — the eval surface.
//
// Every number on this page is read at BUILD time from src/data/validation/report.json, which is
// committed and produced by `npm run measure:provenance && npm run measure:retrieval &&
// npm run measure:publish`. Nothing here is typed by hand, so the page cannot drift from the
// measurement the way prose does. If the artifact is missing the build fails loudly rather than
// rendering an empty section — an absent measurement must never look like a passing one.

import Link from "next/link";
import type { Metadata } from "next";
import { SITE_URL } from "@/lib/corpus/view";
import report from "@/data/validation/report.json";

export const dynamic = "force-static";

const TITLE = "Validation — how the explanations are checked | Genclarus";
const DESCRIPTION =
  "Every claim Genclarus renders cites the source fields it came from, and every citation is re-audited against the evidence that was actually fetched. Published metrics for claim provenance and retrieval, including the failures.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/validation" },
  robots: { index: true, follow: true },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${SITE_URL}/validation`, type: "website" },
};

const { provenance, retrieval } = report;

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="font-mono text-xs uppercase tracking-[0.14em] text-zinc-400">{children}</h2>;
}

function Stat({
  value,
  label,
  note,
  tone = "neutral",
}: {
  value: string;
  label: string;
  note: string;
  tone?: "neutral" | "good";
}) {
  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <p
        className={
          "font-mono text-2xl font-semibold tabular-nums " +
          (tone === "good"
            ? "text-teal-700 dark:text-teal-400"
            : "text-zinc-900 dark:text-zinc-100")
        }
      >
        {value}
      </p>
      <p className="mt-1 text-sm font-medium text-zinc-800 dark:text-zinc-200">{label}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">{note}</p>
    </div>
  );
}

function measuredOn(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

export default function ValidationPage() {
  const missedQueries = retrieval.queries.filter((q) => !q.hit);
  const droppedReasons = Object.entries(provenance.droppedByReason);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-16 sm:py-20">
      <Link
        href="/"
        className="mb-6 font-mono text-xs text-zinc-400 transition hover:text-teal-600 dark:hover:text-teal-400"
      >
        ← Genclarus
      </Link>

      <span className="font-mono text-xs uppercase tracking-[0.2em] text-teal-700 dark:text-teal-400">
        Validation
      </span>
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
        How these explanations are checked
      </h1>
      <p className="mt-4 text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-400">
        No language model writes factual content here. Explanations are rendered deterministically
        from typed facts pulled from MyGene, ClinVar, dbSNP and gnomAD, and every sentence carries
        the ids of the source fields it was built from. That design is only worth anything if the
        citations are actually checked — so they are, over the whole validation matrix, and the
        results are published below including the parts that miss.
      </p>

      {/* ------------------------------------------------------------- Provenance */}
      <section className="mt-14">
        <SectionLabel>Claim provenance</SectionLabel>
        <p className="mt-3 text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-400">
          Every claim that ships is re-audited from scratch against the evidence list the pipeline
          actually fetched: do all the fact ids it cites resolve, and would the validator still
          accept the sentence? Measured across {provenance.cases.length} gene and variant cases and{" "}
          {provenance.evidenceFacts.toLocaleString()} evidence facts on{" "}
          {measuredOn(provenance.generatedAt)}.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Stat
            value={provenance.claimsShipped.toLocaleString()}
            label="claims audited"
            note="Every sentence rendered across the matrix, not a sample."
          />
          <Stat
            tone="good"
            value={String(provenance.unboundShipped)}
            label="ungrounded claims shipped"
            note="A claim citing a fact id that does not resolve, or that the validator would reject. This is the number that matters; anything above zero fails the build."
          />
          <Stat
            tone="good"
            value={String(provenance.llmAuthored)}
            label="claims authored by a language model"
            note="Structurally zero since the model was removed from the factual path — measured rather than asserted, because that is the claim a reader is most entitled to see checked."
          />
          <Stat
            value={`${provenance.claimsDropped} of ${provenance.claimsRendered}`}
            label="claims the gate removed"
            note="Sentences the renderer produced that did not survive validation. Non-zero is the gate working: it fails closed, dropping a sentence rather than showing an unsupported one."
          />
        </div>

        {droppedReasons.length > 0 && (
          <div className="mt-4 rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
            <p className="font-medium text-zinc-800 dark:text-zinc-200">
              What was dropped, and by which rule
            </p>
            <ul className="mt-2 space-y-1 text-zinc-600 dark:text-zinc-400">
              {droppedReasons.map(([reason, count]) => (
                <li key={reason} className="flex gap-3">
                  <span className="font-mono text-xs text-zinc-400 tabular-nums">{count}×</span>
                  <span className="font-mono text-[13px]">{reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ------------------------------------------------------- The retired metric */}
      <section className="mt-14">
        <SectionLabel>A metric that had to be retired</SectionLabel>
        <p className="mt-3 text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-400">
          An earlier harness measured a &ldquo;grounded rate&rdquo;: how often the language
          model&rsquo;s structured output passed the validation gate instead of falling back to
          sources alone. When the model was removed from the factual path, that harness kept running
          and kept reporting a grounded rate of zero — on a system behaving exactly as designed. The
          number was not wrong so much as answering a question the product no longer asks.
        </p>
        <p className="mt-3 text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-400">
          It was replaced rather than quietly kept, because a stale metric that still renders is
          worse than no metric: it looks like evidence. The provenance audit above asks the question
          that survives the architecture change — is every shipped sentence bound to a source field
          that really exists?
        </p>
      </section>

      {/* -------------------------------------------------------------- Retrieval */}
      <section className="mt-14">
        <SectionLabel>Retrieval</SectionLabel>
        <p className="mt-3 text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-400">
          Search over the corpus is hybrid — BM25 lexical scoring fused with local embeddings by
          reciprocal rank fusion. It is evaluated separately from explanation quality, on a golden
          set of {retrieval.queries.length} plain-language questions where the correct record is
          known in advance. Measured {measuredOn(retrieval.generatedAt)}.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Stat
            value={retrieval.recallAtK.toFixed(3)}
            label={`Recall@${retrieval.k}`}
            note="Share of questions whose correct record appears in the top results."
          />
          <Stat
            value={retrieval.mrr.toFixed(3)}
            label="MRR"
            note="Mean reciprocal rank — rewards putting the right record first, not merely somewhere."
          />
          <Stat
            value={`${(retrieval.retrievalFailureRate * 100).toFixed(0)}%`}
            label="retrieval failure rate"
            note="Questions where the correct record was never retrieved at all."
          />
        </div>

        {missedQueries.length > 0 && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/50 p-4 text-sm dark:border-amber-500/20 dark:bg-amber-500/5">
            <p className="font-medium text-zinc-800 dark:text-zinc-200">
              What it currently misses
            </p>
            <ul className="mt-2 space-y-2 text-zinc-600 dark:text-zinc-400">
              {missedQueries.map((q) => (
                <li key={q.query}>
                  <span className="text-zinc-800 dark:text-zinc-200">&ldquo;{q.query}&rdquo;</span>{" "}
                  <span className="text-[13px]">
                    — expected{" "}
                    <span className="font-mono text-[13px]">{q.relevantIds.join(", ")}</span>, not
                    retrieved.
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              Listed rather than trimmed from the golden set. A phrasing that shares no vocabulary
              with the record it should match is the honest weak point of lexical-plus-embedding
              retrieval at this corpus size.
            </p>
          </div>
        )}
      </section>

      {/* -------------------------------------------------------------- Reproduce */}
      <section className="mt-14">
        <SectionLabel>Reproduce</SectionLabel>
        <p className="mt-3 text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-400">
          Both harnesses run against live sources with no API key and no model call. The published
          artifact is committed, so the number on this page and the number in the repository are the
          same file.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-50 p-4 font-mono text-[13px] leading-relaxed text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-300">
{`npm run measure:provenance   # audits every shipped claim against its cited evidence
npm run measure:retrieval    # scores the golden question set
npm run measure:publish      # writes src/data/validation/report.json`}
        </pre>
      </section>
    </main>
  );
}
