import type { ReactNode } from "react";

export default function PageHero({
  eyebrow,
  eyebrowIcon,
  title,
  description,
}: {
  eyebrow?: string;
  eyebrowIcon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
}) {
  return (
    <section className="relative pt-32 pb-16 sm:pt-40 sm:pb-20 border-b border-border overflow-hidden">
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute inset-0 bg-grid bg-grid-fade opacity-40" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[300px] bg-bitcoin/15 blur-[120px] rounded-full" />
        <div className="absolute top-10 right-0 w-[400px] h-[300px] bg-nostr/15 blur-[120px] rounded-full" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {eyebrow && (
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-white/5 text-xs font-mono tracking-wider text-foreground-muted mb-6">
            {eyebrowIcon}
            {eyebrow}
          </div>
        )}

        <h1 className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.05] max-w-4xl mx-auto">
          {title}
        </h1>

        {description && (
          <p className="mt-6 text-lg text-foreground-muted max-w-2xl mx-auto leading-relaxed">
            {description}
          </p>
        )}
      </div>
    </section>
  );
}
