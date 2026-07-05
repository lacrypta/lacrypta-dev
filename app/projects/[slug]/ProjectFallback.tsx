"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useProjectEntity } from "@/lib/entityStore";
import { getHackathon, hackathonSlugForId } from "@/lib/hackathons";
import { safeDecodeURIComponent } from "@/lib/projectLinks";

/**
 * Suspense fallback for the canonical project page. During client-side
 * navigation it reads the entity store (seeded by the list page the user
 * came from) and paints the project's name/description/context instantly
 * while the server-rendered content streams in. On hard loads / SSR the
 * store is empty and it renders a neutral skeleton.
 *
 * Section blocks reserve heights so the streamed content doesn't shift the
 * already-painted header.
 */
export default function ProjectFallback() {
  const pathname = usePathname();
  const slug = pathname?.split("/").filter(Boolean).pop() ?? null;
  const known = useProjectEntity(slug ? safeDecodeURIComponent(slug) : null);
  const hackathon = known?.hackathon ? getHackathon(known.hackathon) : null;

  return (
    <div className="relative pt-24 pb-16">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {hackathon ? (
          <Link
            href={`/hackathons/${hackathonSlugForId(hackathon.id)}`}
            className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-widest text-foreground-muted hover:text-foreground transition-colors mb-6"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {hackathon.name}
          </Link>
        ) : (
          <div className="h-4 w-36 rounded bg-white/5 mb-8" />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-8">
          <div className="min-w-0 space-y-6">
            <div className="flex items-center gap-2 min-h-4">
              {hackathon ? (
                <span className="text-[10px] font-mono tracking-widest text-foreground-subtle">
                  {hackathon.icon} {hackathon.name} · {hackathon.monthShort}{" "}
                  {hackathon.year}
                </span>
              ) : (
                <div className="h-4 w-28 rounded-full bg-white/5" />
              )}
              {known?.status ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-border bg-white/5 text-[9px] font-mono font-semibold tracking-widest uppercase text-foreground-muted">
                  {known.status}
                </span>
              ) : (
                <div className="h-4 w-16 rounded-full bg-white/5" />
              )}
            </div>

            {known ? (
              <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight leading-tight">
                {known.name}
              </h1>
            ) : (
              <div className="space-y-2 animate-pulse">
                <div className="h-10 w-3/4 rounded-lg bg-white/5" />
                <div className="h-10 w-1/2 rounded-lg bg-white/5" />
              </div>
            )}

            {known?.description ? (
              <p className="text-base text-foreground-muted leading-relaxed">
                {known.description}
              </p>
            ) : (
              <div className="space-y-2 animate-pulse">
                <div className="h-4 w-full rounded bg-white/5" />
                <div className="h-4 w-[92%] rounded bg-white/5" />
                <div className="h-4 w-4/5 rounded bg-white/5" />
              </div>
            )}

            <div className="min-h-40 animate-pulse space-y-3">
              <div className="h-9 w-48 rounded-lg bg-white/5" />
              <div className="h-28 w-full rounded-2xl bg-white/5" />
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-border bg-background-card p-5 space-y-3">
              <div className="h-3 w-10 rounded bg-white/5" />
              <div className="flex flex-wrap gap-1.5">
                {(known?.tech && known.tech.length > 0
                  ? known.tech.slice(0, 6)
                  : null
                )?.map((t) => (
                  <span
                    key={t}
                    className="px-2 py-0.5 rounded-md border border-border bg-white/[0.03] text-[10px] font-mono text-foreground-muted"
                  >
                    {t}
                  </span>
                )) ??
                  [44, 60, 52, 36, 56].map((w) => (
                    <div
                      key={w}
                      className="h-5 rounded-md bg-white/5"
                      style={{ width: w }}
                    />
                  ))}
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-background-card p-5 space-y-4 animate-pulse">
              <div className="h-3 w-14 rounded bg-white/5" />
              {[1, 2].map((i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-full bg-white/5 shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-24 rounded bg-white/5" />
                    <div className="h-2.5 w-14 rounded bg-white/5" />
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
