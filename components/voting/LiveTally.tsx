"use client";

import { Trophy } from "lucide-react";
import type { VotingResults } from "@/lib/voting";
import { cn } from "@/lib/cn";

/**
 * Ranked vote standings bar list. Shared by the hackathon `VotingSection`
 * (live while open + final once closed) and the home admin hero so the two
 * never drift. `closed` switches the header label and highlights the leader.
 */
export default function LiveTally({
  results,
  closed,
}: {
  results: VotingResults;
  closed: boolean;
}) {
  const max = Math.max(1, ...results.tally.map((r) => r.votes));
  return (
    <div className="mt-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-mono font-semibold tracking-widest text-foreground-subtle uppercase">
          {closed ? "Resultados finales" : "Resultados en vivo"}
        </span>
        <span className="text-[10px] font-mono text-foreground-subtle tabular-nums">
          {results.ballotsCounted}{" "}
          {results.ballotsCounted === 1 ? "votante" : "votantes"} ·{" "}
          {results.totalVotesCast} votos
        </span>
      </div>
      <ol className="space-y-1.5">
        {results.tally.map((row, i) => {
          const leader = closed && i === 0 && row.votes > 0;
          return (
            <li key={row.projectId} className="relative">
              <div
                className={cn(
                  "relative overflow-hidden rounded-lg border px-3 py-2",
                  leader
                    ? "border-bitcoin/40 bg-bitcoin/5"
                    : "border-border bg-white/[0.02]",
                )}
              >
                <div
                  aria-hidden
                  className={cn(
                    "absolute inset-y-0 left-0 transition-[width] duration-500",
                    leader ? "bg-bitcoin/15" : "bg-nostr/10",
                  )}
                  style={{ width: `${(row.votes / max) * 100}%` }}
                />
                <div className="relative flex items-center gap-2">
                  {leader && <Trophy className="h-3.5 w-3.5 text-bitcoin shrink-0" />}
                  <span className="flex-1 min-w-0 text-sm font-semibold truncate">
                    {row.name}
                  </span>
                  <span
                    className={cn(
                      "text-sm font-mono font-bold tabular-nums",
                      leader ? "text-bitcoin" : "text-nostr",
                    )}
                  >
                    {row.votes}
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
