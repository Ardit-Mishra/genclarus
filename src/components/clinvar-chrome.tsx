// ClinVar presentation shared by the live lookup on the homepage and the worked example beside it.
//
// These three were defined inside the homepage component. They are shared now for a reason that is
// not tidiness: the worked example has to be rendered by the same code that renders a real answer,
// or it stops being evidence of what the product does and becomes a picture of it. Extracting them
// makes that structural rather than a promise.

/**
 * ClinVar significance -> chip colour, by the rank the record already carries.
 * Red for pathogenic, amber for the drug-response and risk band, neutral for uncertain and
 * conflicting, green for benign.
 */
export function sigBadgeClass(rank: number | null): string {
  if (rank == null) return "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";
  if (rank <= 1) return "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300";
  if (rank <= 4) return "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300";
  if (rank <= 6) return "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";
  return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300";
}

export function ReviewStars({ n, label }: { n: number; label: string }) {
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

export function OriginTag({ origin }: { origin: string }) {
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
