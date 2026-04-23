import type { Metadata } from "next";
import Link from "next/link";
import {
  Calendar,
  Zap,
  Trophy,
  CirclePlay,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import PageHero from "@/components/ui/PageHero";
import {
  HACKATHONS,
  PROGRAM,
  formatSats,
  hackathonStatus,
} from "@/lib/hackathons";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Hackatones",
  description:
    "Lightning Hackathons 2026 — 8 hackatones mensuales, 8M sats en premios. Bitcoin, Lightning, Nostr.",
};

const DIFFICULTY_STYLE: Record<string, string> = {
  Beginner: "bg-success/10 text-success border-success/30",
  Intermediate: "bg-cyan/10 text-cyan border-cyan/30",
  Advanced: "bg-nostr/10 text-nostr border-nostr/30",
  Expert: "bg-bitcoin/10 text-bitcoin border-bitcoin/30",
};

const STATUS_STYLE: Record<
  "upcoming" | "active" | "closed",
  { label: string; className: string }
> = {
  upcoming: {
    label: "PRÓXIMO",
    className: "bg-white/5 text-foreground-muted border-border",
  },
  active: {
    label: "EN CURSO",
    className: "bg-success/10 text-success border-success/30 animate-pulse",
  },
  closed: {
    label: "CERRADO",
    className: "bg-bitcoin/10 text-bitcoin border-bitcoin/30",
  },
};

export default function HackathonsPage() {
  const now = new Date();
  return (
    <>
      <PageHero
        eyebrow="LIGHTNING HACKATHONS 2026"
        eyebrowIcon={<Zap className="h-3 w-3" />}
        title={
          <>
            8 hackatones ·{" "}
            <span className="text-gradient-bitcoin">
              {formatSats(PROGRAM.totalPrize)} sats
            </span>{" "}
            en premios
          </>
        }
        description={`Un hackatón por mes hasta octubre, organizado por ${PROGRAM.organization}. De Lightning básico hasta apps full-stack. Participá solo o en equipo (máx. 4 personas).`}
      />

      <section className="py-12 sm:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-12">
            <StatTile
              icon={<Trophy className="h-4 w-4" />}
              label="Premio total"
              value={`${formatSats(PROGRAM.totalPrize)} sats`}
              accent="text-bitcoin"
            />
            <StatTile
              icon={<Zap className="h-4 w-4" />}
              label="Por hackatón"
              value={`${formatSats(PROGRAM.prizePerHackathon)} sats`}
              accent="text-lightning"
            />
            <StatTile
              icon={<Calendar className="h-4 w-4" />}
              label="Hackatones"
              value={String(HACKATHONS.length)}
              accent="text-cyan"
            />
            <StatTile
              icon={<Sparkles className="h-4 w-4" />}
              label="Primer puesto"
              value={`${formatSats(PROGRAM.prizeDistribution[0]?.sats ?? 0)} sats`}
              accent="text-nostr"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {HACKATHONS.map((h) => {
              const status = hackathonStatus(h, now);
              const statusMeta = STATUS_STYLE[status];
              const firstDate = h.dates[0]?.date;
              const lastDate = h.dates[h.dates.length - 1]?.date;
              return (
                <Link
                  key={h.id}
                  href={`/hackathons/${h.id}`}
                  className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-background-card hover:border-border-strong hover:-translate-y-1 transition-all"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-bitcoin/[0.04] via-transparent to-nostr/[0.04] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                  <div className="relative p-6 flex flex-col flex-1">
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono tracking-widest text-foreground-subtle">
                          #{String(h.number).padStart(2, "0")}
                        </span>
                        <span
                          className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded-full border text-[9px] font-mono font-semibold tracking-widest",
                            statusMeta.className,
                          )}
                        >
                          {statusMeta.label}
                        </span>
                      </div>
                      <div className="text-3xl leading-none">{h.icon}</div>
                    </div>

                    <div>
                      <div className="flex items-baseline gap-1.5">
                        <h2 className="font-display text-2xl font-bold tracking-tight">
                          {h.name}
                        </h2>
                      </div>
                      <p className="mt-1 text-xs font-mono text-foreground-muted uppercase tracking-widest">
                        {h.focus}
                      </p>
                    </div>

                    <p className="mt-3 text-sm text-foreground-muted leading-relaxed line-clamp-3 flex-1">
                      {h.description}
                    </p>

                    <div className="mt-5 flex flex-wrap gap-1.5">
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded-md border text-[10px] font-mono font-semibold uppercase tracking-wider",
                          DIFFICULTY_STYLE[h.difficulty] ??
                            "bg-white/5 text-foreground-muted border-border",
                        )}
                      >
                        {"★".repeat(h.stars)} {h.difficulty}
                      </span>
                      {h.tags.map((t) => (
                        <span
                          key={t}
                          className="px-2 py-0.5 rounded-md border border-border bg-white/[0.03] text-[10px] font-mono font-semibold uppercase tracking-wider text-foreground-muted"
                        >
                          {t}
                        </span>
                      ))}
                    </div>

                    <div className="mt-6 pt-5 border-t border-border flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 text-foreground-muted">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>
                          {h.month} {h.year}
                        </span>
                        {firstDate && lastDate && (
                          <span className="text-foreground-subtle">
                            · {firstDate.slice(8, 10)}–{lastDate.slice(8, 10)}
                          </span>
                        )}
                      </div>
                      <ArrowRight className="h-4 w-4 text-foreground-muted group-hover:text-bitcoin group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="mt-12 rounded-2xl border border-border bg-background-card p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row gap-6">
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-mono tracking-widest text-foreground-subtle mb-2">
                  ESTRUCTURA DE PREMIOS · POR HACKATÓN
                </div>
                <h3 className="font-display text-xl font-bold mb-1">
                  {formatSats(PROGRAM.prizePerHackathon)} sats repartidos entre
                  los mejores 6 proyectos
                </h3>
                <p className="text-sm text-foreground-muted">
                  Evaluación por jurado AI. Ties se parten según criterio del
                  comité.
                </p>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 self-stretch">
                {PROGRAM.prizeDistribution.map((slot) => (
                  <div
                    key={slot.position}
                    className="rounded-xl border border-border bg-background-elevated/50 p-3 flex flex-col items-center justify-center text-center"
                  >
                    <div className="text-xs font-mono text-foreground-subtle">
                      {slot.position}°
                    </div>
                    <div className="text-sm font-display font-bold tabular-nums mt-1">
                      {formatSats(slot.sats)}
                    </div>
                    <div className="text-[9px] font-mono text-foreground-subtle">
                      sats
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {PROGRAM.youtube && (
              <a
                href={PROGRAM.youtube}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-flex items-center gap-2 text-sm text-foreground-muted hover:text-foreground transition-colors"
              >
                <CirclePlay className="h-4 w-4" />
                Mirá las Community Calls en {PROGRAM.organization} YouTube
              </a>
            )}
          </div>
        </div>
      </section>
    </>
  );
}

function StatTile({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-background-card p-4">
      <div
        className={cn(
          "inline-flex items-center gap-1 text-[10px] font-mono tracking-widest mb-2",
          accent,
        )}
      >
        {icon}
        {label}
      </div>
      <div className="font-display text-xl font-bold tracking-tight">
        {value}
      </div>
    </div>
  );
}
