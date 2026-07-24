// The single source of biological facts. Both the lookup routes and the explanation route call
// these functions, so the model can never be handed facts that came from the browser — it only
// ever sees data this module derived from an allowlisted upstream.
//
// Everything here is deterministic: parsing, normalisation and classification. No LLM involved.

import { safeFetch, readJsonBounded } from "./http";
import { classifySignificance, buildConditionClassifications, type ConditionClassification } from "./clinvar";
import { TtlCache } from "./cache";

export type Source = { label: string; url: string };

export type GeneFacts = {
  kind: "gene";
  symbol: string;
  name: string;
  type: string;
  summary: string;
  aliases: string[];
  location: string;
  uniprot: string | null;
  sources: Source[];
  retrievedAt: string;
};

export type VariantFacts = {
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
  retrievedAt: string;
};

export type Facts = GeneFacts | VariantFacts;

// Carries the client-facing status so routes stay thin and every caller reports failures the
// same way — a lookup and an explanation must not disagree about whether a gene exists.
export class FactsError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// Upstream records change on database release cycles, not minute to minute; an hour of staleness
// is invisible to users and removes the second upstream call the explanation route would make.
const FACTS_TTL_MS = 60 * 60 * 1000;
const geneCache = new TtlCache<GeneFacts>(FACTS_TTL_MS);
const variantCache = new TtlCache<VariantFacts>(FACTS_TTL_MS);

// Exposed for tests; production never needs to reach in.
export function clearFactCaches(): void {
  geneCache.clear();
  variantCache.clear();
}

function asList<T>(v: T | T[] | undefined | null): T[] {
  return Array.isArray(v) ? v : v == null ? [] : [v];
}

function first<T>(v: T | T[] | undefined | null): T | undefined {
  return Array.isArray(v) ? v[0] : (v ?? undefined);
}

// ---------------------------------------------------------------- gene

export function normalizeGeneSymbol(raw: string): string {
  const trimmed = raw.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,19}$/.test(trimmed)) {
    throw new FactsError(
      "Enter a valid gene symbol — letters, numbers, or hyphens (e.g. BRCA1).",
      400,
    );
  }
  return trimmed.toUpperCase();
}

const GENE_FIELDS =
  "symbol,name,summary,alias,type_of_gene,entrezgene,ensembl.gene,genomic_pos,MIM,uniprot.Swiss-Prot";

export async function getGeneFacts(symbol: string): Promise<GeneFacts> {
  const cached = geneCache.get(symbol);
  if (cached) return cached;

  let hit: Record<string, unknown> | undefined;
  try {
    const res = await safeFetch(
      `https://mygene.info/v3/query?q=symbol:${encodeURIComponent(symbol)}&species=human&fields=${GENE_FIELDS}&size=1`,
      { headers: { Accept: "application/json" } },
      12000,
    );
    if (!res.ok) throw new Error(`MyGene ${res.status}`);
    const data = await readJsonBounded<{ hits?: Record<string, unknown>[] }>(res);
    hit = data.hits?.[0];
  } catch {
    throw new FactsError(
      "Gene database is unreachable right now. Please try again in a moment.",
      502,
    );
  }

  if (!hit) {
    throw new FactsError(
      `No human gene found for “${symbol}”. Try an official symbol like BRCA1, TP53, or CFTR.`,
      404,
    );
  }

  const aliases = Array.isArray(hit.alias)
    ? (hit.alias as string[]).slice(0, 8)
    : hit.alias
      ? [String(hit.alias)]
      : [];
  const pos = first(hit.genomic_pos as Record<string, unknown> | Record<string, unknown>[]);
  const location = pos
    ? `chr${pos.chr}:${Number(pos.start).toLocaleString()}–${Number(pos.end).toLocaleString()}${
        pos.strand === -1 || pos.strand === "-1" ? " (−)" : " (+)"
      }`
    : "";

  const entrez = hit.entrezgene as number | string | undefined;
  const ensembl = first(hit.ensembl as { gene?: string } | { gene?: string }[])?.gene;
  const uniprot = first(
    hit.uniprot ? (hit.uniprot as { "Swiss-Prot"?: string | string[] })["Swiss-Prot"] : undefined,
  );
  const mim = hit.MIM as string | number | undefined;

  const sources: Source[] = [];
  if (entrez) sources.push({ label: "NCBI Gene", url: `https://www.ncbi.nlm.nih.gov/gene/${entrez}` });
  if (ensembl)
    sources.push({
      label: "Ensembl",
      url: `https://www.ensembl.org/Homo_sapiens/Gene/Summary?g=${ensembl}`,
    });
  if (uniprot) sources.push({ label: "UniProt", url: `https://www.uniprot.org/uniprotkb/${uniprot}` });
  if (mim) sources.push({ label: "OMIM", url: `https://www.omim.org/entry/${mim}` });
  sources.push({
    label: "GeneCards",
    url: `https://www.genecards.org/cgi-bin/carddisp.pl?gene=${symbol}`,
  });

  const facts: GeneFacts = {
    kind: "gene",
    symbol,
    name: (hit.name as string) || "",
    type: (hit.type_of_gene as string) || "",
    summary: (hit.summary as string) || "",
    aliases,
    location,
    uniprot: uniprot ?? null,
    sources,
    retrievedAt: new Date().toISOString(),
  };
  geneCache.set(symbol, facts);
  return facts;
}

// ------------------------------------------------------------- variant

export function normalizeRsid(raw: string): string {
  const trimmed = raw.trim();
  if (!/^rs\d{1,12}$/i.test(trimmed)) {
    throw new FactsError(
      "Enter a valid dbSNP rsID — 'rs' followed by digits (e.g. rs6025, rs334).",
      400,
    );
  }
  return trimmed.toLowerCase();
}

const CONSEQUENTIAL = new Set([
  "missense_variant",
  "stop_gained",
  "stop_lost",
  "start_lost",
  "frameshift_variant",
  "splice_acceptor_variant",
  "splice_donor_variant",
  "inframe_deletion",
  "inframe_insertion",
]);

const VARIANT_FIELDS =
  "clinvar,dbsnp.rsid,dbsnp.gene.symbol,dbsnp.chrom,dbsnp.vartype,gnomad_genome.af.af,snpeff.ann";

// Pick a clean, informative protein change from ClinVar's HGVS list — a real amino-acid
// substitution (p.Arg534Gln), skipping blanks and synonymous "p.Xxx534=" style entries.
function pickProtein(proteins: string[]): string {
  const cleaned = proteins
    .map((p) => (p.includes(":") ? p.split(":").pop()! : p).trim())
    .filter((p) => p.startsWith("p.") && !p.endsWith("=") && !/\d+=$/.test(p));
  const substitution = cleaned.find((p) => /^p\.[A-Za-z]{3}\d+[A-Za-z]{3}$/.test(p));
  return substitution || cleaned[0] || "";
}

// Derive a molecular consequence from a protein change when snpEff has none reliable.
function consequenceFromProtein(p: string): string {
  const m = /^p\.([A-Za-z]{3})\d+([A-Za-z]{3}|Ter|\*)$/.exec(p);
  if (!m) return "";
  if (m[2] === "Ter" || m[2] === "*") return "stop gained";
  return m[1].toLowerCase() === m[2].toLowerCase() ? "synonymous variant" : "missense variant";
}

async function queryMyVariant(q: string): Promise<Record<string, unknown>[]> {
  const res = await safeFetch(
    `https://myvariant.info/v1/query?q=${encodeURIComponent(q)}&fields=${VARIANT_FIELDS}&size=10`,
    { headers: { Accept: "application/json" } },
    12000,
  );
  if (!res.ok) throw new Error(`MyVariant ${res.status}`);
  const data = await readJsonBounded<{ hits?: Record<string, unknown>[] }>(res);
  return data.hits ?? [];
}

// Rank a candidate MyVariant document by its most-severe RCV — used only to PICK which document
// to display when an rsID maps to several (per alt allele), NOT to collapse the final result.
function docSeverity(hit: Record<string, unknown>): number {
  const cv = (hit.clinvar as Record<string, unknown>) || {};
  const ranks = asList(cv.rcv as unknown).map(
    (r) => classifySignificance((r as { clinical_significance?: string })?.clinical_significance).rank,
  );
  return ranks.length ? Math.min(...ranks) : 99;
}

export async function getVariantFacts(rsid: string): Promise<VariantFacts> {
  const cached = variantCache.get(rsid);
  if (cached) return cached;

  // Prefer ClinVar-annotated documents; fall back to dbSNP for basic facts.
  let hit: Record<string, unknown> | undefined;
  let hasClinvar = false;
  try {
    const clinHits = await queryMyVariant(`clinvar.rsid:${rsid}`);
    if (clinHits.length) {
      hit = [...clinHits].sort((a, b) => docSeverity(a) - docSeverity(b))[0];
      hasClinvar = true;
    } else {
      const dbHits = await queryMyVariant(`dbsnp.rsid:${rsid}`);
      hit = dbHits[0];
    }
  } catch {
    throw new FactsError(
      "Variant database is unreachable right now. Please try again in a moment.",
      502,
    );
  }

  if (!hit) {
    throw new FactsError(
      `No variant found for “${rsid}”. Check the rsID (e.g. rs6025) and try again.`,
      404,
    );
  }

  const cv = (hit.clinvar as Record<string, unknown>) || {};
  const dbsnp = (hit.dbsnp as Record<string, unknown>) || {};

  // Per-condition, per-origin ClinVar classifications — NO single "most severe" verdict.
  const conditionClassifications = buildConditionClassifications(cv.rcv);
  // The distinct significance labels present (severity-sorted) — for an honest "varies by
  // condition" summary line, never presented as one overall verdict.
  const distinctSignificances = [
    ...new Map(conditionClassifications.map((c) => [c.significance, c.significanceRank])).entries(),
  ]
    .sort((a, b) => a[1] - b[1])
    .map(([label]) => label);

  // snpEff annotation — used only as a fallback; ClinVar's own HGVS is preferred below.
  const anns = asList((hit.snpeff as { ann?: unknown })?.ann) as {
    genename?: string;
    effect?: string;
    hgvs_p?: string;
  }[];
  const snpeffAnn = anns.find((a) => a.effect && CONSEQUENTIAL.has(a.effect));

  const gene =
    (dbsnp.gene as { symbol?: string })?.symbol ||
    (cv.gene as { symbol?: string })?.symbol ||
    anns[0]?.genename ||
    "";

  // Prefer ClinVar's authoritative HGVS/type over snpEff (which can be transcript-skewed).
  const clinvarProtein = pickProtein(asList((cv.hgvs as { protein?: unknown })?.protein) as string[]);
  const proteinChange = clinvarProtein || snpeffAnn?.hgvs_p || "";
  const consequence =
    consequenceFromProtein(proteinChange) ||
    (snpeffAnn?.effect ? snpeffAnn.effect.replace(/_/g, " ") : "");
  const preferredName = asList(cv.rcv as unknown)
    .map((r) => (r as { preferred_name?: string })?.preferred_name)
    .find(Boolean) as string | undefined;
  const variantId = cv.variant_id as number | string | undefined;

  // The MyVariant _id is GRCh37/hg19 (e.g. "chr1:g.169519049C>T"); ClinVar carries the hg38
  // coordinates separately. Prefer hg38 (current standard) and label the assembly honestly.
  const hgvsId = (hit._id as string) || "";
  const snv = /^chr([\dXYM]+):g\.(\d+)([ACGT]+)>([ACGT]+)$/i.exec(hgvsId);
  const ref = snv?.[3] || "";
  const alt = snv?.[4] || ""; // SNV alleles are assembly-independent
  const hg38 = cv.hg38 as { start?: number } | undefined;
  const chrom = String((cv.chrom as string) || snv?.[1] || (dbsnp.chrom as string | number) || "");
  const position = typeof hg38?.start === "number" ? hg38.start : snv?.[2] ? Number(snv[2]) : null;
  const assembly = typeof hg38?.start === "number" ? "GRCh38" : snv ? "GRCh37" : "";
  const gnomad = hit.gnomad_genome as { af?: { af?: number } } | undefined;

  const sources: Source[] = [{ label: "dbSNP", url: `https://www.ncbi.nlm.nih.gov/snp/${rsid}` }];
  if (variantId)
    sources.push({
      label: "ClinVar",
      url: `https://www.ncbi.nlm.nih.gov/clinvar/variation/${variantId}/`,
    });
  sources.push({
    label: "Ensembl",
    url: `https://www.ensembl.org/Homo_sapiens/Variation/Explore?v=${rsid}`,
  });
  // gnomAD v4 is GRCh38, so only link when we have hg38 coordinates to avoid pointing at the
  // wrong position.
  if (assembly === "GRCh38" && chrom && position && ref && alt)
    sources.push({
      label: "gnomAD",
      url: `https://gnomad.broadinstitute.org/variant/${chrom}-${position}-${ref}-${alt}?dataset=gnomad_r4`,
    });

  const facts: VariantFacts = {
    kind: "variant",
    rsid,
    gene,
    consequence,
    proteinChange,
    variantType: (cv.type as string) || (dbsnp.vartype as string) || "",
    preferredName: preferredName ?? null,
    chrom,
    position,
    refAlt: snv ? `${ref}>${alt}` : "",
    assembly,
    conditionClassifications,
    distinctSignificances,
    hasSomatic: conditionClassifications.some((c) => c.origin === "somatic"),
    hasGermline: conditionClassifications.some((c) => c.origin === "germline"),
    gnomadAf: typeof gnomad?.af?.af === "number" ? gnomad.af.af : null,
    hasClinvar,
    hgvsId,
    variantId: variantId ?? null,
    sources,
    retrievedAt: new Date().toISOString(),
  };
  variantCache.set(rsid, facts);
  return facts;
}
