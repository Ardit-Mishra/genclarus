// Genclarus — gene lookup API.
// Flow: validate symbol -> MyGene.info (facts) -> NVIDIA NIM (grounded synthesis) -> JSON.
// Runs server-side only; the NIM key never reaches the client.

import { synthesize } from "@/lib/nim";
import { safeFetch, readJsonBounded } from "@/lib/http";
import { readJsonBody, extractSingleField, RequestValidationError, jsonError } from "@/lib/request";
import { PROMPT_VERSION, MODEL_ID, OUTPUT_SCHEMA_VERSION } from "@/lib/version";

export const dynamic = "force-dynamic";

const DISCLAIMER =
  "Educational information only — not medical advice, diagnosis, or a substitute for a healthcare professional or genetic counselor.";

type Source = { label: string; url: string };

function first<T>(v: T | T[] | undefined | null): T | undefined {
  return Array.isArray(v) ? v[0] : v ?? undefined;
}

export async function POST(request: Request) {
  let raw: string;
  try {
    const body = await readJsonBody(request);
    raw = extractSingleField(body, "gene");
  } catch (err) {
    if (err instanceof RequestValidationError) return jsonError(err.status, err.message);
    return jsonError(400, "Invalid request.");
  }

  if (!/^[A-Za-z0-9][A-Za-z0-9\-]{0,19}$/.test(raw.trim())) {
    return jsonError(400, "Enter a valid gene symbol — letters, numbers, or hyphens (e.g. BRCA1).");
  }
  const symbol = raw.trim().toUpperCase();

  // 1) MyGene.info — free, no key.
  const fields =
    "symbol,name,summary,alias,type_of_gene,entrezgene,ensembl.gene,genomic_pos,MIM,uniprot.Swiss-Prot";
  let hit: Record<string, unknown> | undefined;
  try {
    const res = await safeFetch(
      `https://mygene.info/v3/query?q=symbol:${encodeURIComponent(symbol)}&species=human&fields=${fields}&size=1`,
      { headers: { Accept: "application/json" } },
      12000,
    );
    if (!res.ok) throw new Error(`MyGene ${res.status}`);
    const data = await readJsonBounded<{ hits?: Record<string, unknown>[] }>(res);
    hit = data.hits?.[0];
  } catch {
    return jsonError(502, "Gene database is unreachable right now. Please try again in a moment.");
  }

  if (!hit) {
    return jsonError(404, `No human gene found for “${symbol}”. Try an official symbol like BRCA1, TP53, or CFTR.`);
  }

  const name = (hit.name as string) || "";
  const summary = (hit.summary as string) || "";
  const aliases = Array.isArray(hit.alias)
    ? (hit.alias as string[]).slice(0, 8)
    : hit.alias
      ? [String(hit.alias)]
      : [];
  const type = (hit.type_of_gene as string) || "";
  const pos = first(hit.genomic_pos as Record<string, unknown> | Record<string, unknown>[]);
  const location = pos
    ? `chr${pos.chr}:${Number(pos.start).toLocaleString()}–${Number(pos.end).toLocaleString()}${
        pos.strand === -1 || pos.strand === "-1" ? " (−)" : " (+)"
      }`
    : "";

  const entrez = hit.entrezgene as number | string | undefined;
  const ensembl = first(hit.ensembl as { gene?: string } | { gene?: string }[])?.gene;
  const uniprot = first(hit.uniprot ? (hit.uniprot as { "Swiss-Prot"?: string | string[] })["Swiss-Prot"] : undefined);
  const mim = hit.MIM as string | number | undefined;

  const sources: Source[] = [];
  if (entrez) sources.push({ label: "NCBI Gene", url: `https://www.ncbi.nlm.nih.gov/gene/${entrez}` });
  if (ensembl) sources.push({ label: "Ensembl", url: `https://www.ensembl.org/Homo_sapiens/Gene/Summary?g=${ensembl}` });
  if (uniprot) sources.push({ label: "UniProt", url: `https://www.uniprot.org/uniprotkb/${uniprot}` });
  if (mim) sources.push({ label: "OMIM", url: `https://www.omim.org/entry/${mim}` });
  sources.push({ label: "GeneCards", url: `https://www.genecards.org/cgi-bin/carddisp.pl?gene=${symbol}` });

  // 2) NIM synthesis — grounded strictly in the facts above.
  const facts = JSON.stringify({ symbol, name, type, summary, aliases, location });
  const { explanation, aiUnavailable } = await synthesize([
    {
      role: "system",
      content:
        "You are a careful science communicator explaining human genes to curious non-specialists. Use ONLY the provided facts. Never invent gene functions, disease associations, numbers, or clinical claims. Do not give medical advice or diagnostic interpretation. detailed thinking off",
    },
    {
      role: "user",
      content:
        `Explain the human gene ${symbol}${name ? ` (${name})` : ""} for a curious non-specialist, using only these facts:\n\n${facts}\n\n` +
        "Write exactly three short markdown sections with these headers:\n## What it does\n## Why it matters\n## Key facts\n" +
        "Keep it under ~170 words total. If the summary is empty, say only what the name and gene type support, and note that detailed curated summary data is limited for this gene.",
    },
  ]);

  return Response.json({
    symbol,
    name,
    type,
    summary,
    aliases,
    location,
    uniprot: uniprot ?? null,
    explanation,
    aiUnavailable,
    sources,
    disclaimer: DISCLAIMER,
    // Source-record provenance: what was retrieved, when — so a result can be reproduced and
    // stale facts are visible rather than implied to be current.
    retrievedAt: new Date().toISOString(),
    meta: { promptVersion: PROMPT_VERSION, modelId: MODEL_ID, schemaVersion: OUTPUT_SCHEMA_VERSION },
  });
}
