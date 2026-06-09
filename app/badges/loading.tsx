import { BadgeCheck } from "lucide-react";

function SkeletonCard() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-background-card/75 p-5 backdrop-blur-sm">
      <div className="relative flex items-start gap-4">
        <div className="h-20 w-20 shrink-0 animate-pulse rounded-2xl border border-white/10 bg-white/[0.06]" />
        <div className="min-w-0 flex-1">
          <div className="h-4 w-24 animate-pulse rounded-full bg-white/[0.06]" />
          <div className="mt-3 h-5 w-3/4 animate-pulse rounded bg-white/[0.08]" />
          <div className="mt-3 h-3 w-full animate-pulse rounded bg-white/[0.05]" />
          <div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-white/[0.05]" />
        </div>
      </div>
      <div className="relative mt-5 flex items-center justify-between gap-3 border-t border-border pt-4">
        <div className="h-3 w-20 animate-pulse rounded bg-white/[0.05]" />
        <div className="h-9 w-9 animate-pulse rounded-lg border border-border bg-white/[0.05]" />
      </div>
    </div>
  );
}

function SkeletonSection({ cards }: { cards: number }) {
  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <div className="h-8 w-8 animate-pulse rounded-lg border border-border bg-white/[0.05]" />
        <div>
          <div className="h-6 w-40 animate-pulse rounded bg-white/[0.08]" />
          <div className="mt-2 h-3 w-16 animate-pulse rounded bg-white/[0.05]" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: cards }).map((_, index) => (
          <SkeletonCard key={index} />
        ))}
      </div>
    </div>
  );
}

export default function BadgesLoading() {
  return (
    <main className="relative min-h-screen overflow-hidden pt-28 pb-16">
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute inset-0 bg-grid bg-grid-fade opacity-35" />
        <div className="absolute top-0 left-1/2 h-[360px] w-[720px] -translate-x-1/2 rounded-full bg-bitcoin/12 blur-[120px]" />
        <div className="absolute right-0 top-40 h-[420px] w-[420px] rounded-full bg-nostr/14 blur-[120px]" />
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 h-4 w-44 animate-pulse rounded bg-white/[0.05]" />

        <section>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-bitcoin/30 bg-bitcoin/10 px-3 py-1 text-xs font-mono font-semibold uppercase tracking-widest text-bitcoin">
            <BadgeCheck className="h-3.5 w-3.5" />
            Badges desde Nostr
          </div>
          <h1 className="max-w-4xl font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl md:text-6xl">
            Reconocimientos
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-foreground-muted sm:text-lg">
            Se obtiene subiendo proyectos y participando en hackatons.
          </p>
        </section>

        <section className="mt-12 space-y-10">
          <SkeletonSection cards={3} />
          <SkeletonSection cards={2} />
        </section>
      </div>
    </main>
  );
}
