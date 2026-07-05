function SkeletonProjectCard() {
  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-background-card p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="h-5 w-24 animate-pulse rounded-full border border-border bg-white/[0.05]" />
        <div className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-white/[0.06]" />
      </div>
      <div className="mb-3 h-6 w-3/4 animate-pulse rounded bg-white/[0.08]" />
      <div className="space-y-2">
        <div className="h-3.5 w-full animate-pulse rounded bg-white/[0.05]" />
        <div className="h-3.5 w-full animate-pulse rounded bg-white/[0.05]" />
        <div className="h-3.5 w-2/3 animate-pulse rounded bg-white/[0.05]" />
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        <div className="h-5 w-16 animate-pulse rounded-md border border-border bg-white/[0.04]" />
        <div className="h-5 w-20 animate-pulse rounded-md border border-border bg-white/[0.04]" />
        <div className="h-5 w-14 animate-pulse rounded-md border border-border bg-white/[0.04]" />
      </div>
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-5">
        <div className="h-3.5 w-24 animate-pulse rounded bg-white/[0.05]" />
        <div className="h-4 w-4 animate-pulse rounded bg-white/[0.05]" />
      </div>
    </div>
  );
}

export default function ProjectsLoading() {
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
          <div className="mx-auto mb-6 h-7 w-56 animate-pulse rounded-full border border-border bg-white/5" />
          <div className="mx-auto max-w-4xl space-y-4">
            <div className="mx-auto h-12 w-4/5 animate-pulse rounded-xl bg-white/[0.07] sm:h-16 md:h-20" />
            <div className="mx-auto h-12 w-3/5 animate-pulse rounded-xl bg-white/[0.07] sm:h-16 md:h-20" />
          </div>
        </div>
      </section>

      {/* ProjectsGrid-sized block */}
      <section className="relative py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10 flex flex-col gap-4">
            <div className="h-11 w-full max-w-md animate-pulse rounded-xl border border-border bg-white/[0.03]" />
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-8 w-24 animate-pulse rounded-full border border-border bg-white/[0.03]"
                />
              ))}
            </div>
          </div>
          <div className="mb-6 h-4 w-32 animate-pulse rounded bg-white/[0.05]" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonProjectCard key={i} />
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
