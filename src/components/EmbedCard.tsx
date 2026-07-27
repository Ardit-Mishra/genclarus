// Compact, self-contained rendering of a public corpus record for the embeddable widget
// (src/app/embed/**). Deliberately NOT CorpusRecordView (that component is full-page, dual-theme,
// and includes the 3D structure viewer) — an iframe widget needs a tighter layout, forced-light
// theme (so it looks consistent regardless of the host page's color scheme), and a visible
// "Powered by Genclarus" attribution linking back to the full record. Same PublicRecord shape,
// same claims/citations the full page renders, so the widget never says anything the full page
// doesn't already say — no separate content pipeline to keep honest.

import type { PublicRecord } from "@/lib/corpus/view";
import { canonicalPath, SITE_URL } from "@/lib/corpus/view";
import type { GeneFacts, VariantFacts } from "@/lib/facts";

const GENE_DISCLAIMER =
  "Educational information only — not medical advice or a diagnosis. Summarizes public database records.";
const VARIANT_DISCLAIMER =
  "Educational information only — not medical advice, a diagnosis, or a clinical interpretation. Consult a qualified genetics professional before drawing any conclusion.";

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600">
      {children}
    </span>
  );
}

function KeyFacts({ record }: { record: PublicRecord }) {
  const { facts } = record;
  if (facts.kind === "gene") {
    const f = facts as GeneFacts;
    return (
      <div className="mt-2 flex flex-wrap gap-1.5">
        {f.type && <Chip>{f.type}</Chip>}
        {f.location && <Chip>{f.location}</Chip>}
      </div>
    );
  }
  const f = facts as VariantFacts;
  const top = f.conditionClassifications[0];
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {f.gene && <Chip>{f.gene}</Chip>}
      {f.consequence && <Chip>{f.consequence}</Chip>}
      {f.proteinChange && <Chip>{f.proteinChange}</Chip>}
      {top && (
        <Chip>
          {top.significance}
          {top.reviewStars ? ` · ${"★".repeat(top.reviewStars)}` : ""}
        </Chip>
      )}
    </div>
  );
}

function Explanation({ record }: { record: PublicRecord }) {
  if (!record.explanation) {
    return (
      <p className="mt-3 text-[13px] leading-relaxed text-zinc-500">
        A grounded AI explanation isn&apos;t available for this record yet — the verified
        public-record facts and sources below stand on their own.
      </p>
    );
  }
  return (
    <div className="mt-3 space-y-2">
      {record.explanation.map((c, i) => (
        <p key={i} className="text-[13px] leading-relaxed text-zinc-700">
          {c.text}{" "}
          {c.citations.map((cit, j) => (
            <span
              key={j}
              className="ml-1 inline-block rounded bg-zinc-100 px-1 py-0.5 align-middle font-mono text-[9px] text-zinc-500"
            >
              {cit.source} · {cit.field}
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}

export default function EmbedCard({ record }: { record: PublicRecord }) {
  const { facts } = record;
  const isVariant = facts.kind === "variant";
  const title = isVariant ? (facts as VariantFacts).rsid : (facts as GeneFacts).symbol;
  const subtitle = isVariant
    ? (facts as VariantFacts).preferredName
    : (facts as GeneFacts).name;
  const fullPageUrl = `${SITE_URL}${canonicalPath(record)}`;

  return (
    <div className="w-full bg-white p-4 font-sans text-zinc-900 sm:p-5">
      <article className="rounded-xl border border-zinc-200 p-4 sm:p-5">
        <h1 className="text-xl font-bold tracking-tight text-zinc-900">
          {title}
          {isVariant && <span className="ml-1.5 font-normal text-zinc-400">variant</span>}
          {!isVariant && <span className="ml-1.5 font-normal text-zinc-400">gene</span>}
        </h1>
        {subtitle && <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>}

        <KeyFacts record={record} />
        <Explanation record={record} />

        <div className="mt-4 border-t border-zinc-100 pt-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400">
            Sources
          </span>
          <div className="mt-1.5 flex flex-wrap gap-2.5">
            {facts.sources.map((s) => (
              <a
                key={s.url}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[11px] text-teal-700 hover:underline"
              >
                {s.label} ↗
              </a>
            ))}
          </div>
        </div>

        <p className="mt-3 text-[10px] leading-relaxed text-zinc-400">
          {isVariant ? VARIANT_DISCLAIMER : GENE_DISCLAIMER}
        </p>

        <div className="mt-3 flex items-center justify-between border-t border-zinc-100 pt-2.5">
          <a
            href={fullPageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[10px] text-zinc-400 transition hover:text-teal-600"
          >
            Powered by <span className="font-semibold text-zinc-500">Genclarus</span> ↗
          </a>
        </div>
      </article>
    </div>
  );
}
