// Server component: renders a public corpus record (gene or variant) as an indexable page. All
// content is server-rendered HTML (good for SEO); the only client island is the 3D viewer toggle.
// Content is the precomputed artifact — no request-time inference.

import Link from "next/link";
import StructureSection from "./StructureSection";
import type { PublicRecord } from "@/lib/corpus/view";
import type { GeneFacts, VariantFacts } from "@/lib/facts";

const GENE_DISCLAIMER =
  "Educational information only — not medical advice or a diagnosis. Explanations summarize public database records; consult a qualified professional for interpretation relevant to you.";
const VARIANT_DISCLAIMER =
  "Educational information only — not medical advice, a diagnosis, or a clinical interpretation. A variant's significance can be uncertain, conflicting, or dependent on your full clinical and family context. Consult a qualified genetics professional or genetic counselor before drawing any conclusion.";

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-zinc-100 px-2 py-0.5 font-mono text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
      {children}
    </span>
  );
}

function Explanation({ record }: { record: PublicRecord }) {
  if (!record.explanation) {
    return (
      <p className="mt-6 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
        A grounded AI explanation isn&apos;t available for this record yet — the verified public-record
        facts and sources below stand on their own.
      </p>
    );
  }
  return (
    <div className="mt-6 space-y-3">
      {record.explanation.map((c, i) => (
        <p key={i} className="text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-300">
          {c.text}{" "}
          {c.citations.map((cit, j) => (
            <span
              key={j}
              className="ml-1 inline-block rounded bg-zinc-100 px-1.5 py-0.5 align-middle font-mono text-[10px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
            >
              {cit.source} · {cit.field}
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}

function GeneHeader({ facts }: { facts: GeneFacts }) {
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        {facts.symbol} <span className="text-zinc-400">gene</span>
      </h1>
      {facts.name && <p className="mt-1 text-lg text-zinc-500 dark:text-zinc-400">{facts.name}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {facts.type && <Badge>{facts.type}</Badge>}
        {facts.location && <Badge>{facts.location}</Badge>}
      </div>
      {facts.aliases.length > 0 && (
        <p className="mt-3 font-mono text-xs text-zinc-400">
          Also known as {facts.aliases.slice(0, 8).join(", ")}
        </p>
      )}
    </>
  );
}

function VariantHeader({ facts }: { facts: VariantFacts }) {
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">{facts.rsid}</h1>
      {facts.preferredName && (
        <p className="mt-1 font-mono text-sm text-zinc-500 dark:text-zinc-400">{facts.preferredName}</p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {facts.gene && (
          <Link href={`/gene/${facts.gene}`} className="no-underline">
            <Badge>{facts.gene} ↗</Badge>
          </Link>
        )}
        {facts.consequence && <Badge>{facts.consequence}</Badge>}
        {facts.proteinChange && <Badge>{facts.proteinChange}</Badge>}
        {facts.variantType && <Badge>{facts.variantType}</Badge>}
      </div>
      {facts.conditionClassifications.length > 0 && (
        <div className="mt-5">
          <span className="font-mono text-xs uppercase tracking-[0.14em] text-zinc-400">
            ClinVar by condition
          </span>
          <ul className="mt-2 space-y-1.5">
            {facts.conditionClassifications.slice(0, 12).map((c, i) => (
              <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="text-zinc-700 dark:text-zinc-300">{c.condition}</span>
                <span className="font-mono text-xs text-zinc-500">
                  {c.significance}
                  {c.reviewStars ? ` · ${"★".repeat(c.reviewStars)}` : ""}
                  {c.origin ? ` · ${c.origin}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {facts.gnomadAf != null && (
        <p className="mt-3 font-mono text-xs text-zinc-400">
          gnomAD allele frequency {facts.gnomadAf.toExponential(2)}
        </p>
      )}
    </>
  );
}

export default function CorpusRecordView({ record }: { record: PublicRecord }) {
  const { facts } = record;
  const isVariant = facts.kind === "variant";
  const v = isVariant ? (facts as VariantFacts) : null;
  return (
    <article className="rounded-2xl border border-zinc-100 p-6 dark:border-zinc-900 sm:p-8">
      {isVariant ? <VariantHeader facts={facts as VariantFacts} /> : <GeneHeader facts={facts as GeneFacts} />}

      <Explanation record={record} />

      {facts.uniprot && (
        <StructureSection
          uniprot={facts.uniprot}
          residue={v?.residue}
          residueLabel={v?.proteinChange || undefined}
        />
      )}

      <div className="mt-8 border-t border-zinc-100 pt-4 dark:border-zinc-900">
        <span className="font-mono text-xs uppercase tracking-[0.14em] text-zinc-400">Sources</span>
        <div className="mt-2 flex flex-wrap gap-3">
          {facts.sources.map((s) => (
            <a
              key={s.url}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs text-teal-700 hover:underline dark:text-teal-400"
            >
              {s.label} ↗
            </a>
          ))}
        </div>
        <p className="mt-2 font-mono text-[10px] leading-relaxed text-zinc-400">
          retrieved {facts.retrievedAt.slice(0, 10)} · facts {record.provenance.factsHash} ·{" "}
          {record.provenance.modelId} · prompt {record.provenance.promptVersion} · schema{" "}
          {record.provenance.schemaVersion}
        </p>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-zinc-400">
        {isVariant ? VARIANT_DISCLAIMER : GENE_DISCLAIMER}
      </p>
    </article>
  );
}
