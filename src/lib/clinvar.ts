// ClinVar interpretation (Phase 1 rewrite).
// Normalizes significance strings, maps review status to the ClinVar 0-4 "star" scale, and builds
// PER-CONDITION, PER-ORIGIN classifications. Deliberately NO "most severe overall" aggregation — a
// variant can be classified differently for different conditions, so one badge would misrepresent it.

export type ConditionClassification = {
  condition: string;
  significance: string; // normalized label
  rawSignificance: string; // original ClinVar string
  significanceRank: number; // lower = more severe (for sorting/badge colour)
  reviewStatus: string; // ClinVar wording, verbatim
  reviewStars: number; // 0-4
  origin: string; // germline | somatic | unknown | ...
  lastEvaluated: string | null;
};

// Normalise ClinVar's messy composite significance strings into a label + severity rank.
// Order matters: "conflicting" and "likely pathogenic" are checked before "pathogenic" so the
// substring "pathogenic" inside them is not misread as top severity.
export function classifySignificance(raw: string | undefined | null): {
  label: string;
  rank: number;
} {
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

// Map ClinVar's review-status wording to its 0-4 gold-star scale.
export function reviewStars(reviewStatus: string | undefined | null): number {
  const s = (reviewStatus || "").toLowerCase();
  if (s.includes("practice guideline")) return 4;
  if (s.includes("expert panel")) return 3;
  // Check "no assertion / no classification" BEFORE "criteria provided": the string
  // "no assertion criteria provided" contains "criteria provided" but is a 0-star status.
  if (s.includes("no assertion") || s.includes("no classification")) return 0;
  if (s.includes("multiple submitters") && s.includes("no conflict")) return 2;
  if (s.includes("conflicting interpretations")) return 1;
  if (s.includes("criteria provided")) return 1; // single submitter
  return 0;
}

const UNINFORMATIVE_CONDITIONS = new Set([
  "not provided",
  "not specified",
  "see cases",
  "not applicable",
]);

function asList<T>(v: T | T[] | undefined | null): T[] {
  return Array.isArray(v) ? v : v == null ? [] : [v];
}

function conditionName(conditions: unknown): string {
  const c = asList(conditions)[0] as { name?: string } | undefined;
  return c?.name?.trim() || "";
}

type Rcv = {
  clinical_significance?: string;
  review_status?: string;
  origin?: string;
  last_evaluated?: string;
  conditions?: unknown;
};

// Build a de-duplicated, sorted list of per-condition classifications from ClinVar RCV records.
// Dedup key = condition + origin + significance; keeps the most authoritative (highest stars,
// then most recent evaluation). Informative conditions sort first, then by review stars (desc),
// then by severity, then recency.
export function buildConditionClassifications(rcvs: unknown): ConditionClassification[] {
  const byKey = new Map<string, ConditionClassification>();

  for (const rcv of asList(rcvs) as Rcv[]) {
    const condition = conditionName(rcv.conditions);
    if (!condition) continue;
    const { label, rank } = classifySignificance(rcv.clinical_significance);
    const row: ConditionClassification = {
      condition,
      significance: label,
      rawSignificance: rcv.clinical_significance || "",
      significanceRank: rank,
      reviewStatus: rcv.review_status || "",
      reviewStars: reviewStars(rcv.review_status),
      origin: (rcv.origin || "unknown").toLowerCase(),
      lastEvaluated: rcv.last_evaluated || null,
    };
    const key = `${condition.toLowerCase()}|${row.origin}|${label}`;
    const existing = byKey.get(key);
    if (
      !existing ||
      row.reviewStars > existing.reviewStars ||
      (row.reviewStars === existing.reviewStars &&
        (row.lastEvaluated || "") > (existing.lastEvaluated || ""))
    ) {
      byKey.set(key, row);
    }
  }

  const isUninformative = (c: string) => UNINFORMATIVE_CONDITIONS.has(c.toLowerCase());
  return [...byKey.values()].sort((a, b) => {
    const au = isUninformative(a.condition) ? 1 : 0;
    const bu = isUninformative(b.condition) ? 1 : 0;
    if (au !== bu) return au - bu; // informative conditions first
    if (b.reviewStars !== a.reviewStars) return b.reviewStars - a.reviewStars;
    if (a.significanceRank !== b.significanceRank) return a.significanceRank - b.significanceRank;
    return (b.lastEvaluated || "").localeCompare(a.lastEvaluated || "");
  });
}
