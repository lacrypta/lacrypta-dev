"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trophy, Loader2 } from "lucide-react";
import { useHackathonResults, type HackathonResults } from "@/lib/nostrReports";
import { formatSats } from "@/lib/hackathons";
import { cn } from "@/lib/cn";

function medal(position: number): string {
  if (position === 1) return "🥇";
  if (position === 2) return "🥈";
  if (position === 3) return "🥉";
  return `#${position}`;
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
              href={`/hackathons/${hackathonId}/${w.projectId}`}
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

  if (loading && !results) {
    return (
      <ol className="space-y-2">
        {prizeDistribution.map((slot) => (
          <li
            key={slot.position}
            className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.02] border border-border"
          >
            <span className="text-sm font-mono text-foreground-muted">
              {medal(slot.position)}
            </span>
            <span className="text-sm font-bold tabular-nums">
              {formatSats(slot.sats)} sats
            </span>
          </li>
        ))}
        <li className="flex items-center gap-1.5 text-[10px] font-mono text-nostr pt-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Cargando desde Nostr…
        </li>
      </ol>
    );
  }

  if (!results) {
    return (
      <ol className="space-y-2">
        {prizeDistribution.map((slot) => (
          <li
            key={slot.position}
            className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.02] border border-border"
          >
            <span className="text-sm font-mono text-foreground-muted">
              {medal(slot.position)}
            </span>
            <span className="text-sm font-bold tabular-nums">
              {formatSats(slot.sats)} sats
            </span>
          </li>
        ))}
      </ol>
    );
  }

  return <PrizeList hackathonId={hackathonId} results={results} />;
}
