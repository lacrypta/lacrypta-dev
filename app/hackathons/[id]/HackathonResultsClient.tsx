"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trophy, Loader2 } from "lucide-react";
import { useHackathonResults, type HackathonResults } from "@/lib/nostrReports";
import { formatSats, hackathonSlugForId } from "@/lib/hackathons";
import { cn } from "@/lib/cn";

function medal(position: number): string {
  if (position === 1) return "🥇";
  if (position === 2) return "🥈";
  if (position === 3) return "🥉";
  return `#${position}`;
}

/**
 * Podium-styled prize distribution shown while there are no real winners yet.
 * 1st in the center is the tallest step; 2nd left, 3rd right; #4–6 below.
 */
function PrizeDistributionPodium({
  prizeDistribution,
  loading,
}: {
  prizeDistribution: { position: number; sats: number }[];
  loading?: boolean;
}) {
  const byPos = new Map(prizeDistribution.map((s) => [s.position, s.sats]));
  const get = (p: number) => byPos.get(p) ?? 0;
  const rest = prizeDistribution
    .filter((s) => s.position > 3)
    .sort((a, b) => a.position - b.position);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-1.5 items-end pt-1">
        <PodiumStep
          place={2}
          sats={get(2)}
          stepClass="h-14 from-cyan/25 to-cyan/5 border-cyan/50"
          accentText="text-cyan"
          medalSize="text-2xl"
          numberClass="text-lg font-extrabold text-foreground"
        />
        <PodiumStep
          place={1}
          sats={get(1)}
          stepClass="h-24 from-bitcoin/40 to-bitcoin/10 border-bitcoin/70 shadow-[0_-18px_40px_-16px_rgba(247,147,26,0.55)]"
          accentText="text-bitcoin"
          medalSize="text-4xl"
          numberClass="text-2xl sm:text-3xl font-black text-gradient-bitcoin"
          featured
        />
        <PodiumStep
          place={3}
          sats={get(3)}
          stepClass="h-9 from-orange-400/20 to-orange-400/5 border-orange-400/50"
          accentText="text-orange-400"
          medalSize="text-xl"
          numberClass="text-base font-extrabold text-foreground"
        />
      </div>

      {rest.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5 pt-3 border-t border-border">
          {rest.map((slot) => (
            <div
              key={slot.position}
              className="flex flex-col items-center text-center px-1 py-1.5 rounded-lg bg-white/[0.02] border border-border"
            >
              <span className="text-[9px] font-mono font-semibold tracking-widest text-foreground-subtle">
                #{slot.position}
              </span>
              <span className="mt-0.5 text-sm font-display font-extrabold tabular-nums tracking-tight">
                {formatSats(slot.sats)}
              </span>
              <span className="text-[8px] font-mono text-foreground-subtle uppercase tracking-widest">
                sats
              </span>
            </div>
          ))}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-nostr pt-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Cargando desde Nostr…
        </div>
      )}
    </div>
  );
}

function PodiumStep({
  place,
  sats,
  stepClass,
  accentText,
  medalSize,
  numberClass,
  featured = false,
}: {
  place: 1 | 2 | 3;
  sats: number;
  stepClass: string;
  accentText: string;
  medalSize: string;
  numberClass: string;
  featured?: boolean;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className={cn("leading-none mb-1", medalSize, featured && "drop-shadow-[0_0_18px_rgba(247,147,26,0.45)]")}>
        {medal(place)}
      </div>
      <div className={cn("tabular-nums tracking-tight leading-none", numberClass)}>
        {formatSats(sats)}
      </div>
      <div className="text-[8px] font-mono text-foreground-subtle uppercase tracking-widest mt-0.5">
        sats
      </div>
      <div
        className={cn(
          "mt-2 w-full rounded-t-lg border-t-2 bg-gradient-to-b flex items-start justify-center pt-1.5",
          stepClass,
        )}
      >
        <span className={cn("text-[10px] font-mono font-bold", accentText)}>
          {place}°
        </span>
      </div>
    </div>
  );
}

function PrizeList({
  hackathonId,
  results,
}: {
  hackathonId: string;
  results: HackathonResults;
}) {
  return (
    <ol className="space-y-2">
      {results.winners
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((w) => (
          <li key={w.projectId}>
            <Link
              href={`/hackathons/${hackathonSlugForId(hackathonId)}/${w.projectId}`}
              className={cn(
                "group flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors",
                w.position === 1
                  ? "bg-bitcoin/10 border-bitcoin/30 hover:bg-bitcoin/15"
                  : "bg-white/[0.02] border-border hover:bg-white/[0.05]",
              )}
            >
              <span className="text-lg leading-none shrink-0 w-7 text-center">
                {medal(w.position)}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold truncate group-hover:text-bitcoin transition-colors">
                  {w.teamName || w.projectId}
                </div>
                <div className="text-[10px] font-mono text-foreground-subtle tabular-nums">
                  {formatSats(w.sats)} sats
                </div>
              </div>
            </Link>
          </li>
        ))}
    </ol>
  );
}

/**
 * Fetches hackathon results from Nostr and renders the prize panel.
 * Only used for hackathons without static JSON data (i.e. #03 onwards).
 */
export default function HackathonResultsClient({
  hackathonId,
  prizeDistribution,
}: {
  hackathonId: string;
  prizeDistribution: { position: number; sats: number }[];
}) {
  const { results, loading } = useHackathonResults(hackathonId);

  if (!results) {
    return (
      <PrizeDistributionPodium
        prizeDistribution={prizeDistribution}
        loading={loading}
      />
    );
  }

  return <PrizeList hackathonId={hackathonId} results={results} />;
}
