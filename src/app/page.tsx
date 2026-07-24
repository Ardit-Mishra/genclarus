"use client";

import { useEffect, useState } from "react";

type Source = { label: string; url: string };

// Why the AI narrative is missing. The source data is always complete either way — the notice
// exists so an absent explanation reads as a known, bounded condition rather than a broken page.
type FallbackReason = "not_configured" | "provider_unavailable" | "provider_no_content";

// The narrative is requested separately from the facts, so it has its own lifecycle. The page is
// fully usable in every one of these states — that is the point of splitting them.
type NarrativeState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; text: string }
  | { status: "failed"; reason: FallbackReason };

type GeneResult = {
  kind?: "gene";
  symbol: string;
  name: string;
  type: string;
  summary: string;
  aliases: string[];
  location: string;
  sources: Source[];
  disclaimer: string;
};

type ConditionClassification = {
  condition: string;
  significance: string;
  rawSignificance: string;
  significanceRank: number;
  reviewStatus: string;
  reviewStars: number;
  origin: string;
  lastEvaluated: string | null;
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
  position: number | null;
  refAlt: string;
  assembly: string;
  conditionClassifications: ConditionClassification[];
  distinctSignificances: string[];
  hasSomatic: boolean;
  hasGermline: boolean;
  gnomadAf: number | null;
  hasClinvar: boolean;
  hgvsId: string;
  variantId: number | string | null;
  sources: Source[];
  disclaimer: string;
  retrievedAt: string;
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

// ClinVar's 0-4 gold-star review-confidence scale, rendered accessibly.
function ReviewStars({ n, label }: { n: number; label: string }) {
  return (
    <span
      className="inline-flex items-center gap-px align-middle"
      title={`ClinVar review: ${label} (${n}/4)`}
      aria-label={`ClinVar review confidence ${n} of 4 stars`}
    >
      {[0, 1, 2, 3].map((i) => (
        <svg key={i} viewBox="0 0 20 20" className="h-3 w-3" aria-hidden="true">
          <path
            d="M10 1.6l2.47 5.01 5.53.8-4 3.9.94 5.5L10 14.2l-4.94 2.6.94-5.5-4-3.9 5.53-.8L10 1.6z"
            className={i < n ? "fill-amber-500 dark:fill-amber-400" : "fill-zinc-200 dark:fill-zinc-700"}
          />
        </svg>
      ))}
    </span>
  );
}

function OriginTag({ origin }: { origin: string }) {
  if (!origin || origin === "unknown") return null;
  const somatic = origin === "somatic";
  return (
    <span
      className={`rounded px-1.5 py-px font-mono text-[10px] uppercase tracking-wide ${
        somatic
          ? "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"
          : "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300"
      }`}
    >
      {origin}
    </span>
  );
}

const FALLBACK_COPY: Record<FallbackReason, string> = {
  not_configured: "AI synthesis activates once the model key is configured.",
  provider_unavailable:
    "The AI explanation is temporarily unavailable. Everything below comes straight from the source databases and is unaffected.",
  provider_no_content:
    "The model returned no explanation this time. Everything below comes straight from the source databases and is unaffected.",
};

function FallbackNotice({ reason }: { reason: FallbackReason | null }) {
  if (!reason) return null;
  return (
    <p className="mt-4 border-l-2 border-zinc-200 pl-3 text-xs leading-relaxed text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
      {FALLBACK_COPY[reason]}
    </p>
  );
}

// How long the narrative may take before we say so. A free-tier model regularly needs 15s+, and
// silence that long reads as breakage.
const SLOW_NARRATIVE_MS = 10_000;

function NarrativePending() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), SLOW_NARRATIVE_MS);
    return () => clearTimeout(t);
  }, []);
  return (
    <p className="mt-4 flex items-start gap-2 border-l-2 border-teal-500/40 pl-3 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
      <span
        className="mt-1 h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-teal-600 dark:bg-teal-400"
        aria-hidden="true"
      />
      <span>
        {slow
          ? "The plain-language explanation is taking longer than usual. The verified source information below is complete and stays available."
          : "Generating a plain-language explanation… the verified source data below is already complete."}
      </span>
    </p>
  );
}

// Renders the narrative once it exists; until then (or if it never arrives) the verified source
// data stands on its own. The page is never blocked on the model.
function Narrative({ state, children }: { state: NarrativeState; children: React.ReactNode }) {
  if (state.status === "ready") return <Explanation md={state.text} />;
  return (
    <>
      {children}
      {state.status === "loading" && <NarrativePending />}
      {state.status === "failed" && <FallbackNotice reason={state.reason} />}
    </>
  );
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
  const [narrative, setNarrative] = useState<NarrativeState>({ status: "idle" });

  async function lookup(term?: string) {
    const t = (term ?? q).trim();
    if (!t || loading) return;
    if (term) setQ(term);
    setLoading(true);
    setError(null);
    setResult(null);
    setNarrative({ status: "idle" });

    const variant = isRsId(t);
    try {
      // Stage 1 — verified facts. Fast, and everything the page needs to be useful.
      const res = await fetch(variant ? "/api/variant" : "/api/gene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(variant ? { rsid: t } : { gene: t }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setResult(data as Result);
      // Stage 2 — the narrative, which may take many seconds on a free model tier. It arrives
      // when it arrives; the verified result above never waits for it.
      void loadNarrative(variant ? "variant" : "gene", t);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function loadNarrative(type: "gene" | "variant", identifier: string) {
    setNarrative({ status: "loading" });
    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, identifier }),
      });
      const data = await res.json();
      if (!res.ok || (!data.explanation && !data.fallbackReason)) {
        setNarrative({ status: "failed", reason: "provider_unavailable" });
      } else if (data.explanation) {
        setNarrative({ status: "ready", text: data.explanation });
      } else {
        setNarrative({ status: "failed", reason: data.fallbackReason });
      }
    } catch {
      setNarrative({ status: "failed", reason: "provider_unavailable" });
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
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{result.rsid}</h2>
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

          <p className="mt-4 rounded-lg bg-zinc-50 px-3 py-2 text-xs leading-relaxed text-zinc-500 dark:bg-zinc-800/50 dark:text-zinc-400">
            Looking up an rsID explains the public ClinVar/dbSNP record — it does{" "}
            <strong className="font-semibold text-zinc-700 dark:text-zinc-200">not</strong> determine
            whether you carry this variant.
          </p>

          <div className="mt-6">
            <Narrative state={narrative}>
              {result.hasClinvar ? (
                <p className="leading-relaxed text-zinc-700 dark:text-zinc-300">
                  {result.distinctSignificances.length > 0
                    ? `In ClinVar this variant is classified differently across conditions (${result.distinctSignificances.join(", ")}). See the per-condition breakdown below.`
                    : "This variant is recorded in ClinVar."}
                </p>
              ) : (
                <p className="text-zinc-500 dark:text-zinc-400">
                  No ClinVar clinical classification is available for this variant. Basic variant
                  data is shown below.
                </p>
              )}
            </Narrative>
          </div>

          {result.conditionClassifications.length > 0 && (
            <section className="mt-7">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                  ClinVar by condition
                </h3>
                <span className="font-mono text-[11px] text-zinc-400">
                  {result.conditionClassifications.length}
                  {result.conditionClassifications.length === 1 ? " condition" : " conditions"}
                  {result.distinctSignificances.length > 1 && " · varies"}
                </span>
              </div>

              <ul className="mt-2 divide-y divide-zinc-100 dark:divide-zinc-800">
                {result.conditionClassifications.slice(0, 12).map((c, i) => (
                  <li
                    key={`${c.condition}-${c.origin}-${i}`}
                    className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                  >
                    <div className="min-w-0">
                      <p className="text-sm leading-snug text-zinc-800 dark:text-zinc-200">
                        {c.condition}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <ReviewStars n={c.reviewStars} label={c.reviewStatus || "no assertion"} />
                        <OriginTag origin={c.origin} />
                        {c.lastEvaluated && (
                          <span className="font-mono text-[10px] text-zinc-400">
                            eval. {c.lastEvaluated}
                          </span>
                        )}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 self-start rounded-md px-2 py-0.5 text-xs font-medium ${sigBadgeClass(c.significanceRank)}`}
                    >
                      {c.significance}
                    </span>
                  </li>
                ))}
              </ul>
              {result.conditionClassifications.length > 12 && (
                <p className="mt-2 font-mono text-[11px] text-zinc-400">
                  +{result.conditionClassifications.length - 12} more on ClinVar ↓
                </p>
              )}
            </section>
          )}

          {result.sources.length > 0 && (
            <div className="mt-7 border-t border-zinc-100 pt-5 dark:border-zinc-800">
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

          <p className="mt-4 font-mono text-[10px] leading-relaxed text-zinc-400">
            {[
              result.variantId != null && `ClinVar Variation ${result.variantId}`,
              result.assembly && result.chrom && result.position
                ? `${result.assembly} chr${result.chrom}:${result.position.toLocaleString()}`
                : null,
              `retrieved ${result.retrievedAt.slice(0, 10)}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>

          <p className="mt-4 text-xs leading-relaxed text-zinc-400">{result.disclaimer}</p>
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
            <Narrative state={narrative}>
              {result.summary ? (
                <p className="leading-relaxed text-zinc-700 dark:text-zinc-300">{result.summary}</p>
              ) : (
                <p className="text-zinc-500 dark:text-zinc-400">
                  No curated summary is available for this gene yet.
                </p>
              )}
            </Narrative>
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
