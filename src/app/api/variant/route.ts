// Genclarus — variant (rsID) lookup API.
// Flow: validate rsID -> MyVariant.info (ClinVar/dbSNP/gnomAD facts) -> NVIDIA NIM
// (grounded synthesis) -> JSON. Runs server-side only; the NIM key never reaches the client.

import { synthesize } from "@/lib/nim";
import { safeFetch, readJsonBounded } from "@/lib/http";
import { readJsonBody, extractSingleField, RequestValidationError, jsonError } from "@/lib/request";
import { PROMPT_VERSION, MODEL_ID, OUTPUT_SCHEMA_VERSION } from "@/lib/version";
import { classifySignificance, buildConditionClassifications } from "@/lib/clinvar";

export const dynamic = "force-dynamic";

// Variants carry clinical weight — the disclaimer is deliberately stronger than the gene one.
const DISCLAIMER =
  "Educational information only — not medical advice, a diagnosis, or a clinical interpretation. A variant's significance can be uncertain, conflicting, or dependent on your full clinical and family context. Consult a qualified genetics professional or genetic counselor before drawing any conclusion.";

type Source = { label: string; url: string };

function asList<T>(v: T | T[] | undefined | null): T[] {
  return Array.isArray(v) ? v : v == null ? [] : [v];
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

const FIELDS =
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
    `https://myvariant.info/v1/query?q=${encodeURIComponent(q)}&fields=${FIELDS}&size=10`,
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

export async function POST(request: Request) {
  let raw: string;
  try {
    const body = await readJsonBody(request);
    raw = extractSingleField(body, "rsid");
  } catch (err) {
    if (err instanceof RequestValidationError) return jsonError(err.status, err.message);
    return jsonError(400, "Invalid request.");
  }

  if (!/^rs\d{1,12}$/i.test(raw.trim())) {
    return jsonError(400, "Enter a valid dbSNP rsID — 'rs' followed by digits (e.g. rs6025, rs334).");
  }
  const rsid = raw.trim().toLowerCase();

  // 1) MyVariant.info — prefer ClinVar-annotated documents; fall back to dbSNP for basic facts.
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
    return jsonError(502, "Variant database is unreachable right now. Please try again in a moment.");
  }

  if (!hit) {
    return jsonError(404, `No variant found for “${rsid}”. Check the rsID (e.g. rs6025) and try again.`);
  }

  const cv = (hit.clinvar as Record<string, unknown>) || {};
  const dbsnp = (hit.dbsnp as Record<string, unknown>) || {};

  // Per-condition, per-origin ClinVar classifications — NO single "most severe" verdict.
  const conditionClassifications = buildConditionClassifications(cv.rcv);
  // The distinct significance labels present (severity-sorted) — for an honest "varies by
  // condition" summary line, never presented as one overall verdict.
  const distinctSignificances = [
    ...new Map(
      conditionClassifications.map((c) => [c.significance, c.significanceRank]),
    ).entries(),
  ]
    .sort((a, b) => a[1] - b[1])
    .map(([label]) => label);
  const hasSomatic = conditionClassifications.some((c) => c.origin === "somatic");
  const hasGermline = conditionClassifications.some((c) => c.origin === "germline");

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
  const variantType = (cv.type as string) || (dbsnp.vartype as string) || "";
  const preferredName = asList((cv.rcv as unknown))
    .map((r) => (r as { preferred_name?: string })?.preferred_name)
    .find(Boolean) as string | undefined;
  const variantId = cv.variant_id as number | string | undefined;

  // The MyVariant _id is GRCh37/hg19 (e.g. "chr1:g.169519049C>T"); ClinVar carries the hg38
  // coordinates separately. Prefer hg38 (current standard) and label the assembly honestly.
  const hgvsId = (hit._id as string) || "";
  const snv = /^chr([\dXYM]+):g\.(\d+)([ACGT]+)>([ACGT]+)$/i.exec(hgvsId);
  const ref = snv?.[3] || "";
  const alt = snv?.[4] || ""; // SNV alleles are assembly-independent
  const refAlt = snv ? `${ref}>${alt}` : "";
  const hg38 = cv.hg38 as { start?: number } | undefined;
  const chrom = String((cv.chrom as string) || snv?.[1] || (dbsnp.chrom as string | number) || "");
  const position =
    typeof hg38?.start === "number" ? hg38.start : snv?.[2] ? Number(snv[2]) : null;
  const assembly = typeof hg38?.start === "number" ? "GRCh38" : snv ? "GRCh37" : "";
  const gnomad = hit.gnomad_genome as { af?: { af?: number } } | undefined;
  const gnomadAf = typeof gnomad?.af?.af === "number" ? gnomad.af.af : null;

  const sources: Source[] = [
    { label: "dbSNP", url: `https://www.ncbi.nlm.nih.gov/snp/${rsid}` },
  ];
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

  // 2) NIM synthesis — grounded strictly in the facts above (classifications kept PER CONDITION).
  const facts = JSON.stringify({
    rsid,
    gene,
    variantType,
    consequence,
    proteinChange,
    clinvarByCondition: conditionClassifications.slice(0, 8).map((c) => ({
      condition: c.condition,
      significance: c.significance,
      reviewStars: c.reviewStars,
      origin: c.origin,
    })),
    gnomadAlleleFrequency: gnomadAf,
    hasClinvar,
  });
  const { explanation, aiUnavailable } = await synthesize([
    {
      role: "system",
      content:
        "You are a careful science communicator explaining human genetic variants to curious non-specialists. Use ONLY the provided facts. Never invent conditions, significance classifications, frequencies, or clinical claims. Never give personal medical advice, diagnosis, or risk interpretation for an individual. ClinVar classifications are PER CONDITION — a variant can be pathogenic for one condition and benign or uncertain for another, and germline vs somatic differ; never merge them into a single overall verdict. When interpretations vary or conflict, say so plainly. detailed thinking off",
    },
    {
      role: "user",
      content:
        `Explain the human variant ${rsid}${gene ? ` in the ${gene} gene` : ""} for a curious non-specialist, using only these facts:\n\n${facts}\n\n` +
        "Write exactly three short markdown sections with these headers:\n## What this variant is\n## Clinical significance\n## Key facts\n" +
        "In 'Clinical significance', explain that ClinVar classifications are given per condition, summarize how they vary across the listed conditions in general educational terms, note review confidence and any conflict/uncertainty, and do NOT tell the reader what it means for them personally. " +
        "Keep it under ~190 words total. If clinical data is limited, say so.",
    },
  ]);

  return Response.json({
    kind: "variant",
    rsid,
    gene,
    consequence,
    proteinChange,
    variantType,
    preferredName: preferredName ?? null,
    chrom,
    position,
    refAlt,
    assembly,
    // Per-condition classifications — the honest replacement for a single "most severe" badge.
    conditionClassifications,
    distinctSignificances,
    hasSomatic,
    hasGermline,
    gnomadAf,
    hasClinvar,
    hgvsId,
    variantId: variantId ?? null,
    explanation,
    aiUnavailable,
    sources,
    disclaimer: DISCLAIMER,
    retrievedAt: new Date().toISOString(),
    meta: { promptVersion: PROMPT_VERSION, modelId: MODEL_ID, schemaVersion: OUTPUT_SCHEMA_VERSION },
  });
}
