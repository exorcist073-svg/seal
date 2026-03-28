export default function Home() {
  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-4 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        SEAL
      </h1>
      <p className="max-w-md text-center text-zinc-600 dark:text-zinc-400">
        Next.js App Router starter. Edit{" "}
        <code className="rounded bg-zinc-200 px-1.5 py-0.5 font-mono text-sm dark:bg-zinc-800">
          src/app/page.tsx
        </code>{" "}
        to begin.
      </p>
    </main>
  );
}
