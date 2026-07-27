// Panel-specific member card: one row per gene/variant inside a /panel/[slug] page, linking to
// that record's own /gene or /variant page with a one-line grounded blurb. Reads a PublicRecord —
// the same shared projection the gene/variant pages already render — so the blurb text is always
// the record's own first grounded claim, never invented copy.

import Link from "next/link";
import { canonicalPath } from "@/lib/corpus/view";
import type { PublicRecord } from "@/lib/corpus/view";
import type { GeneFacts, VariantFacts } from "@/lib/facts";

const FALLBACK_BLURB =
  "A grounded AI explanation isn't available for this record yet — its public-record facts and sources stand on their own.";

export default function PanelMemberCard({ record }: { record: PublicRecord }) {
  const isVariant = record.kind === "variant";
  const gene = isVariant ? (record.facts as VariantFacts) : null;
  const label = isVariant ? gene!.rsid : (record.facts as GeneFacts).symbol;
  const subtitle = isVariant
    ? [gene!.gene, gene!.proteinChange || gene!.consequence].filter(Boolean).join(" · ") || "variant"
    : (record.facts as GeneFacts).name || "gene";
  const blurb = record.explanation?.[0]?.text ?? FALLBACK_BLURB;

  return (
    <Link
      href={canonicalPath(record)}
      className="block rounded-xl border border-zinc-100 p-4 transition hover:border-teal-300 hover:bg-teal-50/40 dark:border-zinc-900 dark:hover:border-teal-900 dark:hover:bg-teal-950/20"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {label}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-wide text-zinc-400">
          {record.kind} ↗
        </span>
      </div>
      <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</p>
      <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
        {blurb}
      </p>
    </Link>
  );
}
