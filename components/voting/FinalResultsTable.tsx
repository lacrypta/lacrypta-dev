import Link from "next/link";
import { Trophy } from "lucide-react";
import { votingProjectHref } from "@/lib/projectLinks";
import {
  JUDGES_WEIGHT,
  POPULAR_WEIGHT,
  type FinalRow,
} from "@/lib/voting";
import { cn } from "@/lib/cn";

const MEDAL = ["🥇", "🥈", "🥉"];

/**
 * Final combined ranking: popular votes + judges, weighted 70/30. One row per
 * project ordered by `finalScore`, showing each judge's score, the judges'
 * average, the popular votes and the final score that decided the position.
 */
export default function FinalResultsTable({
  judges,
  rows,
}: {
  judges: string[];
  rows: FinalRow[];
}) {
  return (
    <div className="mt-6">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="inline-flex items-center gap-2 text-[10px] font-mono font-semibold tracking-widest text-foreground-subtle uppercase">
          <Trophy className="h-4 w-4 text-bitcoin" />
          Resultado final
        </span>
        <span className="text-[10px] font-mono text-foreground-subtle">
          {Math.round(POPULAR_WEIGHT * 100)}% popular · {Math.round(JUDGES_WEIGHT * 100)}% jueces
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left text-[11px] font-mono">
          <thead>
            <tr className="text-foreground-subtle bg-white/[0.02] uppercase tracking-wider text-[9px]">
              <th className="px-2 py-2 w-8 text-center">#</th>
              <th className="px-2 py-2">Proyecto</th>
              {judges.map((j) => (
                <th key={j} className="px-2 py-2 text-right" title={`Juez: ${j}`}>
                  {j}
                </th>
              ))}
              <th className="px-2 py-2 text-right text-nostr">Prom. jueces</th>
              <th className="px-2 py-2 text-right">Votos</th>
              <th className="px-2 py-2 text-right text-bitcoin">Final</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => {
              const leader = r.position === 1;
              return (
                <tr
                  key={r.projectId}
                  className={cn(leader && "bg-bitcoin/5")}
                >
                  <td className="px-2 py-2 text-center text-sm tabular-nums">
                    {MEDAL[r.position - 1] ?? `${r.position}°`}
                  </td>
                  <td className="px-2 py-2 max-w-[14rem]">
                    <Link
                      href={votingProjectHref(r.projectId)}
                      className="block truncate font-semibold hover:text-bitcoin transition-colors"
                    >
                      {r.name}
                    </Link>
                  </td>
                  {r.judgeScores.map((s, i) => (
                    <td key={i} className="px-2 py-2 text-right tabular-nums text-foreground-muted">
                      {s}
                    </td>
                  ))}
                  <td className="px-2 py-2 text-right tabular-nums text-nostr">
                    {r.judgeAvg.toFixed(2)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{r.popularVotes}</td>
                  <td
                    className={cn(
                      "px-2 py-2 text-right tabular-nums font-bold",
                      leader ? "text-bitcoin" : "text-foreground",
                    )}
                  >
                    {r.finalScore.toFixed(1)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[10px] font-mono text-foreground-subtle">
        Puntaje final = 100 × ({POPULAR_WEIGHT}·cuota de votos + {JUDGES_WEIGHT}·cuota de
        jueces). Cada dimensión se normaliza por su total.
      </p>
    </div>
  );
}
