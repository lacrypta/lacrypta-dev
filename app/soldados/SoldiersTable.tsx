import type { ReactNode } from "react";
import Link from "next/link";
import { Trophy, Zap } from "lucide-react";
import { GithubIcon } from "@/components/BrandIcons";
import { cn } from "@/lib/cn";
import { HACKATHON_LABELS } from "@/lib/projects";
import type { Soldier } from "@/lib/soldiers";

// Mirrors the scoring constants in lib/soldiers.ts. Kept local to render
// the per-cell breakdown without re-exporting internals from that module.
const POINTS_PER_HACKATHON = 1;
const POINTS_PER_PROJECT = 0;
const POSITION_POINTS: Record<number, number> = {
  1: 10,
  2: 7,
  3: 5,
  4: 3,
  5: 2,
  6: 1,
};

function positionPoints(p: number | null | undefined): number {
  if (p == null) return 0;
  return POSITION_POINTS[p] ?? 0;
}

function avatarSrc(s: Soldier): string | null {
  if (s.picture) return s.picture;
  if (s.github) return `https://github.com/${s.github}.png?size=80`;
  return null;
}

function initials(name: string): string {
  const parts = name
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .trim()
    .split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

function uniqHackathonsCount(s: Soldier): number {
  const set = new Set<string>();
  for (const p of s.projects) if (p.hackathonId) set.add(p.hackathonId);
  return set.size;
}

function bestPosition(s: Soldier): number | null {
  let best: number | null = null;
  for (const p of s.projects) {
    if (p.position == null) continue;
    if (best == null || p.position < best) best = p.position;
  }
  return best;
}

function medal(position: number | null): string {
  if (position === 1) return "🥇";
  if (position === 2) return "🥈";
  if (position === 3) return "🥉";
  return "";
}

type ScoredPositionEntry = {
  position: number;
  hackathonLabel: string;
  projectId: string;
  projectName: string;
  points: number;
};

function scoredPositionEntries(projects: Soldier["projects"]): ScoredPositionEntry[] {
  return projects
    .filter((p) => p.positionPoints > 0 && p.position != null)
    .map((p) => ({
      position: p.position!,
      hackathonLabel: p.hackathonId ? hackathonLabel(p.hackathonId) : "Sin hackatón",
      projectId: p.projectId,
      projectName: p.projectName,
      points: p.positionPoints,
    }))
    .sort((a, b) => {
      if (a.position !== b.position) return a.position - b.position;
      const byHackathon = a.hackathonLabel.localeCompare(b.hackathonLabel, undefined, {
        sensitivity: "base",
      });
      if (byHackathon !== 0) return byHackathon;
      return a.projectName.localeCompare(b.projectName, undefined, {
        sensitivity: "base",
      });
    });
}

function positionLabel(position: number): string {
  if (position === 1) return "1er puesto 🥇";
  if (position === 2) return "2do puesto 🥈";
  if (position === 3) return "3er puesto 🥉";
  if (position === 4) return "4to puesto";
  if (position === 5) return "5to puesto";
  if (position === 6) return "6to puesto";
  return `${position}° puesto`;
}

function hackathonLabel(id: string): string {
  if (id in HACKATHON_LABELS) {
    return HACKATHON_LABELS[id as keyof typeof HACKATHON_LABELS];
  }
  return id;
}

export default function SoldiersTable({ soldiers }: { soldiers: Soldier[] }) {
  // Sort by score desc, then name asc.
  const ranked = [...soldiers].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });

  return (
    <div className="rounded-2xl border border-border bg-background-card/40 backdrop-blur-sm">
      {/* Desktop / tablet */}
      <table className="hidden sm:table w-full">
        <thead className="bg-white/[0.02] border-b border-border">
          <tr className="text-[10px] font-mono uppercase tracking-widest text-foreground-subtle">
            <th className="px-4 py-3 text-left w-12">#</th>
            <th className="px-4 py-3 text-left">Builder</th>
            <th className="px-4 py-3 text-right tabular-nums">Hackatones</th>
            <th className="px-4 py-3 text-right tabular-nums">Proyectos</th>
            <th className="px-4 py-3 text-right tabular-nums">Puestos</th>
            <th className="px-4 py-3 text-right tabular-nums">Mejor</th>
            <th className="px-4 py-3 text-right tabular-nums">Score</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((s, i) => {
            const rank = i + 1;
            const src = avatarSrc(s);
            const bp = bestPosition(s);
            const ths = uniqHackathonsCount(s);
            const scoredPositions = scoredPositionEntries(s.projects);
            const positionsTotal = scoredPositions.reduce(
              (sum, entry) => sum + entry.points,
              0,
            );
            return (
              <tr
                key={s.id}
                className={cn(
                  "border-b border-border last:border-0 transition-colors hover:bg-white/[0.03]",
                )}
              >
                <td className="px-4 py-3 align-middle">
                  <span
                    className={cn(
                      "inline-flex h-7 min-w-7 items-center justify-center rounded-full text-[11px] font-mono font-bold tabular-nums px-2",
                      rank === 1 &&
                        "bg-bitcoin/20 text-bitcoin ring-1 ring-bitcoin/40",
                      rank === 2 &&
                        "bg-cyan/15 text-cyan ring-1 ring-cyan/40",
                      rank === 3 &&
                        "bg-bitcoin/10 text-bitcoin/80 ring-1 ring-bitcoin/30",
                      rank > 3 && "bg-white/[0.04] text-foreground-muted",
                    )}
                  >
                    {rank}
                  </span>
                </td>
                <td className="px-4 py-3 align-middle">
                  <div className="flex items-center gap-3 min-w-0">
                    <Link
                      href={`/soldados/${s.slug}`}
                      className="shrink-0 hover:scale-[1.04] transition-transform"
                    >
                      {src ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={src}
                          alt={s.name}
                          className="h-9 w-9 rounded-full object-cover ring-1 ring-border-strong"
                          loading="lazy"
                        />
                      ) : (
                        <span className="h-9 w-9 rounded-full ring-1 ring-border-strong bg-gradient-to-br from-bitcoin/30 to-nostr/30 inline-flex items-center justify-center font-display font-bold text-[11px]">
                          {initials(s.name)}
                        </span>
                      )}
                    </Link>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Link
                          href={`/soldados/${s.slug}`}
                          className="font-display font-bold text-sm truncate hover:text-bitcoin transition-colors"
                        >
                          {s.name}
                        </Link>
                        {s.hasNostr && (
                          <span
                            className="inline-flex items-center justify-center h-3.5 w-3.5 rounded-full bg-nostr/15 border border-nostr/40 text-nostr shrink-0"
                            title="Verificado en Nostr"
                            aria-label="Nostr"
                          >
                            <Zap className="h-2 w-2" strokeWidth={3} />
                          </span>
                        )}
                      </div>
                      {s.github && (
                        <a
                          href={`https://github.com/${s.github}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-mono text-foreground-subtle hover:text-foreground transition-colors"
                        >
                          <GithubIcon className="h-3 w-3" />
                          {s.github}
                        </a>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 align-middle text-right">
                  <span className="group/hk relative inline-block cursor-help">
                    <span className="text-sm tabular-nums text-foreground-muted">
                      {ths}
                    </span>
                    {ths > 0 && (
                      <StatTooltip
                        hoverClass="group-hover/hk:opacity-100 group-hover/hk:translate-y-0"
                        title="Hackatones"
                        rows={[
                          { left: `${ths} × ${POINTS_PER_HACKATHON}` },
                        ]}
                        total={ths * POINTS_PER_HACKATHON}
                      />
                    )}
                  </span>
                </td>
                <td className="px-4 py-3 align-middle text-right">
                  <span className="group/proj relative inline-block cursor-help">
                    <span className="text-sm tabular-nums text-foreground-muted">
                      {s.projects.length}
                    </span>
                    {s.projects.length > 0 && (
                      <StatTooltip
                        hoverClass="group-hover/proj:opacity-100 group-hover/proj:translate-y-0"
                        title="Proyectos"
                        rows={[
                          { left: `${s.projects.length} × ${POINTS_PER_PROJECT}` },
                        ]}
                        total={s.projects.length * POINTS_PER_PROJECT}
                      />
                    )}
                  </span>
                </td>
                <td className="px-4 py-3 align-middle text-right">
                  {scoredPositions.length === 0 ? (
                    <span className="text-foreground-subtle text-xs">—</span>
                  ) : (
                    <span className="group/positions relative inline-block cursor-help">
                      <span className="inline-flex max-w-44 flex-wrap items-center justify-end gap-x-2 gap-y-1 text-xs">
                        {scoredPositions.map(
                          ({ position, hackathonLabel, projectId, projectName }) => (
                            <span
                              key={`${projectId}-${position}-${hackathonLabel}`}
                              title={`${projectName} · ${hackathonLabel}`}
                              className="inline-flex items-center gap-1 rounded-full border border-border bg-white/[0.03] px-2 py-0.5 text-foreground-muted"
                            >
                              <span>{positionLabel(position)}</span>
                            </span>
                          ),
                        )}
                      </span>
                      <StatTooltip
                        hoverClass="group-hover/positions:opacity-100 group-hover/positions:translate-y-0"
                        title="Puestos puntuables"
                        rows={scoredPositions.map(
                          ({ position, hackathonLabel, projectName, points }) => ({
                            left: `${positionLabel(position)} · ${projectName} · ${hackathonLabel} · ${points} pts`,
                          }),
                        )}
                        total={positionsTotal}
                      />
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 align-middle text-right">
                  {bp ? (
                    <span className="group/best relative inline-block cursor-help">
                      <span className="inline-flex items-center gap-1 text-sm tabular-nums text-foreground">
                        {medal(bp) || (
                          <Trophy className="h-3.5 w-3.5 text-foreground-subtle" />
                        )}
                        <span className="font-mono font-semibold">{bp}°</span>
                      </span>
                      <StatTooltip
                        hoverClass="group-hover/best:opacity-100 group-hover/best:translate-y-0"
                        title="Mejor posición"
                        rows={[{ left: `${bp}°` }]}
                        total={positionPoints(bp)}
                      />
                    </span>
                  ) : (
                    <span className="text-foreground-subtle text-xs">—</span>
                  )}
                </td>
                <td className="px-4 py-3 align-middle text-right">
                  <span className="group/score relative inline-block">
                    <span
                      className={cn(
                        "inline-flex items-baseline gap-1 rounded-lg px-3 py-1 font-display font-black text-base tabular-nums cursor-default",
                        "bg-bitcoin/15 text-bitcoin ring-1 ring-bitcoin/40",
                      )}
                    >
                      {s.score}
                      <span className="text-[10px] font-mono font-normal uppercase tracking-widest text-bitcoin/70">
                        puntos
                      </span>
                    </span>
                    <ScoreBreakdownTooltip soldier={s} />
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Mobile */}
      <ul className="sm:hidden divide-y divide-border">
        {ranked.map((s, i) => {
          const rank = i + 1;
          const src = avatarSrc(s);
          const bp = bestPosition(s);
          return (
            <li key={s.id}>
              <Link
                href={`/soldados/${s.slug}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors"
              >
                <span
                  className={cn(
                    "inline-flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-mono font-bold tabular-nums shrink-0",
                    rank === 1
                      ? "bg-bitcoin/20 text-bitcoin ring-1 ring-bitcoin/40"
                      : rank === 2
                        ? "bg-cyan/15 text-cyan ring-1 ring-cyan/40"
                        : rank === 3
                          ? "bg-bitcoin/10 text-bitcoin/80 ring-1 ring-bitcoin/30"
                          : "bg-white/[0.04] text-foreground-muted",
                  )}
                >
                  {rank}
                </span>
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={src}
                    alt={s.name}
                    className="h-9 w-9 rounded-full object-cover ring-1 ring-border-strong shrink-0"
                    loading="lazy"
                  />
                ) : (
                  <span className="h-9 w-9 rounded-full ring-1 ring-border-strong bg-gradient-to-br from-bitcoin/30 to-nostr/30 inline-flex items-center justify-center font-display font-bold text-[11px] shrink-0">
                    {initials(s.name)}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-display font-bold text-sm truncate">
                      {s.name}
                    </span>
                    {s.hasNostr && (
                      <span
                        className="inline-flex items-center justify-center h-3.5 w-3.5 rounded-full bg-nostr/15 border border-nostr/40 text-nostr shrink-0"
                        aria-label="Nostr"
                      >
                        <Zap className="h-2 w-2" strokeWidth={3} />
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-mono text-foreground-subtle">
                    <span>{s.projects.length}p</span>
                    <span>·</span>
                    <span>{uniqHackathonsCount(s)}h</span>
                    {bp && (
                      <>
                        <span>·</span>
                        <span>{medal(bp) || `${bp}°`}</span>
                      </>
                    )}
                  </div>
                </div>
                <span
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 bg-bitcoin/[0.08] text-bitcoin font-display font-black text-sm tabular-nums shrink-0"
                  title={`H${s.scoreBreakdown.hackathons} · P${s.scoreBreakdown.projects} · pos${s.scoreBreakdown.positions}`}
                >
                  {s.score}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

type TooltipRow = { left: ReactNode };

function StatTooltip({
  hoverClass,
  title,
  rows,
  total,
}: {
  // Hover trigger classes. Passed as a literal string from the call site so
  // Tailwind can detect the named-group variants at build time (e.g.
  // "group-hover/hk:opacity-100 group-hover/hk:translate-y-0").
  hoverClass: string;
  title?: string;
  rows: TooltipRow[];
  total?: number;
}) {
  return (
    <span
      role="tooltip"
      className={cn(
        "pointer-events-none absolute right-0 top-full mt-2 z-30",
        "min-w-[18rem] max-w-md rounded-xl border border-border bg-background-card/95 backdrop-blur-md shadow-2xl",
        "px-3.5 py-2.5 text-left whitespace-normal",
        "opacity-0 translate-y-1",
        hoverClass,
        "transition-all duration-150",
      )}
    >
      {title && (
        <div className="mb-1.5 text-[10px] font-mono font-bold uppercase tracking-widest text-foreground-subtle">
          {title}
        </div>
      )}
      <ul className="space-y-1 text-xs font-mono text-foreground-muted">
        {rows.map((r, i) => (
          <li key={i}>{r.left}</li>
        ))}
      </ul>
      {total !== undefined && (
        <div className="mt-1.5 pt-1.5 border-t border-border flex items-baseline justify-between gap-4">
          <span className="text-[10px] font-mono uppercase tracking-widest text-foreground-subtle">
            Total
          </span>
          <span className="font-display font-black text-sm text-bitcoin tabular-nums">
            +{total}{" "}
            <span className="text-[10px] font-mono font-normal text-bitcoin/70">
              puntos
            </span>
          </span>
        </div>
      )}
    </span>
  );
}

function ScoreBreakdownTooltip({ soldier }: { soldier: Soldier }) {
  const { scoreBreakdown: b, projects } = soldier;
  const hackathonsCount = new Set(
    projects.filter((p) => p.hackathonId).map((p) => p.hackathonId),
  ).size;
  return (
    <span
      role="tooltip"
      className={cn(
        "pointer-events-none absolute right-0 top-full mt-2 z-30",
        "min-w-[14rem] rounded-xl border border-border bg-background-card/95 backdrop-blur-md shadow-2xl",
        "px-3.5 py-3 text-left",
        "opacity-0 translate-y-1 group-hover/score:opacity-100 group-hover/score:translate-y-0",
        "transition-all duration-150",
      )}
    >
      <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-foreground-subtle">
        Composición del score
      </div>
      <ul className="mt-2 space-y-1.5 text-xs font-mono">
        <li className="flex items-baseline justify-between gap-4">
          <span className="text-foreground-muted">
            Hackatones <span className="text-foreground-subtle">·</span>{" "}
            {hackathonsCount} × {POINTS_PER_HACKATHON}
          </span>
          <span className="font-bold text-foreground tabular-nums">
            +{b.hackathons}{" "}
            <span className="font-normal text-foreground-subtle">puntos</span>
          </span>
        </li>
        <li className="flex items-baseline justify-between gap-4">
          <span className="text-foreground-muted">
            Proyectos <span className="text-foreground-subtle">·</span>{" "}
            {projects.length} × {POINTS_PER_PROJECT}
          </span>
          <span className="font-bold text-foreground tabular-nums">
            +{b.projects}{" "}
            <span className="font-normal text-foreground-subtle">puntos</span>
          </span>
        </li>
        <li className="flex items-baseline justify-between gap-4">
          <span className="text-foreground-muted">Puestos</span>
          <span className="font-bold text-foreground tabular-nums">
            +{b.positions}{" "}
            <span className="font-normal text-foreground-subtle">puntos</span>
          </span>
        </li>
      </ul>
      <div className="mt-2 pt-2 border-t border-border flex items-baseline justify-between gap-4">
        <span className="text-[10px] font-mono uppercase tracking-widest text-foreground-subtle">
          Total
        </span>
        <span className="font-display font-black text-base text-bitcoin tabular-nums">
          {b.total}{" "}
          <span className="text-[10px] font-mono font-normal text-bitcoin/70">
            puntos
          </span>
        </span>
      </div>
    </span>
  );
}
