"use client";

// The interactive "try it" island for /demo — the surface used in sales demos (see
// docs/GTM-VALIDATION-SPRINT.md §7, step 3). A prospect types a gene symbol or rsID; if it's
// already in the Tier 0 corpus, the SAME /embed/{gene,variant}/[id] page a customer would iframe
// on their own site loads live here, plus the matching /api/v1 URL, a copyable <iframe> embed
// snippet, and a copyable curl call. Only corpus ids resolve — dynamicParams=false on the /embed
// pages means anything else 404s, so this pre-checks corpus membership via the same client-safe
// manifest lookup the homepage uses (src/lib/corpus/corpus-ids.ts) and never points the iframe at
// an id it knows will 404. No request-time inference anywhere in this flow.

import { useMemo, useState } from "react";
import Link from "next/link";
import { hasCorpusGene, hasCorpusVariant } from "@/lib/corpus/corpus-ids";
import CopySnippet from "./CopySnippet";

// Given directly by the sprint brief — kept local (not imported from src/lib/corpus/view) so this
// client island stays fully self-contained.
const SITE_URL = "https://genclarus.com";

type Parsed = { kind: "gene" | "variant"; id: string };

const isRsid = (s: string) => /^rs\d+$/i.test(s.trim());

function parseId(raw: string): Parsed | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return isRsid(trimmed)
    ? { kind: "variant", id: trimmed.toLowerCase() }
    : { kind: "gene", id: trimmed.toUpperCase() };
}

function isKnown(parsed: Parsed): boolean {
  return parsed.kind === "variant" ? hasCorpusVariant(parsed.id) : hasCorpusGene(parsed.id);
}

function embedPath(parsed: Parsed): string {
  return `/embed/${parsed.kind}/${parsed.id}`;
}

function apiPath(parsed: Parsed): string {
  return `/api/v1/${parsed.kind}/${parsed.id}`;
}

function iframeSnippet(path: string): string {
  return `<iframe
  src="${SITE_URL}${path}"
  width="100%"
  height="480"
  style="border:1px solid #e4e4e7;border-radius:12px"
  loading="lazy"
  title="Genclarus gene/variant explainer"
></iframe>`;
}

export default function DemoPlayground({
  geneExamples,
  variantExamples,
}: {
  geneExamples: string[];
  variantExamples: string[];
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState("");

  const parsed = useMemo(() => parseId(active), [active]);
  const known = parsed ? isKnown(parsed) : false;

  function load(term?: string) {
    const t = (term ?? query).trim();
    if (!t) return;
    setQuery(t);
    setActive(t);
  }

  return (
    <div className="mt-8">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
        className="flex gap-2"
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. BRCA1 or rs6025"
          autoCapitalize="none"
          spellCheck={false}
          aria-label="Gene symbol or rsID"
          className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-3 font-mono text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-teal-400"
        />
        <button
          type="submit"
          disabled={!query.trim()}
          className="rounded-lg bg-teal-700 px-5 py-3 font-medium text-white transition hover:bg-teal-800 focus-visible:ring-2 focus-visible:ring-teal-600/40 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-teal-500 dark:hover:bg-teal-400 dark:text-teal-950"
        >
          Load
        </button>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-zinc-400">try</span>
        {geneExamples.map((g) => (
          <button
            key={g}
            onClick={() => load(g)}
            className="rounded-md border border-zinc-200 px-2.5 py-1 font-mono text-xs text-zinc-600 transition hover:border-teal-600 hover:text-teal-700 dark:border-zinc-800 dark:text-zinc-400 dark:hover:border-teal-400 dark:hover:text-teal-400"
          >
            {g}
          </button>
        ))}
        {geneExamples.length > 0 && variantExamples.length > 0 && (
          <span className="ml-1 font-mono text-xs text-zinc-300 dark:text-zinc-600">·</span>
        )}
        {variantExamples.map((v) => (
          <button
            key={v}
            onClick={() => load(v)}
            className="rounded-md border border-zinc-200 px-2.5 py-1 font-mono text-xs text-zinc-600 transition hover:border-teal-600 hover:text-teal-700 dark:border-zinc-800 dark:text-zinc-400 dark:hover:border-teal-400 dark:hover:text-teal-400"
          >
            {v}
          </button>
        ))}
      </div>

      {!active && (
        <p className="mt-6 rounded-lg border border-zinc-100 bg-zinc-50 px-4 py-3 text-sm text-zinc-500 dark:border-zinc-900 dark:bg-zinc-900/40 dark:text-zinc-400">
          Type a gene symbol or rsID above, or pick an example. Only identifiers already published
          in the Tier 0 corpus resolve — this playground is a preview of exactly what a customer&apos;s
          own embed or API call would return, so it deliberately doesn&apos;t fall back to a live
          lookup.
        </p>
      )}

      {active && parsed && !known && (
        <p className="mt-6 rounded-lg border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <code className="font-mono text-xs">{active.trim()}</code> isn&apos;t in the published
          corpus yet, so its embed and API URL would 404 — that&apos;s the real behavior a customer
          would see, not a bug in this page. Try {geneExamples[0] ?? "BRCA1"} or{" "}
          {variantExamples[0] ?? "rs6025"}.
        </p>
      )}

      {active && parsed && known && (
        <div className="mt-8 grid gap-6">
          <div>
            <span className="font-mono text-xs uppercase tracking-[0.14em] text-zinc-400">
              Live widget preview — {embedPath(parsed)}
            </span>
            <iframe
              key={embedPath(parsed)}
              src={embedPath(parsed)}
              width="100%"
              height={480}
              loading="lazy"
              title="Genclarus gene/variant explainer preview"
              className="mt-2 w-full rounded-xl border border-zinc-200 dark:border-zinc-800"
            />
          </div>

          <div>
            <span className="font-mono text-xs uppercase tracking-[0.14em] text-zinc-400">
              Embed snippet
            </span>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Paste this into any page to embed the widget above.
            </p>
            <div className="mt-2">
              <CopySnippet code={iframeSnippet(embedPath(parsed))} />
            </div>
          </div>

          <div>
            <span className="font-mono text-xs uppercase tracking-[0.14em] text-zinc-400">
              API call
            </span>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Same record, as JSON —{" "}
              <a
                href={apiPath(parsed)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal-700 underline-offset-2 hover:underline dark:text-teal-400"
              >
                {SITE_URL}
                {apiPath(parsed)} ↗
              </a>
            </p>
            <div className="mt-2">
              <CopySnippet code={`curl ${SITE_URL}${apiPath(parsed)}`} label="Copy curl" />
            </div>
          </div>

          <p className="text-xs leading-relaxed text-zinc-400">
            See the{" "}
            <Link href="/developers" className="text-teal-700 hover:underline dark:text-teal-400">
              full API &amp; widget docs
            </Link>{" "}
            for the response shape, provenance/factsHash fields, and the batch endpoint.
          </p>
        </div>
      )}
    </div>
  );
}
