"use client";

import { useState } from "react";

type Source = { label: string; url: string };
type Result = {
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

const EXAMPLES = ["BRCA1", "TP53", "CFTR", "EGFR"];

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

  async function lookup(gene?: string) {
    const g = (gene ?? q).trim();
    if (!g || loading) return;
    if (gene) setQ(gene);
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/gene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gene: g }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Something went wrong. Please try again.");
      else setResult(data);
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
          GeneLens
        </h1>
        <p className="mx-auto mt-4 max-w-md text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
          Type a human gene and get a clear, cited explanation grounded in real biology.
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
          placeholder="e.g. BRCA1"
          autoCapitalize="characters"
          spellCheck={false}
          aria-label="Gene symbol"
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
        {EXAMPLES.map((g) => (
          <button
            key={g}
            onClick={() => lookup(g)}
            disabled={loading}
            className="rounded-md border border-zinc-200 px-2.5 py-1 font-mono text-xs text-zinc-600 transition hover:border-teal-600 hover:text-teal-700 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:border-teal-400 dark:hover:text-teal-400"
          >
            {g}
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-8 rounded-lg border border-amber-300/60 bg-amber-50 px-4 py-3 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          {error}
        </p>
      )}

      {result && (
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
        Data: MyGene.info · Built by{" "}
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
