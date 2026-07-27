// UniProt entry resolver — PDB cross-references + feature annotations (domains, active/binding
// sites) for the 3D structure viewer's "Experimental" source and domain-coloring mode.
//
// Browser-only: called from the client component's effect, never during SSR. Like AlphaFold in
// src/lib/alphafold.ts, this goes through the same-origin `/api/structure?url=` proxy rather than
// fetching rest.uniprot.org directly — CSP enforces `connect-src 'self'` regardless of UniProt's
// own CORS policy.

const STRUCTURE_PROXY = "/api/structure?url=";

export type UniprotFeature = { type: string; start: number; end: number; description: string };
export type UniprotEntry = {
  features: UniprotFeature[];
  pdbIds: { id: string; method: string; resolution: number | null }[];
};

// Prefers the lowest-resolution X-ray structure (most detail); falls back to the first available
// entry (e.g. NMR/EM, which UniProt reports without a numeric resolution) when no X-ray exists.
export function pickBestPdb(pdbs: UniprotEntry["pdbIds"]): string | null {
  const xray = pdbs.filter((p) => /x-ray/i.test(p.method) && p.resolution != null);
  if (xray.length) return xray.sort((a, b) => a.resolution! - b.resolution!)[0].id;
  return pdbs[0]?.id ?? null;
}

const DOMAIN_PALETTE = ["#14b8a6", "#f59e0b", "#8b5cf6", "#ec4899", "#3b82f6", "#84cc16"];

// Maps UniProt Domain/Active site/Binding site features to colored residue ranges for the
// structure viewer's domain-coloring mode. Colors cycle through a fixed qualitative palette so
// adjacent regions stay visually distinct regardless of how many features a protein has.
export function domainRegions(
  features: UniprotFeature[],
): { start: number; end: number; label: string; color: string }[] {
  let i = 0;
  return features.map((f) => ({
    start: f.start,
    end: f.end,
    label:
      f.type === "Active site"
        ? `Active site ${f.start}`
        : f.type === "Binding site"
          ? `Binding site ${f.start}`
          : f.description || f.type,
    color: DOMAIN_PALETTE[i++ % DOMAIN_PALETTE.length],
  }));
}

// UniProt REST — domain/site features and PDB cross-references for one accession. Returns null
// on any failure (bad accession, network error, non-OK response) so callers can silently omit the
// experimental-structure switch and domain coloring rather than show an error.
export async function fetchUniprotEntry(uniprot: string): Promise<UniprotEntry | null> {
  if (!/^[A-Z0-9]{6,10}$/.test(uniprot)) return null;
  try {
    const apiUrl = `https://rest.uniprot.org/uniprotkb/${uniprot}?fields=ft_domain,ft_act_site,ft_binding,xref_pdb&format=json`;
    const res = await fetch(STRUCTURE_PROXY + encodeURIComponent(apiUrl));
    if (!res.ok) return null;
    const d = JSON.parse(await res.text()) as {
      features?: {
        type: string;
        description?: string;
        location: { start: { value: number }; end: { value: number } };
      }[];
      uniProtKBCrossReferences?: {
        database: string;
        id: string;
        properties?: { key: string; value: string }[];
      }[];
    };
    const features = (d.features ?? []).map((f) => ({
      type: f.type,
      start: f.location.start.value,
      end: f.location.end.value,
      description: f.description ?? "",
    }));
    const pdbIds = (d.uniProtKBCrossReferences ?? [])
      .filter((x) => x.database === "PDB")
      .map((x) => {
        const props = Object.fromEntries((x.properties ?? []).map((p) => [p.key, p.value]));
        const resMatch = /([\d.]+)\s*A/.exec(props["Resolution"] ?? "");
        return { id: x.id, method: props["Method"] ?? "", resolution: resMatch ? Number(resMatch[1]) : null };
      });
    return { features, pdbIds };
  } catch {
    return null;
  }
}
