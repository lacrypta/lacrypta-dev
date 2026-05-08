import Link from "next/link";
import { Trophy, Zap } from "lucide-react";
import { GithubIcon } from "@/components/BrandIcons";
import { cn } from "@/lib/cn";
import type { Soldado } from "@/lib/soldados";

function avatarSrc(s: Soldado): string | null {
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

function uniqHackathonsCount(s: Soldado): number {
  const set = new Set<string>();
  for (const p of s.projects) if (p.hackathonId) set.add(p.hackathonId);
  return set.size;
}

function bestPosition(s: Soldado): number | null {
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

export default function SoldadosTable({ soldados }: { soldados: Soldado[] }) {
  // Sort by score desc, then name asc.
  const ranked = [...soldados].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-background-card/40 backdrop-blur-sm">
      {/* Desktop / tablet */}
      <table className="hidden sm:table w-full">
        <thead className="bg-white/[0.02] border-b border-border">
          <tr className="text-[10px] font-mono uppercase tracking-widest text-foreground-subtle">
            <th className="px-4 py-3 text-left w-12">#</th>
            <th className="px-4 py-3 text-left">Builder</th>
            <th className="px-4 py-3 text-right tabular-nums">Hackatones</th>
            <th className="px-4 py-3 text-right tabular-nums">Proyectos</th>
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
                <td className="px-4 py-3 align-middle text-right text-sm tabular-nums text-foreground-muted">
                  {ths}
                </td>
                <td className="px-4 py-3 align-middle text-right text-sm tabular-nums text-foreground-muted">
                  {s.projects.length}
                </td>
                <td className="px-4 py-3 align-middle text-right">
                  {bp ? (
                    <span className="inline-flex items-center gap-1 text-sm tabular-nums text-foreground">
                      {medal(bp) || (
                        <Trophy className="h-3.5 w-3.5 text-foreground-subtle" />
                      )}
                      <span className="font-mono font-semibold">{bp}°</span>
                    </span>
                  ) : (
                    <span className="text-foreground-subtle text-xs">—</span>
                  )}
                </td>
                <td
                  className="px-4 py-3 align-middle text-right"
                  title={`${s.scoreBreakdown.hackathons} hackatones · ${s.scoreBreakdown.projects} proyectos · ${s.scoreBreakdown.positions} posiciones`}
                >
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg px-3 py-1 font-display font-black text-base tabular-nums",
                      rank === 1
                        ? "bg-bitcoin/15 text-bitcoin ring-1 ring-bitcoin/40"
                        : rank <= 3
                          ? "bg-bitcoin/[0.06] text-foreground"
                          : "text-foreground",
                    )}
                  >
                    {s.score}
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
