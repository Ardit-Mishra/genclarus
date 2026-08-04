// Deterministic gene-identity renderer (Stage-5 root-cause-final, 2026-08-03). Replaces the LLM's
// gene identity/function prose — which repeatedly hallucinated ungrounded facts (wrong chromosome,
// pseudogene stated as an active enzyme, an intergenic two-gene label treated as one real gene) — with
// a single, safe, fully-grounded identity statement built straight from the typed gene facts. It
// asserts ONLY what the facts carry: the symbol and the gene TYPE (so a pseudogene is labelled a
// pseudogene, never an enzyme). The authoritative NCBI summary/name/aliases are already served as facts
// alongside it. Pure; passes the hardened gate as "deterministic" by construction.

import type { GeneFacts } from "./facts";
import type { GroundedClaim } from "./grounding";

// Map MyGene `type_of_gene` to a faithful human-readable label. Unknown/empty → the neutral "gene".
function typeLabel(type: string): string {
  const t = (type || "").toLowerCase();
  if (t === "protein-coding") return "protein-coding gene";
  if (t === "pseudo" || t === "pseudogene") return "pseudogene";
  if (!t || t === "unknown" || t === "other") return "gene";
  return `${type} gene`; // e.g. "ncRNA gene", "rRNA gene" — the raw type is faithful data
}

export function renderGeneClaims(g: GeneFacts): GroundedClaim[] {
  if (!g.symbol) return [];
  const ids = ["gene.symbol"];
  if (g.type) ids.push("gene.type");
  return [
    {
      text: `${g.symbol} is a human ${typeLabel(g.type)}.`,
      supportingFactIds: ids,
      claimType: "identity",
    },
  ];
}
