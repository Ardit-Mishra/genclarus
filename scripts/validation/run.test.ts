import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getGeneFacts, getVariantFacts, type GeneFacts, type VariantFacts } from "../../src/lib/facts";
import { readJsonBounded, safeFetch } from "../../src/lib/http";
import { matrix, type MatrixCase } from "./matrix";

const GENE_FIELDS = "symbol,name,summary,alias,type_of_gene,entrezgene,ensembl.gene,genomic_pos,MIM,uniprot.Swiss-Prot";
const VARIANT_FIELDS = "clinvar,dbsnp.rsid,dbsnp.gene.symbol,dbsnp.chrom,dbsnp.vartype,gnomad_genome.af.af,snpeff.ann";
type Raw = Record<string, unknown>;
type Severity = "info" | "suspected-defect";
type Discrepancy = { severity: Severity; field: string; derived: unknown; raw: unknown; detail: string };
type Provenance = { source: string; url: string; accession: string | number | null; retrievedAt: string; sha256: string };
type CaseReport = { id: string; kind: MatrixCase["kind"]; why: string; expected?: string; status: "PASS" | "DISCREPANCIES" | "ERROR"; discrepancies: Discrepancy[]; provenance: Provenance[]; error?: string };

const asList = <T>(value: T | T[] | null | undefined): T[] => Array.isArray(value) ? value : value == null ? [] : [value];
const first = <T>(value: T | T[] | null | undefined): T | undefined => Array.isArray(value) ? value[0] : value ?? undefined;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const valueText = (value: unknown) => value === undefined ? "undefined" : JSON.stringify(value);
function errorText(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause as { name?: unknown; message?: unknown; code?: unknown; address?: unknown; port?: unknown } | undefined;
  return [error.message, cause?.name, cause?.message, cause?.code, cause?.address, cause?.port]
    .filter((part) => part !== undefined && part !== null && part !== "")
    .join("; ");
}

async function rawJson(url: string): Promise<{ data: Raw; provenance: Provenance }> {
  const res = await safeFetch(url, { headers: { Accept: "application/json" } }, 12_000);
  if (!res.ok) throw new Error(`${new URL(url).hostname} returned HTTP ${res.status}`);
  const data = await readJsonBounded<Raw>(res);
  return { data, provenance: { source: new URL(url).hostname, url, accession: null, retrievedAt: new Date().toISOString(), sha256: hash(data) } };
}

function label(raw: unknown): string {
  const s = String(raw ?? "").toLowerCase();
  if (!s) return "Not provided";
  if (s.includes("conflicting")) return "Conflicting interpretations";
  if (s.includes("likely pathogenic")) return "Likely pathogenic";
  if (s.includes("pathogenic")) return "Pathogenic";
  if (s.includes("risk factor")) return "Risk factor";
  if (s.includes("drug response")) return "Drug response";
  if (s.includes("uncertain")) return "Uncertain significance";
  if (s.includes("likely benign")) return "Likely benign";
  if (s.includes("benign")) return "Benign";
  if (s.includes("protective")) return "Protective";
  return String(raw).slice(0, 40);
}
function stars(raw: unknown): number {
  const s = String(raw ?? "").toLowerCase();
  if (s.includes("practice guideline")) return 4;
  if (s.includes("expert panel")) return 3;
  if (s.includes("no assertion") || s.includes("no classification")) return 0;
  if (s.includes("multiple submitters") && s.includes("no conflict")) return 2;
  if (s.includes("conflicting interpretations") || s.includes("criteria provided")) return 1;
  return 0;
}
function rank(raw: unknown): number { return ["Pathogenic", "Likely pathogenic", "Risk factor", "Drug response", "Protective", "Conflicting interpretations", "Uncertain significance", "Likely benign", "Benign", "Not provided"].indexOf(label(raw)); }
function chosenVariant(hits: Raw[]): Raw | undefined {
  return [...hits].sort((a, b) => {
    const aRanks = asList((a.clinvar as Raw | undefined)?.rcv).map((r) => rank((r as Raw).clinical_significance));
    const bRanks = asList((b.clinvar as Raw | undefined)?.rcv).map((r) => rank((r as Raw).clinical_significance));
    return (aRanks.length ? Math.min(...aRanks) : 99) - (bRanks.length ? Math.min(...bRanks) : 99);
  })[0];
}
function add(items: Discrepancy[], field: string, derived: unknown, raw: unknown, detail: string, severity: Severity = "suspected-defect") {
  if (JSON.stringify(derived) !== JSON.stringify(raw)) items.push({ severity, field, derived, raw, detail });
}
function geneRaw(hit: Raw, field: string): unknown { return hit[field]; }
function rawGeneLocation(hit: Raw): string {
  const pos = first(hit.genomic_pos as Raw | Raw[] | undefined);
  return pos ? `chr${pos.chr}:${Number(pos.start).toLocaleString()}–${Number(pos.end).toLocaleString()}${pos.strand === -1 || pos.strand === "-1" ? " (−)" : " (+)"}` : "";
}
function rawUniprot(hit: Raw): string | null { return first((hit.uniprot as Raw | undefined)?.["Swiss-Prot"] as string | string[] | undefined) ?? null; }

async function validateGene(item: MatrixCase): Promise<CaseReport> {
  const url = `https://mygene.info/v3/query?q=symbol:${encodeURIComponent(item.id)}&species=human&fields=${GENE_FIELDS}&size=1`;
  const [{ data, provenance }, derived] = await Promise.all([rawJson(url), getGeneFacts(item.id)]);
  const hit = asList(data.hits as Raw[] | undefined)[0];
  if (!hit) throw new Error("MyGene returned no hit while app returned facts");
  provenance.accession = (hit.entrezgene as string | number | undefined) ?? (hit._id as string | undefined) ?? null;
  const d: Discrepancy[] = [];
  add(d, "symbol", derived.symbol, hit.symbol ?? "", "Derived symbol must match the selected MyGene hit.");
  add(d, "name", derived.name, hit.name ?? "", "Derived name must match MyGene.");
  add(d, "type", derived.type, hit.type_of_gene ?? "", "Derived gene type must match MyGene.");
  add(d, "summary", derived.summary, hit.summary ?? "", "Derived summary must match MyGene.");
  add(d, "aliases", derived.aliases, asList(hit.alias as string | string[] | undefined).slice(0, 8), "Aliases are intentionally capped at eight.");
  add(d, "location", derived.location, rawGeneLocation(hit), "Location must preserve MyGene coordinates and strand.");
  add(d, "uniprot", derived.uniprot, rawUniprot(hit), "Swiss-Prot accession must match MyGene.");
  return { ...item, status: d.length ? "DISCREPANCIES" : "PASS", discrepancies: d, provenance: [provenance] };
}

function rawConditions(hit: Raw) {
  const cv = (hit.clinvar as Raw | undefined) ?? {};
  const rows = new Map<string, Raw>();
  for (const r of asList(cv.rcv as Raw | Raw[] | undefined)) for (const c of asList((r as Raw).conditions as Raw | Raw[] | undefined)) {
    const condition = String((c as Raw).name ?? "").trim(); if (!condition) continue;
    const origin = String((r as Raw).origin ?? "unknown").toLowerCase(); const significance = label((r as Raw).clinical_significance);
    const key = `${condition.toLowerCase()}|${origin}|${significance}`; const current = rows.get(key);
    if (!current || stars((r as Raw).review_status) > stars(current.review_status) || (stars((r as Raw).review_status) === stars(current.review_status) && String((r as Raw).last_evaluated ?? "") > String(current.last_evaluated ?? ""))) rows.set(key, { condition, origin, significance, rawSignificance: String((r as Raw).clinical_significance ?? ""), reviewStatus: String((r as Raw).review_status ?? ""), reviewStars: stars((r as Raw).review_status), lastEvaluated: (r as Raw).last_evaluated ?? null });
  }
  return [...rows.values()];
}
function expectedProtein(hit: Raw): string {
  const proteins = asList(((hit.clinvar as Raw | undefined)?.hgvs as Raw | undefined)?.protein as string | string[] | undefined);
  const clean = proteins.map((p) => p.includes(":") ? p.split(":").pop()!.trim() : p.trim()).filter((p) => p.startsWith("p.") && !p.endsWith("=") && !/\d+=$/.test(p));
  return clean.find((p) => /^p\.[A-Za-z]{3}\d+[A-Za-z]{3}$/.test(p)) ?? clean[0] ?? "";
}
async function validateVariant(item: MatrixCase): Promise<CaseReport> {
  const clinUrl = `https://myvariant.info/v1/query?q=${encodeURIComponent(`clinvar.rsid:${item.id}`)}&fields=${VARIANT_FIELDS}&size=10`;
  const rawClin = await rawJson(clinUrl); const clinHits = asList(rawClin.data.hits as Raw[] | undefined);
  let raw = rawClin; let hit = chosenVariant(clinHits); let hasClinvar = Boolean(hit);
  if (!hit) { const dbUrl = `https://myvariant.info/v1/query?q=${encodeURIComponent(`dbsnp.rsid:${item.id}`)}&fields=${VARIANT_FIELDS}&size=10`; raw = await rawJson(dbUrl); hit = asList(raw.data.hits as Raw[] | undefined)[0]; }
  const derived = await getVariantFacts(item.id);
  if (!hit) throw new Error("MyVariant returned no record while app returned facts");
  const cv = (hit.clinvar as Raw | undefined) ?? {}; const db = (hit.dbsnp as Raw | undefined) ?? {};
  raw.provenance.accession = (cv.variant_id as string | number | undefined) ?? (hit._id as string | undefined) ?? null;
  const d: Discrepancy[] = [];
  const rawGene = (first(db.gene as Raw | Raw[] | undefined) as Raw | undefined)?.symbol ?? (cv.gene as Raw | undefined)?.symbol ?? (first((hit.snpeff as Raw | undefined)?.ann as Raw | Raw[] | undefined) as Raw | undefined)?.genename ?? "";
  add(d, "hasClinvar", derived.hasClinvar, hasClinvar, "ClinVar presence must reflect which upstream query supplied the selected document.");
  add(d, "variantId", derived.variantId, (cv.variant_id as string | number | undefined) ?? null, "ClinVar variation ID must not be dropped.");
  add(d, "gene", derived.gene, rawGene, "Gene symbol must come from dbSNP, ClinVar, or snpEff fallback.");
  const expectedRows = rawConditions(hit); const actualRows = derived.conditionClassifications;
  const rawKeys = new Set(expectedRows.map((r) => `${r.condition}|${r.origin}|${r.significance}`)); const actualKeys = new Set(actualRows.map((r) => `${r.condition}|${r.origin}|${r.significance}`));
  const missing = [...rawKeys].filter((key) => !actualKeys.has(key)); const extra = [...actualKeys].filter((key) => !rawKeys.has(key));
  if (missing.length) d.push({ severity: "suspected-defect", field: "conditionClassifications.missing", derived: actualRows.length, raw: missing, detail: "Derived facts dropped one or more distinct raw ClinVar condition/origin/significance rows." });
  if (extra.length) d.push({ severity: "suspected-defect", field: "conditionClassifications.extra", derived: extra, raw: expectedRows.length, detail: "Derived facts contain condition rows not represented by the raw ClinVar record." });
  if (actualRows.length < expectedRows.length) d.push({ severity: "suspected-defect", field: "conditionClassifications.count", derived: actualRows.length, raw: expectedRows.length, detail: "Derived count is lower than raw distinct condition classifications (multi-condition-loss guard)." });
  for (const row of actualRows) { const expected = expectedRows.find((r) => r.condition === row.condition && r.origin === row.origin && r.significance === row.significance); if (expected) { add(d, `classification.${row.condition}.rawSignificance`, row.rawSignificance, expected.rawSignificance, "Significance must preserve the raw ClinVar assertion."); add(d, `classification.${row.condition}.reviewStars`, row.reviewStars, expected.reviewStars, "Review stars must reflect raw ClinVar review status."); } }
  add(d, "hasSomatic", derived.hasSomatic, expectedRows.some((r) => r.origin === "somatic"), "Somatic origin must not be lost."); add(d, "hasGermline", derived.hasGermline, expectedRows.some((r) => r.origin === "germline"), "Germline origin must not be lost.");
  add(d, "proteinChange", derived.proteinChange, expectedProtein(hit) || String((first((hit.snpeff as Raw | undefined)?.ann as Raw | Raw[] | undefined) as Raw | undefined)?.hgvs_p ?? ""), "Protein change must agree with ClinVar HGVS or snpEff fallback.");
  const hgvs = String(hit._id ?? ""); const match = /^chr([\dXYM]+):g\.(\d+)([ACGT]+)>([ACGT]+)$/i.exec(hgvs); const hg38 = cv.hg38 as Raw | undefined;
  add(d, "coordinate", [derived.assembly, derived.chrom, derived.position, derived.refAlt], [typeof hg38?.start === "number" ? "GRCh38" : match ? "GRCh37" : "", String(cv.chrom ?? match?.[1] ?? db.chrom ?? ""), typeof hg38?.start === "number" ? hg38.start : match ? Number(match[2]) : null, match ? `${match[3]}>${match[4]}` : ""], "Assembly, coordinate, and reference/alternate alleles must match the selected raw document.");
  const rawAf = ((hit.gnomad_genome as Raw | undefined)?.af as Raw | undefined)?.af ?? null; add(d, "gnomadAf", derived.gnomadAf, rawAf, "gnomAD allele frequency must match MyVariant.");
  const shouldLink = typeof hg38?.start === "number" && Boolean(match); const hasLink = derived.sources.some((s) => s.label === "gnomAD"); add(d, "gnomadLink", hasLink, shouldLink, "gnomAD link should exist exactly for GRCh38 SNVs with complete alleles.", "info");
  return { ...item, status: d.some((x) => x.severity === "suspected-defect") ? "DISCREPANCIES" : "PASS", discrepancies: d, provenance: [raw.provenance] };
}

function markdown(results: CaseReport[]): string {
  const defects = results.flatMap((r) => r.discrepancies.filter((d) => d.severity === "suspected-defect").map((d) => ({ id: r.id, d }))).sort((a, b) => a.id.localeCompare(b.id));
  const lines = ["# Genclarus biological validation report", "", `Generated: ${new Date().toISOString()}`, "", "## Summary", "", "| Case | Kind | Result | Suspected defects |", "| --- | --- | --- | ---: |", ...results.map((r) => `| ${r.id} | ${r.kind} | ${r.status} | ${r.discrepancies.filter((d) => d.severity === "suspected-defect").length} |`), ""];
  for (const r of results) { lines.push(`## ${r.id} — ${r.status}`, "", `**Coverage:** ${r.why}`, r.expected ? `\n**Known expectation:** ${r.expected}` : "", "", "**Provenance:**", ...r.provenance.map((p) => `- ${p.source}; accession: ${p.accession ?? "n/a"}; retrieved: ${p.retrievedAt}; SHA-256: \`${p.sha256}\``), ""); if (r.error) lines.push(`**Error:** ${r.error}`, ""); if (!r.discrepancies.length && !r.error) lines.push("PASS — no discrepancies detected against the selected raw source record.", ""); for (const x of r.discrepancies) lines.push(`- **${x.severity} — ${x.field}:** ${x.detail}\n  - App: \`${valueText(x.derived)}\`\n  - Raw: \`${valueText(x.raw)}\``); lines.push(""); }
  lines.push("## Suspected defects, ranked", ""); if (!defects.length) lines.push("No suspected defects detected."); else defects.forEach(({ id, d }, i) => lines.push(`${i + 1}. **${id} — ${d.field}**: app returned \`${valueText(d.derived)}\`; raw source said \`${valueText(d.raw)}\`. Likely owner: \`src/lib/facts.ts:getVariantFacts\` or \`src/lib/clinvar.ts:buildConditionClassifications\` (investigate; do not change in this validation phase).`)); return lines.join("\n");
}
export async function runMatrix(): Promise<CaseReport[]> {
  const results: CaseReport[] = [];
  for (const item of matrix) try { results.push(item.kind === "gene" ? await validateGene(item) : await validateVariant(item)); } catch (error) {
    results.push({ ...item, status: "ERROR", discrepancies: [], provenance: [], error: errorText(error) });
  }
  const out = resolve(process.cwd(), "docs", "validation"); await mkdir(out, { recursive: true }); await writeFile(resolve(out, "report.json"), JSON.stringify({ generatedAt: new Date().toISOString(), matrixSize: matrix.length, results }, null, 2) + "\n"); await writeFile(resolve(out, "report.md"), markdown(results)); return results;
}
describe("live biological validation matrix", () => { it("writes a report without aborting per-case failures", async () => { const results = await runMatrix(); expect(results).toHaveLength(matrix.length); }, 300_000); });
