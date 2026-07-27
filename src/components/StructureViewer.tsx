"use client";

// Lazy, browser-only 3D structure viewer. Mounted behind a "View 3D structure" toggle (never on
// initial render) so 3Dmol.js — a large WebGL library — is only fetched when a user actually asks
// to see it. Resolves an AlphaFold predicted model for the given UniProt accession, renders it
// colored by pLDDT confidence, and highlights the variant's residue when one is known and falls
// inside the model's covered range. Renders nothing when no prediction exists — a missing
// structure is a normal, silent outcome, not an error.
//
// Also resolves the UniProt entry for the same accession: when it lists an experimental PDB
// structure, a Predicted/Experimental switch lets the user load that instead (spectrum-colored,
// since pLDDT is an AlphaFold-only concept); when it lists domain/site features, a
// Confidence/Domains toggle recolors the predicted cartoon by those regions. Both are additive —
// the predicted, pLDDT-colored view remains the default.

import { useEffect, useRef, useState } from "react";
import { resolveStructure, fetchStructurePdb, plddtColorFn, type StructureInfo } from "@/lib/alphafold";
import { fetchUniprotEntry, pickBestPdb, type UniprotEntry } from "@/lib/uniprot";
import type { GLViewer } from "3dmol";

type Source = "af" | "pdb";

export default function StructureViewer({
  uniprot,
  residue,
  residueLabel,
}: {
  uniprot: string;
  residue?: number | null;
  residueLabel?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<GLViewer | null>(null);
  const [info, setInfo] = useState<StructureInfo | null>(null);
  const [entry, setEntry] = useState<UniprotEntry | null>(null);
  const [pdbId, setPdbId] = useState<string | null>(null);
  const [source, setSource] = useState<Source>("af");
  const [state, setState] = useState<"loading" | "ready" | "empty">("loading");

  // Resolve structure metadata (AlphaFold prediction + UniProt entry) once per accession.
  useEffect(() => {
    let cancelled = false;
    setState("loading");
    setInfo(null);
    setEntry(null);
    setPdbId(null);
    setSource("af");

    (async () => {
      const [s, e] = await Promise.all([resolveStructure(uniprot), fetchUniprotEntry(uniprot)]);
      if (cancelled) return;
      if (!s) {
        setState("empty");
        return;
      }
      setInfo(s);
      setEntry(e);
      setPdbId(e ? pickBestPdb(e.pdbIds) : null);
    })();

    return () => {
      cancelled = true;
    };
  }, [uniprot]);

  // Load and render the chosen source (predicted AlphaFold model, or an experimental PDB
  // structure) whenever the resolved metadata, the source switch, or the residue changes.
  useEffect(() => {
    if (!info || !hostRef.current) return;
    let cancelled = false;
    setState("loading");

    (async () => {
      const usePdb = source === "pdb" && pdbId;
      const pdb = usePdb
        ? await fetchStructurePdb(`https://files.rcsb.org/download/${pdbId}.pdb`)
        : await fetchStructurePdb(info.pdbUrl);
      if (cancelled || !pdb || !hostRef.current) {
        setState("empty");
        return;
      }

      const $3Dmol = await import("3dmol");
      // Reuse a single viewer instance across source switches instead of creating a new one on
      // the same host element each time, which would stack duplicate WebGL canvases.
      if (!viewerRef.current) {
        viewerRef.current = $3Dmol.createViewer(hostRef.current, { backgroundColor: "0x00000000" });
      }
      const viewer = viewerRef.current;
      viewer.removeAllModels();
      viewer.addModel(pdb, "pdb");
      // Experimental structures carry no pLDDT confidence — color by spectrum instead.
      viewer.setStyle({}, usePdb ? { cartoon: { color: "spectrum" } } : { cartoon: { colorfunc: plddtColorFn } });

      // Never highlight a residue outside the predicted model's covered range — an out-of-range
      // index means we don't actually know where it sits on this structure, so staying silent
      // beats pointing at the wrong residue. Experimental PDB numbering can diverge from the
      // UniProt sequence (author-chain numbering), so this same range is only a heuristic there —
      // the UI labels that caveat when the experimental source is active.
      const inRange = residue != null && residue >= info.residueStart && residue <= info.residueEnd;
      if (inRange) {
        viewer.addStyle({ resi: residue! }, { stick: { color: "magenta", radius: 0.3 } });
        viewer.zoomTo({ resi: residue! });
      } else {
        viewer.zoomTo();
      }
      viewer.render();
      if (inRange) viewer.zoom(0.6, 800);
      if (!cancelled) setState("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [info, pdbId, source, residue]);

  if (state === "empty") {
    return (
      <p className="mt-3 font-mono text-xs text-zinc-400">
        No predicted structure is available for this protein.
      </p>
    );
  }

  return (
    <div className="mt-3">
      {pdbId && (
        <div className="mb-2 inline-flex rounded-md border border-zinc-200 p-0.5 font-mono text-[11px] dark:border-zinc-800">
          <button
            onClick={() => setSource("af")}
            className={`rounded px-2 py-1 transition ${
              source === "af"
                ? "bg-teal-600 text-white"
                : "text-zinc-500 hover:text-teal-700 dark:text-zinc-400 dark:hover:text-teal-400"
            }`}
          >
            Predicted
          </button>
          <button
            onClick={() => setSource("pdb")}
            className={`rounded px-2 py-1 transition ${
              source === "pdb"
                ? "bg-teal-600 text-white"
                : "text-zinc-500 hover:text-teal-700 dark:text-zinc-400 dark:hover:text-teal-400"
            }`}
          >
            Experimental
          </button>
        </div>
      )}
      <div
        ref={hostRef}
        className="relative h-72 w-full overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950"
      >
        {state === "loading" && (
          <span className="absolute inset-0 flex items-center justify-center font-mono text-xs text-zinc-400">
            Loading structure…
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2 font-mono text-[10px] text-zinc-500">
          {source === "pdb" ? (
            <span className="text-zinc-500 dark:text-zinc-400">Colored by chain (spectrum)</span>
          ) : (
            <>
              <span>
                <span className="text-[#0053D6]">■</span> very high
              </span>
              <span>
                <span className="text-[#65CBF3]">■</span> confident
              </span>
              <span>
                <span className="text-[#FFDB13]">■</span> low
              </span>
              <span>
                <span className="text-[#FF7D45]">■</span> very low
              </span>
            </>
          )}
          {residueLabel && <span className="text-fuchsia-500">■ {residueLabel}</span>}
        </div>
        {info &&
          (source === "pdb" && pdbId ? (
            <a
              href={`https://www.rcsb.org/structure/${pdbId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[10px] text-zinc-400 hover:text-teal-600 dark:hover:text-teal-400"
            >
              Experimental · RCSB PDB {pdbId} ↗
            </a>
          ) : (
            <a
              href={`https://alphafold.ebi.ac.uk/entry/${info.uniprot}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[10px] text-zinc-400 hover:text-teal-600 dark:hover:text-teal-400"
            >
              Predicted · AlphaFold{info.meanPlddt != null ? ` · pLDDT ${info.meanPlddt.toFixed(0)}` : ""} ↗
            </a>
          ))}
      </div>
      {source === "pdb" && (
        <p className="mt-1 font-mono text-[10px] text-amber-600 dark:text-amber-400">
          Experimental structure — residue numbering may differ from the reference sequence.
        </p>
      )}
    </div>
  );
}
