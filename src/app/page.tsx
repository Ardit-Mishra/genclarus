export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <span className="font-mono text-xs uppercase tracking-[0.2em] text-teal-700 dark:text-teal-400">
        Bioinformatics · AI
      </span>
      <h1 className="mt-4 text-5xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-6xl">
        GeneLens
      </h1>
      <p className="mt-5 max-w-md text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
        Type a human gene and get a clear, cited, plain-language explanation grounded in real
        biology.
      </p>
      <p className="mt-10 font-mono text-sm text-zinc-500">
        Building in progress — the gene lookup ships next.
      </p>
    </main>
  );
}
