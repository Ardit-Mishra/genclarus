// AlphaFold DB resolver + pLDDT coloring for the 3D structure viewer.
//
// Browser-only: called from the client component's effect, never during SSR. Every network call
// here goes through the same-origin `/api/structure?url=` proxy (src/app/api/structure/route.ts)
// rather than fetching alphafold.ebi.ac.uk directly — required because the CSP enforces
// `connect-src 'self'`, independent of whether the upstream itself allows CORS.

const STRUCTURE_PROXY = "/api/structure?url=";

export type StructureInfo = {
  pdbUrl: string;
  meanPlddt: number | null;
  residueStart: number;
  residueEnd: number;
  uniprot: string;
  description: string;
  amAnnotationsUrl: string | null;
};

// AlphaFold DB — one predicted model per UniProt accession. Returns null when no model exists,
// the accession is malformed, or the upstream/proxy fails, so callers can silently omit the
// viewer rather than show an error for a normal "no prediction available" case.
export async function resolveStructure(uniprot: string): Promise<StructureInfo | null> {
  if (!/^[A-Z0-9]{6,10}$/.test(uniprot)) return null;
  try {
    const apiUrl = `https://alphafold.ebi.ac.uk/api/prediction/${uniprot}`;
    const res = await fetch(STRUCTURE_PROXY + encodeURIComponent(apiUrl));
    if (!res.ok) return null;
    const arr = JSON.parse(await res.text()) as Record<string, unknown>[];
    const e = arr?.[0];
    if (!e?.pdbUrl) return null;
    return {
      pdbUrl: String(e.pdbUrl),
      meanPlddt: typeof e.globalMetricValue === "number" ? e.globalMetricValue : null,
      residueStart: Number(e.uniprotStart ?? 1),
      residueEnd: Number(e.uniprotEnd ?? 0),
      uniprot,
      description: String(e.uniprotDescription ?? ""),
      amAnnotationsUrl: e.amAnnotationsUrl ? String(e.amAnnotationsUrl) : null,
    };
  } catch {
    return null;
  }
}

// Fetches the actual PDB coordinate text for a resolved structure, via the same proxy.
export async function fetchStructurePdb(pdbUrl: string): Promise<string> {
  try {
    const res = await fetch(STRUCTURE_PROXY + encodeURIComponent(pdbUrl));
    return res.ok ? await res.text() : "";
  } catch {
    return "";
  }
}

// AlphaFold stores per-residue pLDDT confidence in the PDB b-factor column.
export function plddtColorFn(atom: { b: number }): string {
  const v = atom.b;
  if (v >= 90) return "#0053D6";
  if (v >= 70) return "#65CBF3";
  if (v >= 50) return "#FFDB13";
  return "#FF7D45";
}
