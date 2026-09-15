// What an answer looks like, shown before the visitor has asked for one.
//
// The homepage previously ended at the search box: a product whose entire argument is that every
// sentence traces to the record it came from displayed neither a sentence nor a record until you
// typed. This card is that argument, made out of the argument's own material -- a real corpus
// record, projected by the same `toPublicRecord` the /variant pages use, rendered by the same
// ClinVar chrome a live answer is rendered with.
//
// It is labelled as stored rather than live, and it links to the full record, because the one thing
// worse than showing nothing would be showing something a visitor mistakes for a fresh lookup.

import Link from "next/link";
import { ReviewStars, OriginTag, sigBadgeClass } from "./clinvar-chrome";
import type { WorkedExample as Example } from "@/lib/corpus/worked-example";

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-zinc-100 px-2 py-0.5 font-mono text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
      {children}
    </span>
  );
}

export default function WorkedExample({ example }: { example: Example }) {
  const { claims, conditions } = example;

  return (
    <section
      aria-labelledby="worked-example-heading"
      className="mt-12 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/60 p-5 dark:border-zinc-700 dark:bg-zinc-900/40 sm:p-7"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2
          id="worked-example-heading"
          className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400"
        >
          A stored answer
        </h2>
        <Link
          href={example.href}
          className="font-mono text-xs text-teal-700 underline-offset-2 hover:underline dark:text-teal-400"
        >
          Full record ↗
        </Link>
      </div>

      <p className="mt-2 max-w-prose text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        Every sentence names the fields it was built from. This record is assembled
        deterministically — no model in the path — and rendered by the same components a live
        answer uses. One sentence per distinct ClinVar verdict, because the same variant is called
        something different depending on the condition.
      </p>

      <div className="mt-6 flex flex-wrap items-baseline gap-x-3 gap-y-2">
        <span className="text-xl font-bold text-zinc-900 dark:text-zinc-50">{example.id}</span>
        {example.gene && <Chip>{example.gene}</Chip>}
        {example.consequence && <Chip>{example.consequence}</Chip>}
        {example.proteinChange && <Chip>{example.proteinChange}</Chip>}
      </div>
      {example.preferredName && (
        <p className="mt-1.5 break-words font-mono text-xs text-zinc-500 dark:text-zinc-400">
          {example.preferredName}
        </p>
      )}

      {claims.length > 0 && (
        <div className="mt-5 space-y-3">
          {claims.map((claim, i) => (
            <p key={i} className="text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-300">
              {claim.text}{" "}
              {claim.citations.map((cit, j) => (
                <span
                  key={j}
                  className="ml-1 inline-block rounded bg-white px-1.5 py-0.5 align-middle font-mono text-[10px] text-zinc-500 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:ring-zinc-700"
                >
                  {cit.source} · {cit.field}
                </span>
              ))}
            </p>
          ))}
          {example.claimsTotal > claims.length && (
            <p className="font-mono text-[11px] text-zinc-400">
              +{example.claimsTotal - claims.length} more sentences on the full record
            </p>
          )}
        </div>
      )}

      {conditions.length > 0 && (
        <div className="mt-7">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
              ClinVar by condition
            </h3>
            <span className="font-mono text-[11px] text-zinc-400">
              {example.conditionsTotal}
              {example.conditionsTotal === 1 ? " condition" : " conditions"}
            </span>
          </div>

          <ul className="mt-2 divide-y divide-zinc-200 dark:divide-zinc-800">
            {conditions.map((c, i) => (
              <li
                key={`${c.condition}-${i}`}
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
          {example.conditionsTotal > conditions.length && (
            <p className="mt-2 font-mono text-[11px] text-zinc-400">
              +{example.conditionsTotal - conditions.length} more on the full record
            </p>
          )}
        </div>
      )}

      {example.sources.length > 0 && (
        <div className="mt-6 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <span className="font-mono text-xs uppercase tracking-[0.14em] text-zinc-400">Sources</span>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {example.sources.map((s) => (
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

      {/* The facts hash is the part a system without real provenance cannot print. Same hash on the
          /variant page and in the API response, for the same record. */}
      <p className="mt-3 font-mono text-[10px] leading-relaxed text-zinc-400">
        facts {example.factsHash} · retrieved {example.retrievedAt.slice(0, 10)}
      </p>
    </section>
  );
}
