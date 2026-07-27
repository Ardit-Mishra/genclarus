"use client";

// Small client island: a copyable code block for the /developers docs page. Same pattern as
// src/app/embed/CopySnippet.tsx (kept as its own file rather than a shared import so this route
// tree stays self-contained) — everything else on /developers is static SSG.

import { useState } from "react";

export default function CopySnippet({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — the snippet is still selectable text.
    }
  }

  return (
    <div className="relative">
      <pre className="max-h-96 overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 p-4 font-mono text-xs leading-relaxed text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
        <code>{code}</code>
      </pre>
      <button
        type="button"
        onClick={copy}
        className="absolute right-2 top-2 rounded-md border border-zinc-200 bg-white px-2 py-1 font-mono text-[10px] text-zinc-500 transition hover:text-teal-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400"
      >
        {copied ? "Copied" : (label ?? "Copy")}
      </button>
    </div>
  );
}
