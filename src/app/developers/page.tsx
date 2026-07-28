// /developers — the technical/product-buyer docs surface for the B2B commercial-validation sprint
// (see docs/GTM-VALIDATION-SPRINT.md §2, §7 and docs/CORPUS-INCREMENT-1-ADR.md §6). Documents BOTH
// integration formats — the iframe widget and the /api/v1 read API — with real request/response
// examples pulled from the committed corpus at BUILD time (corpusStore + toPublicRecord), the same
// read path the pages and API routes use. No request-time inference, no request-time filesystem
// read beyond what SSG already does for every other corpus page.
//
// Indexable by design (unlike /embed and /embed/*, which are noindex widget targets): this page is
// meant to rank and to be the link dropped in outreach/demos. It is NOT wired into src/app/sitemap.ts
// (a shared file this task must not edit) — see the agent report for the sitemap entry to add.

import Link from "next/link";
import type { Metadata } from "next";
import { corpusStore } from "@/lib/corpus";
import { toPublicRecord, SITE_URL, type PublicRecord } from "@/lib/corpus/view";
import CopySnippet from "./CopySnippet";

export const dynamic = "force-static";

const TITLE = "Developers — widget & API docs | Genclarus";
const DESCRIPTION =
  "Embed a cited, grounded gene or variant explanation with one iframe, or call the versioned /api/v1 read API. No request-time model inference — every response is a precomputed, provenance-stamped public-record artifact.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/developers" },
  robots: { index: true, follow: true },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${SITE_URL}/developers`, type: "website" },
};

const EXAMPLE_GENE = "BRCA1";
const EXAMPLE_VARIANT = "rs6025";
const EXAMPLE_MISSING = "NOTAGENE";

function iframeSnippet(path: string) {
  return `<iframe
  src="${SITE_URL}${path}"
  width="100%"
  height="480"
  style="border:1px solid #e4e4e7;border-radius:12px"
  loading="lazy"
  title="Genclarus gene/variant explainer"
></iframe>`;
}

function curl(path: string) {
  return `curl ${SITE_URL}${path}`;
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-mono text-xs uppercase tracking-[0.14em] text-zinc-400">{children}</h2>
  );
}

function EndpointHeading({ method, path }: { method: string; path: string }) {
  return (
    <p className="mt-4 font-mono text-sm">
      <span className="rounded bg-teal-50 px-1.5 py-0.5 font-semibold text-teal-700 dark:bg-teal-500/10 dark:text-teal-300">
        {method}
      </span>{" "}
      <span className="text-zinc-800 dark:text-zinc-200">{path}</span>
    </p>
  );
}

export default async function DevelopersPage() {
  const [genes, variants, missingRecord] = await Promise.all([
    corpusStore.listGenes(),
    corpusStore.listVariants(),
    corpusStore.getGene(EXAMPLE_MISSING),
  ]);
  const geneId = genes.includes(EXAMPLE_GENE) ? EXAMPLE_GENE : genes[0];
  const variantId = variants.includes(EXAMPLE_VARIANT) ? EXAMPLE_VARIANT : variants[0];

  const [geneRecord, variantRecord] = await Promise.all([
    corpusStore.getGene(geneId),
    corpusStore.getVariant(variantId),
  ]);
  const genePublic: PublicRecord | null = geneRecord ? toPublicRecord(geneRecord) : null;
  const variantPublic: PublicRecord | null = variantRecord ? toPublicRecord(variantRecord) : null;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-16 sm:py-20">
      <Link
        href="/"
        className="mb-6 font-mono text-xs text-zinc-400 transition hover:text-teal-600 dark:hover:text-teal-400"
      >
        ← Genclarus
      </Link>

      <span className="font-mono text-xs uppercase tracking-[0.2em] text-teal-700 dark:text-teal-400">
        For developers &amp; integrators
      </span>
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
        Embed the widget, or call the API
      </h1>
      <p className="mt-4 text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-400">
        Genclarus serves a curated, versioned corpus of {genes.length} gene and {variants.length}{" "}
        variant explanations — grounded in public biomedical databases (MyGene, ClinVar, dbSNP,
        gnomAD), cited at the claim level, and precomputed. There is no request-time model call:
        every widget render and every API response reads the same committed artifact a static
        page renders, so integration cost is one <code className="font-mono text-sm">&lt;iframe&gt;</code>{" "}
        or one <code className="font-mono text-sm">GET</code>, not a biomedical data pipeline.
      </p>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <Link href="/demo" className="text-teal-700 underline-offset-2 hover:underline dark:text-teal-400">
          Try it live in the demo playground →
        </Link>
        <Link href="/embed" className="text-teal-700 underline-offset-2 hover:underline dark:text-teal-400">
          Browse embeddable widgets →
        </Link>
      </p>

      {/* ---------------------------------------------------------------- Widget */}
      <section className="mt-14 border-t border-zinc-100 pt-8 dark:border-zinc-900">
        <SectionLabel>Widget — embed via iframe</SectionLabel>
        <h2 className="mt-2 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          One iframe, no script
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Every corpus gene and variant has a compact, iframe-friendly page at{" "}
          <code className="font-mono text-xs">/embed/gene/[symbol]</code> or{" "}
          <code className="font-mono text-xs">/embed/variant/[rsid]</code>. Drop it into your page
          as-is:
        </p>
        <div className="mt-3">
          <CopySnippet code={iframeSnippet(`/embed/gene/${geneId}`)} />
        </div>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Same shape for a variant:
        </p>
        <div className="mt-3">
          <CopySnippet code={iframeSnippet(`/embed/variant/${variantId}`)} />
        </div>

        <ul className="mt-6 list-disc space-y-2 pl-5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          <li>
            <strong className="font-semibold text-zinc-800 dark:text-zinc-200">Branded today.</strong>{" "}
            Every embed carries a &quot;Powered by Genclarus&quot; link back to the full cited page.
            Co-branded / white-label embedding is part of the packaging under discussion for a
            pilot — it is not a build-time toggle yet, so don&apos;t promise it as shipped.
          </li>
          <li>
            <strong className="font-semibold text-zinc-800 dark:text-zinc-200">Responsive width, fixed height.</strong>{" "}
            The card fills <code className="font-mono text-xs">width: 100%</code> of its iframe. The
            iframe itself does not currently auto-resize to its content (no postMessage resize
            handshake) — pick a height that fits the record, or wrap it in a scroll container. 480px
            fits most single-condition records comfortably.
          </li>
          <li>
            <strong className="font-semibold text-zinc-800 dark:text-zinc-200">Claim-level citations.</strong>{" "}
            Each sentence in the explanation carries its own source chips (linking to the exact
            ClinVar/dbSNP/gnomAD/MyGene record it cites) — never a single blanket &quot;sources&quot;
            footer.
          </li>
          <li>
            <strong className="font-semibold text-zinc-800 dark:text-zinc-200">Corpus version shown.</strong>{" "}
            The card footer displays{" "}
            <code className="font-mono text-xs">
              corpus v{genePublic?.provenance.corpusSchemaVersion ?? "1.0.0"}
            </code>
            , and hovering it reveals the record&apos;s <code className="font-mono text-xs">factsHash</code>{" "}
            — the same value the API returns under <code className="font-mono text-xs">provenance.factsHash</code>.
          </li>
          <li>
            <strong className="font-semibold text-zinc-800 dark:text-zinc-200">No personalized interpretation.</strong>{" "}
            The widget explains the public record for a gene/variant. It never processes a user&apos;s
            genetic file, never asks for one, and never renders a personalized risk statement — see
            the disclaimer printed on every card.
          </li>
          <li>
            Only identifiers already in the corpus render — an id outside the corpus{" "}
            <code className="font-mono text-xs">404</code>s rather than falling back to a
            live-generated explanation.
          </li>
        </ul>
      </section>

      {/* ---------------------------------------------------------------- API */}
      <section className="mt-14 border-t border-zinc-100 pt-8 dark:border-zinc-900">
        <SectionLabel>API — read-only, versioned</SectionLabel>
        <h2 className="mt-2 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Three endpoints under /api/v1
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Every response is the exact same <code className="font-mono text-xs">PublicRecord</code>{" "}
          the corresponding <code className="font-mono text-xs">/gene</code> /{" "}
          <code className="font-mono text-xs">/variant</code> page renders — same facts, same
          explanation, same <code className="font-mono text-xs">provenance.factsHash</code>. Nothing
          is generated when the request arrives; these routes are statically prerendered from the
          committed corpus (the batch endpoint is the one exception — see below — and it still only
          reads committed files, never calls a model). The <code className="font-mono text-xs">/api/v1</code>{" "}
          prefix is a stable contract: it can gain fields without breaking an integration built
          against it today.
        </p>

        <EndpointHeading method="GET" path="/api/v1/gene/{symbol}" />
        <p className="mt-1.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Example — <code className="font-mono text-xs">{geneId}</code>:
        </p>
        <div className="mt-2">
          <CopySnippet code={curl(`/api/v1/gene/${geneId}`)} label="Copy curl" />
        </div>
        {genePublic && (
          <div className="mt-2">
            <CopySnippet code={json(genePublic)} label="Copy JSON" />
          </div>
        )}

        <EndpointHeading method="GET" path="/api/v1/variant/{rsid}" />
        <p className="mt-1.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Example — <code className="font-mono text-xs">{variantId}</code>. A variant with multiple
          ClinVar condition classifications returns all of them — {variantPublic
            ? (variantPublic.facts as { conditionClassifications?: unknown[] }).conditionClassifications
                ?.length ?? 0
            : 0}{" "}
          for this one; that is normal, not a formatting error:
        </p>
        <div className="mt-2">
          <CopySnippet code={curl(`/api/v1/variant/${variantId}`)} label="Copy curl" />
        </div>
        {variantPublic && (
          <div className="mt-2">
            <CopySnippet code={json(variantPublic)} label="Copy JSON" />
          </div>
        )}

        <p className="mt-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          An identifier outside the corpus returns <code className="font-mono text-xs">404</code>:
        </p>
        <div className="mt-2">
          <CopySnippet
            code={json({ status: 404, body: { error: "Not found in corpus." } })}
            label="Copy"
          />
        </div>
        {!missingRecord && (
          <p className="mt-1.5 text-xs text-zinc-400">
            (Verified above: <code className="font-mono text-xs">{EXAMPLE_MISSING}</code> is not in
            this build&apos;s corpus.)
          </p>
        )}

        <EndpointHeading method="POST" path="/api/v1/batch" />
        <p className="mt-1.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Annotate a whole panel in one call — body is <code className="font-mono text-xs">{"{ ids: string[] }"}</code>,
          capped at 100 ids. Each result carries the same <code className="font-mono text-xs">PublicRecord</code>{" "}
          shape as the single-record endpoints (abbreviated below — see the full shape in the{" "}
          <code className="font-mono text-xs">GET</code> examples above):
        </p>
        <div className="mt-2">
          <CopySnippet
            code={`curl ${SITE_URL}/api/v1/batch \\
  -X POST \\
  -H "Content-Type: application/json" \\
  -d '{"ids":["${geneId}","${variantId}","${EXAMPLE_MISSING}"]}'`}
            label="Copy curl"
          />
        </div>
        <div className="mt-2">
          <CopySnippet
            code={`{
  "results": [
    { "id": "${geneId}", "found": true, "record": { "kind": "gene", "id": "${geneId}", "facts": { ... }, "explanation": [ ... ], "aiAvailable": true, "fallbackReason": null, "provenance": { "factsHash": "${genePublic?.provenance.factsHash ?? "…"}", ... } } },
    { "id": "${variantId}", "found": true, "record": { "kind": "variant", "id": "${variantId}", "facts": { ... }, "explanation": [ ... ], "aiAvailable": true, "fallbackReason": null, "provenance": { "factsHash": "${variantPublic?.provenance.factsHash ?? "…"}", ... } } },
    { "id": "${EXAMPLE_MISSING}", "found": false }
  ],
  "counts": { "requested": 3, "found": 2, "notFound": 1 }
}`}
            label="Copy JSON"
          />
        </div>
        <p className="mt-2 text-xs leading-relaxed text-zinc-400">
          A malformed batch request (wrong body shape, empty/duplicate-free {'>'}100 ids, non-string
          id) returns <code className="font-mono text-xs">400</code>/<code className="font-mono text-xs">413</code>/
          <code className="font-mono text-xs">415</code> with{" "}
          <code className="font-mono text-xs">{"{ error, requestId }"}</code> — the single-record{" "}
          <code className="font-mono text-xs">GET</code> 404 above never includes a{" "}
          <code className="font-mono text-xs">requestId</code>; only the validated-body batch route
          does.
        </p>

        <p className="mt-6 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          There is no published rate limit yet (pilot terms — see below); the only enforced bound
          today is the 100-id batch cap. Authentication is not required — these are public,
          unmetered reads of public-record content.
        </p>
      </section>

      {/* ---------------------------------------------------------------- Usage & privacy */}
      <section className="mt-14 border-t border-zinc-100 pt-8 dark:border-zinc-900">
        <SectionLabel>Usage &amp; privacy</SectionLabel>
        <h2 className="mt-2 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Educational, non-diagnostic — and what we do (and don&apos;t) collect
        </h2>

        <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm leading-relaxed text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
          Content served through the widget and the API is <strong className="font-semibold">Tier 0</strong>:
          a plain-language, cited summary of the public biomedical record for a gene or variant.
          It is educational information only — not a diagnosis, not a personalized risk assessment,
          and not a substitute for a qualified genetics professional. Nothing here processes an end
          user&apos;s own genetic file or determines whether any specific person carries a variant.
          Do not present it, or allow it to be presented, as clinical advice.
        </div>

        <h3 className="mt-6 font-mono text-xs uppercase tracking-[0.14em] text-zinc-400">
          Privacy &amp; metering — the approach we&apos;re building toward
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          The principles below are the documented policy this integration is designed around. Some
          are already true of the shipping code (noted); usage metering is a planned step, not a
          system running today — read the distinction carefully before relying on it for billing.
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          <li>
            <strong className="font-semibold text-zinc-800 dark:text-zinc-200">Contextual/aggregate only.</strong>{" "}
            Any future usage measurement (widget loads, API calls) is designed to be contextual and
            aggregate — counts and timestamps, not per-lookup identity trails.
          </li>
          <li>
            <strong className="font-semibold text-zinc-800 dark:text-zinc-200">No sensitive data collected or forwarded, ever.</strong>{" "}
            No genotype, no rsID search terms tied to a person, no family history, and no health
            data is collected or sent to third parties by this product — today or planned. A gene or
            rsID passed to the widget/API is public-record content, not a data point about the
            requester.
          </li>
          <li>
            <strong className="font-semibold text-zinc-800 dark:text-zinc-200">No remarketing on gene/rsID.</strong>{" "}
            A visitor who looks up a gene or an rsID must never be retargeted as if a condition were
            inferred about them. This is a hard rule, not a configuration option.
          </li>
          <li>
            <strong className="font-semibold text-zinc-800 dark:text-zinc-200">Per-tenant billing metering — planned, not built.</strong>{" "}
            Today, <code className="font-mono text-xs">/api/v1</code> and <code className="font-mono text-xs">/embed</code> are
            unauthenticated public reads with no metering datastore behind them. Per-tenant usage
            metering for billing is planned as a Supabase-backed addition, to be introduced with the
            first paying pilot — not before. Nothing here should be read as &quot;usage is currently
            tracked and billed.&quot;
          </li>
        </ul>

        <p className="mt-6 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Questions about a pilot, provenance/update cadence, or a corpus gap for your use case —{" "}
          <Link href="/demo" className="text-teal-700 underline-offset-2 hover:underline dark:text-teal-400">
            try the live playground
          </Link>{" "}
          and reach out from there.
        </p>
      </section>

      <p className="mt-10 border-t border-zinc-100 pt-4 text-xs leading-relaxed text-zinc-400 dark:border-zinc-900">
        Educational information only — not medical advice, a diagnosis, or a clinical
        recommendation.
      </p>
    </main>
  );
}
