"use client";

import { useState } from "react";

type Source = { label: string; url: string };

type GeneResult = {
  kind?: "gene";
  symbol: string;
  name: string;
  type: string;
  summary: string;
  aliases: string[];
  location: string;
  explanation: string | null;
  aiUnavailable: boolean;
  sources: Source[];
  disclaimer: string;
};

type VariantResult = {
  kind: "variant";
  rsid: string;
  gene: string;
  consequence: string;
  proteinChange: string;
  variantType: string;
  preferredName: string | null;
  chrom: string;
  refAlt: string;
  primarySignificance: string | null;
  significanceRank: number | null;
  significances: string[];
  conditions: string[];
  gnomadAf: number | null;
  hasClinvar: boolean;
  hgvsId: string;
  variantId: number | string | null;
  explanation: string | null;
  aiUnavailable: boolean;
  sources: Source[];
  disclaimer: string;
};

type Result = GeneResult | VariantResult;

const GENE_EXAMPLES = ["BRCA1", "TP53", "CFTR"];
const VARIANT_EXAMPLES = ["rs6025", "rs334", "rs1801133"];

const isRsId = (s: string) => /^rs\d{1,12}$/i.test(s.trim());

// ClinVar significance rank -> badge colour. Lower rank = more clinically severe.
function sigBadgeClass(rank: number | null): string {
  if (rank == null) return "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";
  if (rank <= 1) return "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300";
  if (rank <= 4) return "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300";
  if (rank <= 6) return "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";
  return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300";
}

function formatAf(af: number): string {
  const pct = af * 100;
  if (pct >= 1) return `${pct.toFixed(1)}%`;
  if (pct >= 0.01) return `${pct.toFixed(2)}%`;
  return `${af.toExponential(1)}`;
}

function Explanation({ md }: { md: string }) {
  return (
    <>
      {md
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((line, i) =>
          line.startsWith("##") ? (
            <h3
              key={i}
              className="mt-5 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-teal-700 first:mt-0 dark:text-teal-400"
            >
              {line.replace(/^#+\s*/, "")}
            </h3>
          ) : (
            <p key={i} className="mt-2 leading-relaxed text-zinc-700 dark:text-zinc-300">
              {line}
            </p>
          ),
        )}
    </>
  );
}

export default function Home() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function lookup(term?: string) {
    const t = (term ?? q).trim();
    if (!t || loading) return;
    if (term) setQ(term);
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const variant = isRsId(t);
      const res = await fetch(variant ? "/api/variant" : "/api/gene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(variant ? { rsid: t } : { gene: t }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Something went wrong. Please try again.");
      else setResult(data as Result);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-16 sm:py-24">
      <header className="text-center">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-teal-700 dark:text-teal-400">
          Bioinformatics · AI
        </span>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-5xl">
          Genclarus
        </h1>
        <p className="mx-auto mt-4 max-w-md text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
          Look up a human gene or a genetic variant (rsID) and get a clear, cited explanation
          grounded in real biology.
        </p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          lookup();
        }}
        className="mt-10 flex gap-2"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. BRCA1 or rs6025"
          autoCapitalize="none"
          spellCheck={false}
          aria-label="Gene symbol or rsID"
          className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-3 font-mono text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-teal-400"
        />
        <button
          type="submit"
          disabled={loading || !q.trim()}
          className="rounded-lg bg-teal-700 px-5 py-3 font-medium text-white transition hover:bg-teal-800 focus-visible:ring-2 focus-visible:ring-teal-600/40 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-teal-500 dark:hover:bg-teal-400 dark:text-teal-950"
        >
          {loading ? "Looking…" : "Explain"}
        </button>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-zinc-400">try</span>
        {GENE_EXAMPLES.map((g) => (
          <button
            key={g}
            onClick={() => lookup(g)}
            disabled={loading}
            className="rounded-md border border-zinc-200 px-2.5 py-1 font-mono text-xs text-zinc-600 transition hover:border-teal-600 hover:text-teal-700 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:border-teal-400 dark:hover:text-teal-400"
          >
            {g}
          </button>
        ))}
        <span className="ml-1 font-mono text-xs text-zinc-300 dark:text-zinc-600">·</span>
        {VARIANT_EXAMPLES.map((v) => (
          <button
            key={v}
            onClick={() => lookup(v)}
            disabled={loading}
            className="rounded-md border border-zinc-200 px-2.5 py-1 font-mono text-xs text-zinc-600 transition hover:border-teal-600 hover:text-teal-700 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:border-teal-400 dark:hover:text-teal-400"
          >
            {v}
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-8 rounded-lg border border-amber-300/60 bg-amber-50 px-4 py-3 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          {error}
        </p>
      )}

      {result && result.kind === "variant" && (
        <article className="mt-8 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900 sm:p-8">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{result.rsid}</h2>
            {result.primarySignificance && (
              <span
                className={`rounded-md px-2.5 py-0.5 text-sm font-medium ${sigBadgeClass(result.significanceRank)}`}
              >
                {result.primarySignificance}
              </span>
            )}
          </div>
          {result.preferredName && (
            <p className="mt-1 break-words font-mono text-xs text-zinc-500 dark:text-zinc-400">
              {result.preferredName}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {result.gene && (
              <button
                onClick={() => lookup(result.gene)}
                className="rounded-md bg-teal-50 px-2 py-0.5 font-mono text-xs text-teal-700 transition hover:bg-teal-100 dark:bg-teal-500/10 dark:text-teal-300 dark:hover:bg-teal-500/20"
                title={`Look up the ${result.gene} gene`}
              >
                {result.gene} ↗
              </button>
            )}
            {result.consequence && (
              <span className="rounded-md bg-zinc-100 px-2 py-0.5 font-mono text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                {result.consequence}
              </span>
            )}
            {result.proteinChange && (
              <span className="rounded-md bg-zinc-100 px-2 py-0.5 font-mono text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                {result.proteinChange}
              </span>
            )}
            {result.chrom && result.refAlt && (
              <span className="rounded-md bg-zinc-100 px-2 py-0.5 font-mono text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                chr{result.chrom} {result.refAlt}
              </span>
            )}
            {result.gnomadAf != null && (
              <span className="rounded-md bg-zinc-100 px-2 py-0.5 font-mono text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                {formatAf(result.gnomadAf)} freq
              </span>
            )}
          </div>

          <div className="mt-6">
            {result.explanation ? (
              <Explanation md={result.explanation} />
            ) : (
              <>
                {result.hasClinvar ? (
                  <p className="leading-relaxed text-zinc-700 dark:text-zinc-300">
                    {result.primarySignificance
                      ? `ClinVar reports this variant as: ${result.significances.join(", ")}.`
                      : "This variant is recorded in ClinVar."}
                  </p>
                ) : (
                  <p className="text-zinc-500 dark:text-zinc-400">
                    No ClinVar clinical classification is available for this variant. Basic variant
                    data is shown below.
                  </p>
                )}
                {result.aiUnavailable && (
                  <p className="mt-4 font-mono text-xs text-zinc-400">
                    Showing source data. AI synthesis activates once the model key is configured.
                  </p>
                )}
              </>
            )}
          </div>

          {result.significances.length > 1 && (
            <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-400">
              <span className="font-mono text-xs uppercase tracking-wide text-zinc-400">
                Reported classifications
              </span>{" "}
              {result.significances.join(" · ")}
            </p>
          )}

          {result.conditions.length > 0 && (
            <div className="mt-4">
              <span className="font-mono text-xs uppercase tracking-wide text-zinc-400">
                Associated conditions
              </span>
              <ul className="mt-2 flex flex-wrap gap-2">
                {result.conditions.map((c) => (
                  <li
                    key={c}
                    className="rounded-md border border-zinc-200 px-2 py-0.5 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400"
                  >
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.sources.length > 0 && (
            <div className="mt-6 border-t border-zinc-100 pt-5 dark:border-zinc-800">
              <span className="font-mono text-xs uppercase tracking-[0.14em] text-zinc-400">Sources</span>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {result.sources.map((s) => (
                  <a
                    key={s.label}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-teal-700 underline-offset-2 hover:underline dark:text-teal-400"
                  >
                    {s.label} ↗
                  </a>
                ))}
              </div>
            </div>
          )}

          <p className="mt-6 text-xs leading-relaxed text-zinc-400">{result.disclaimer}</p>
        </article>
      )}

      {result && result.kind !== "variant" && (
        <article className="mt-8 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900 sm:p-8">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{result.symbol}</h2>
            {result.name && <span className="text-zinc-500 dark:text-zinc-400">{result.name}</span>}
          </div>

          {(result.type || result.location) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {result.type && (
                <span className="rounded-md bg-zinc-100 px-2 py-0.5 font-mono text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                  {result.type.replace(/-/g, " ")}
                </span>
              )}
              {result.location && (
                <span className="rounded-md bg-zinc-100 px-2 py-0.5 font-mono text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                  {result.location}
                </span>
              )}
            </div>
          )}

          <div className="mt-6">
            {result.explanation ? (
              <Explanation md={result.explanation} />
            ) : (
              <>
                {result.summary ? (
                  <p className="leading-relaxed text-zinc-700 dark:text-zinc-300">{result.summary}</p>
                ) : (
                  <p className="text-zinc-500 dark:text-zinc-400">
                    No curated summary is available for this gene yet.
                  </p>
                )}
                {result.aiUnavailable && (
                  <p className="mt-4 font-mono text-xs text-zinc-400">
                    Showing source data. AI synthesis activates once the model key is configured.
                  </p>
                )}
              </>
            )}
          </div>

          {result.aliases.length > 0 && (
            <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-400">
              <span className="font-mono text-xs uppercase tracking-wide text-zinc-400">Also known as</span>{" "}
              {result.aliases.join(", ")}
            </p>
          )}

          {result.sources.length > 0 && (
            <div className="mt-6 border-t border-zinc-100 pt-5 dark:border-zinc-800">
              <span className="font-mono text-xs uppercase tracking-[0.14em] text-zinc-400">Sources</span>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {result.sources.map((s) => (
                  <a
                    key={s.label}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-teal-700 underline-offset-2 hover:underline dark:text-teal-400"
                  >
                    {s.label} ↗
                  </a>
                ))}
              </div>
            </div>
          )}

          <p className="mt-6 text-xs leading-relaxed text-zinc-400">{result.disclaimer}</p>
        </article>
      )}

      <footer className="mt-auto pt-16 text-center font-mono text-xs text-zinc-400">
        Data: MyGene.info · MyVariant.info · ClinVar · Built by{" "}
        <a
          href="https://github.com/Ardit-Mishra"
          target="_blank"
          rel="noopener noreferrer"
          className="text-zinc-500 hover:text-teal-700 dark:hover:text-teal-400"
        >
          Ardit Mishra
        </a>
      </footer>
    </main>
  );
}
