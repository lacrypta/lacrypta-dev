function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-0">
      <div className="h-7 w-7 shrink-0 animate-pulse rounded-full bg-white/[0.06]" />
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-white/[0.06] ring-1 ring-border-strong" />
        <div className="h-4 w-36 max-w-full animate-pulse rounded bg-white/[0.07]" />
      </div>
      <div className="hidden h-4 w-10 animate-pulse rounded bg-white/[0.05] sm:block" />
      <div className="hidden h-4 w-10 animate-pulse rounded bg-white/[0.05] sm:block" />
      <div className="hidden h-4 w-14 animate-pulse rounded bg-white/[0.05] md:block" />
      <div className="h-7 w-16 shrink-0 animate-pulse rounded-lg bg-white/[0.06]" />
    </div>
  );
}

export default function SoldadosLoading() {
  return (
    <>
      {/* PageHero-sized block */}
      <section className="relative overflow-hidden border-b border-border pt-32 pb-16 sm:pt-40 sm:pb-20">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-grid bg-grid-fade opacity-40" />
          <div className="absolute top-0 left-1/2 h-[300px] w-[700px] -translate-x-1/2 rounded-full bg-bitcoin/15 blur-[120px]" />
          <div className="absolute top-10 right-0 h-[300px] w-[400px] rounded-full bg-nostr/15 blur-[120px]" />
        </div>
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <div className="mx-auto mb-6 h-7 w-64 animate-pulse rounded-full border border-border bg-white/5" />
          <div className="mx-auto h-12 w-64 animate-pulse rounded-xl bg-white/[0.07] sm:h-16 md:h-20" />
          <div className="mx-auto mt-6 max-w-2xl space-y-2">
            <div className="mx-auto h-4 w-full animate-pulse rounded bg-white/[0.05]" />
            <div className="mx-auto h-4 w-2/3 animate-pulse rounded bg-white/[0.05]" />
          </div>
        </div>
      </section>

      {/* Ranking table block */}
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="h-4 w-56 animate-pulse rounded bg-white/[0.05]" />
          <div className="h-9 w-40 animate-pulse rounded-lg border border-border bg-background-card/40" />
        </div>
        <div className="rounded-2xl border border-border bg-background-card/40 backdrop-blur-sm">
          <div className="border-b border-border bg-white/[0.02] px-4 py-3">
            <div className="h-3 w-48 animate-pulse rounded bg-white/[0.05]" />
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      </div>
    </>
  );
}
