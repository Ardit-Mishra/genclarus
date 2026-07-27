"use client";

// Client island for the static gene/variant pages: the "View 3D structure" toggle + lazy viewer,
// matching the homepage. Kept behind a toggle so a page visit doesn't eagerly load 3Dmol/WebGL.

import { useState } from "react";
import dynamic from "next/dynamic";

const StructureViewer = dynamic(() => import("@/components/StructureViewer"), { ssr: false });

export default function StructureSection({
  uniprot,
  residue,
  residueLabel,
}: {
  uniprot: string;
  residue?: number | null;
  residueLabel?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="mt-6">
      <button
        onClick={() => setShow((v) => !v)}
        className="rounded-lg border border-zinc-200 px-3 py-1.5 font-mono text-xs text-zinc-600 transition hover:border-teal-600 hover:text-teal-700 dark:border-zinc-800 dark:text-zinc-400 dark:hover:border-teal-400 dark:hover:text-teal-400"
      >
        {show ? "Hide 3D structure" : "View 3D structure"}
      </button>
      {show && <StructureViewer uniprot={uniprot} residue={residue} residueLabel={residueLabel} />}
    </div>
  );
}
