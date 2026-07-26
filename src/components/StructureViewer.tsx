"use client";

// Lazy, browser-only 3D structure viewer. Mounted behind a "View 3D structure" toggle (never on
// initial render) so 3Dmol.js — a large WebGL library — is only fetched when a user actually asks
// to see it. Resolves an AlphaFold predicted model for the given UniProt accession, renders it
// colored by pLDDT confidence, and highlights the variant's residue when one is known and falls
// inside the model's covered range. Renders nothing when no prediction exists — a missing
// structure is a normal, silent outcome, not an error.

import { useEffect, useRef, useState } from "react";
import { resolveStructure, fetchStructurePdb, plddtColorFn, type StructureInfo } from "@/lib/alphafold";

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
  const [info, setInfo] = useState<StructureInfo | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "empty">("loading");

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    setInfo(null);

    (async () => {
      const s = await resolveStructure(uniprot);
      if (cancelled) return;
      if (!s) {
        setState("empty");
        return;
      }
      setInfo(s);

      const pdb = await fetchStructurePdb(s.pdbUrl);
      if (cancelled || !pdb || !hostRef.current) {
        setState("empty");
        return;
      }

      const $3Dmol = await import("3dmol");
      const viewer = $3Dmol.createViewer(hostRef.current, { backgroundColor: "0x00000000" });
      viewer.addModel(pdb, "pdb");
      viewer.setStyle({}, { cartoon: { colorfunc: plddtColorFn } });

      // Never highlight a residue outside the model's covered range — an out-of-range index
      // means we don't actually know where it sits on this structure, so staying silent beats
      // pointing at the wrong residue.
      const inRange = residue != null && residue >= s.residueStart && residue <= s.residueEnd;
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
  }, [uniprot, residue]);

  if (state === "empty") {
    return (
      <p className="mt-3 font-mono text-xs text-zinc-400">
        No predicted structure is available for this protein.
      </p>
    );
  }

  return (
    <div className="mt-3">
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
          {residueLabel && <span className="text-fuchsia-500">■ {residueLabel}</span>}
        </div>
        {info && (
          <a
            href={`https://alphafold.ebi.ac.uk/entry/${info.uniprot}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[10px] text-zinc-400 hover:text-teal-600 dark:hover:text-teal-400"
          >
            Predicted · AlphaFold{info.meanPlddt != null ? ` · pLDDT ${info.meanPlddt.toFixed(0)}` : ""} ↗
          </a>
        )}
      </div>
    </div>
  );
}
