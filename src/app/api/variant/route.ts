// Genclarus — variant (rsID) lookup API.
// Flow: validate rsID -> MyVariant.info (ClinVar/dbSNP/gnomAD facts) -> NVIDIA NIM
// (grounded synthesis) -> JSON. Runs server-side only; the NIM key never reaches the client.

import { synthesize } from "@/lib/nim";
import { safeFetch, readJsonBounded } from "@/lib/http";
import { readJsonBody, extractSingleField, RequestValidationError, jsonError } from "@/lib/request";
import { PROMPT_VERSION, MODEL_ID, OUTPUT_SCHEMA_VERSION } from "@/lib/version";

export const dynamic = "force-dynamic";

// Variants carry clinical weight — the disclaimer is deliberately stronger than the gene one.
const DISCLAIMER =
  "Educational information only — not medical advice, a diagnosis, or a clinical interpretation. A variant's significance can be uncertain, conflicting, or dependent on your full clinical and family context. Consult a qualified genetics professional or genetic counselor before drawing any conclusion.";

type Source = { label: string; url: string };

function asList<T>(v: T | T[] | undefined | null): T[] {
  return Array.isArray(v) ? v : v == null ? [] : [v];
}

// Normalise ClinVar's messy composite significance strings into a label + severity rank.
// Order matters: "conflicting" and "likely pathogenic" are checked before "pathogenic"
// so the substring "pathogenic" inside them is not misread as top severity.
function classify(raw: string | undefined): { label: string; rank: number } {
  const s = (raw || "").toLowerCase();
  if (!s) return { label: "Not provided", rank: 9 };
  if (s.includes("conflicting")) return { label: "Conflicting interpretations", rank: 5 };
  if (s.includes("likely pathogenic")) return { label: "Likely pathogenic", rank: 1 };
  if (s.includes("pathogenic")) return { label: "Pathogenic", rank: 0 };
  if (s.includes("risk factor")) return { label: "Risk factor", rank: 3 };
  if (s.includes("drug response")) return { label: "Drug response", rank: 4 };
  if (s.includes("uncertain")) return { label: "Uncertain significance", rank: 6 };
  if (s.includes("likely benign")) return { label: "Likely benign", rank: 7 };
  if (s.includes("benign")) return { label: "Benign", rank: 8 };
  if (s.includes("protective")) return { label: "Protective", rank: 4 };
  return { label: raw!.slice(0, 40), rank: 9 };
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

function docSeverity(hit: Record<string, unknown>): number {
  const cv = (hit.clinvar as Record<string, unknown>) || {};
  const ranks = asList(cv.rcv as unknown).map(
    (r) => classify((r as { clinical_significance?: string })?.clinical_significance).rank,
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

  // Aggregate unique significances (most severe first) and associated conditions.
  const labelRank = new Map<string, number>();
  const conditions = new Set<string>();
  for (const r of asList(cv.rcv as unknown)) {
    const rec = r as { clinical_significance?: string; conditions?: unknown };
    const { label, rank } = classify(rec.clinical_significance);
    labelRank.set(label, Math.min(rank, labelRank.get(label) ?? 99));
    for (const c of asList(rec.conditions)) {
      const name = (c as { name?: string })?.name;
      if (name && !["not provided", "not specified", "see cases"].includes(name.toLowerCase())) {
        conditions.add(name);
      }
    }
  }
  const ranked = [...labelRank.entries()].sort((a, b) => a[1] - b[1]);
  const significances = ranked.map(([l]) => l);
  const primarySignificance = ranked[0]?.[0] ?? null;
  const significanceRank = ranked[0]?.[1] ?? null;
  const conditionList = [...conditions].sort().slice(0, 6);

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

  // Parse genomic coordinates from the MyVariant _id (e.g. "chr1:g.169519049C>T").
  const hgvsId = (hit._id as string) || "";
  const snv = /^chr([\dXYM]+):g\.(\d+)([ACGT]+)>([ACGT]+)$/i.exec(hgvsId);
  const chrom = snv?.[1] || String((dbsnp.chrom as string | number) ?? "");
  const refAlt = snv ? `${snv[3]}>${snv[4]}` : "";
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
  if (snv)
    sources.push({
      label: "gnomAD",
      url: `https://gnomad.broadinstitute.org/variant/${snv[1]}-${snv[2]}-${snv[3]}-${snv[4]}?dataset=gnomad_r4`,
    });

  // 2) NIM synthesis — grounded strictly in the facts above.
  const facts = JSON.stringify({
    rsid,
    gene,
    variantType,
    consequence,
    proteinChange,
    significances,
    conditions: conditionList,
    gnomadAlleleFrequency: gnomadAf,
    hasClinvar,
  });
  const { explanation, aiUnavailable } = await synthesize([
    {
      role: "system",
      content:
        "You are a careful science communicator explaining human genetic variants to curious non-specialists. Use ONLY the provided facts. Never invent conditions, significance classifications, frequencies, or clinical claims. Never give personal medical advice, diagnosis, or risk interpretation for an individual. When multiple or conflicting classifications exist, say so plainly and explain that significance depends on context. detailed thinking off",
    },
    {
      role: "user",
      content:
        `Explain the human variant ${rsid}${gene ? ` in the ${gene} gene` : ""} for a curious non-specialist, using only these facts:\n\n${facts}\n\n` +
        "Write exactly three short markdown sections with these headers:\n## What this variant is\n## Clinical significance\n## Key facts\n" +
        "In 'Clinical significance', explain what the ClinVar classification(s) mean in general educational terms, note if interpretations vary or are uncertain, and do NOT tell the reader what it means for them personally. " +
        "Keep it under ~180 words total. If clinical data is limited, say so.",
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
    refAlt,
    primarySignificance,
    significanceRank,
    significances,
    conditions: conditionList,
    gnomadAf,
    hasClinvar,
    hgvsId,
    variantId: variantId ?? null,
    explanation,
    aiUnavailable,
    sources,
    disclaimer: DISCLAIMER,
    meta: { promptVersion: PROMPT_VERSION, modelId: MODEL_ID, schemaVersion: OUTPUT_SCHEMA_VERSION },
  });
}
