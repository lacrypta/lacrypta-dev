import type { Metadata } from "next";
import Link from "next/link";
import {
  Calendar,
  Zap,
  Trophy,
  CirclePlay,
  ArrowRight,
  Sparkles,
  Radio,
} from "lucide-react";
import PageHero from "@/components/ui/PageHero";
import {
  HACKATHONS,
  PROGRAM,
  formatSats,
  hackathonStatus,
} from "@/lib/hackathons";
import { cn } from "@/lib/cn";
import HackathonInscripcionButton from "@/components/HackathonInscripcionButton";

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
    className: "bg-success/10 text-success border-success/30",
  },
  closed: {
    label: "CERRADO",
    className: "bg-bitcoin/10 text-bitcoin border-bitcoin/30",
  },
};

export default function HackathonsPage() {
  const now = new Date();
  const withStatus = HACKATHONS.map((h) => ({
    h,
    status: hackathonStatus(h, now),
  }));
  const active = withStatus.filter((x) => x.status === "active");
  const upcoming = withStatus.filter((x) => x.status === "upcoming");
  const closed = withStatus.filter((x) => x.status === "closed");

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
          {/* Stats */}
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

          {/* Active hackathon — featured hero card */}
          {active.map(({ h }) => {
            const firstDate = h.dates[0]?.date;
            const lastDate = h.dates[h.dates.length - 1]?.date;
            return (
              <div key={h.id} className="mb-10">
                <div className="flex items-center gap-2 mb-3">
                  <Radio className="h-3.5 w-3.5 text-success animate-pulse" />
                  <span className="text-xs font-mono font-semibold tracking-widest text-success uppercase">
                    Hackatón en curso ahora
                  </span>
                </div>
                <Link
                  href={`/hackathons/${h.id}`}
                  className="group relative flex flex-col sm:flex-row overflow-hidden rounded-2xl border border-success/30 bg-background-card hover:border-success/50 transition-all shadow-[0_0_60px_-12px_theme(colors.success/0.3)] hover:shadow-[0_0_80px_-8px_theme(colors.success/0.4)]"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-success/[0.07] via-transparent to-bitcoin/[0.05] pointer-events-none" />
                  <div className="relative p-8 flex flex-col flex-1 gap-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[10px] font-mono tracking-widest text-foreground-subtle">
                            #{String(h.number).padStart(2, "0")}
                          </span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-success/30 bg-success/10 text-[9px] font-mono font-semibold tracking-widest text-success animate-pulse">
                            ● EN CURSO
                          </span>
                        </div>
                        <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight">
                          {h.name}
                        </h2>
                        <p className="mt-1 text-sm font-mono text-foreground-muted uppercase tracking-widest">
                          {h.focus}
                        </p>
                      </div>
                      <div className="text-6xl leading-none shrink-0">{h.icon}</div>
                    </div>

                    <p className="text-base text-foreground-muted leading-relaxed max-w-2xl">
                      {h.description}
                    </p>

                    <div className="flex flex-wrap gap-2">
                      <span
                        className={cn(
                          "px-2.5 py-1 rounded-lg border text-xs font-mono font-semibold uppercase tracking-wider",
                          DIFFICULTY_STYLE[h.difficulty] ??
                            "bg-white/5 text-foreground-muted border-border",
                        )}
                      >
                        {"★".repeat(h.stars)} {h.difficulty}
                      </span>
                      {h.tags.map((t) => (
                        <span
                          key={t}
                          className="px-2.5 py-1 rounded-lg border border-border bg-white/[0.03] text-xs font-mono font-semibold uppercase tracking-wider text-foreground-muted"
                        >
                          {t}
                        </span>
                      ))}
                    </div>

                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-4 border-t border-border">
                      <div className="flex items-center gap-1.5 text-sm text-foreground-muted">
                        <Calendar className="h-4 w-4" />
                        <span>
                          {h.month} {h.year}
                        </span>
                        {firstDate && lastDate && (
                          <span className="text-foreground-subtle">
                            · {firstDate.slice(8, 10)}–{lastDate.slice(8, 10)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <HackathonInscripcionButton hackathonId={h.id} />
                        <span className="inline-flex items-center gap-1 text-sm font-semibold text-foreground-muted group-hover:text-foreground transition-colors">
                          Ver detalle
                          <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              </div>
            );
          })}

          {/* Upcoming hackathons */}
          {upcoming.length > 0 && (
            <div className="mb-10">
              {upcoming.length > 0 && (
                <h3 className="text-xs font-mono font-semibold tracking-widest text-foreground-muted uppercase mb-4">
                  Próximos
                </h3>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {upcoming.map(({ h, status }) => (
                  <HackathonCard key={h.id} h={h} status={status} />
                ))}
              </div>
            </div>
          )}

          {/* Closed hackathons — dimmed */}
          {closed.length > 0 && (
            <div>
              <h3 className="text-xs font-mono font-semibold tracking-widest text-foreground-subtle uppercase mb-4">
                Anteriores
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 opacity-60 hover:opacity-80 transition-opacity">
                {closed.map(({ h, status }) => (
                  <HackathonCard key={h.id} h={h} status={status} compact />
                ))}
              </div>
            </div>
          )}

          {/* Prize structure */}
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

function HackathonCard({
  h,
  status,
  compact = false,
}: {
  h: (typeof HACKATHONS)[number];
  status: "upcoming" | "active" | "closed";
  compact?: boolean;
}) {
  const statusMeta = STATUS_STYLE[status];
  const firstDate = h.dates[0]?.date;
  const lastDate = h.dates[h.dates.length - 1]?.date;
  return (
    <Link
      href={`/hackathons/${h.id}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-background-card hover:border-border-strong hover:-translate-y-1 transition-all"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-bitcoin/[0.04] via-transparent to-nostr/[0.04] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
      <div className={cn("relative flex flex-col flex-1", compact ? "p-4" : "p-6")}>
        <div className="flex items-center justify-between gap-3 mb-3">
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
          <div className={cn("leading-none", compact ? "text-2xl" : "text-3xl")}>
            {h.icon}
          </div>
        </div>

        <div>
          <h2
            className={cn(
              "font-display font-bold tracking-tight",
              compact ? "text-lg" : "text-2xl",
            )}
          >
            {h.name}
          </h2>
          <p className="mt-0.5 text-xs font-mono text-foreground-muted uppercase tracking-widest">
            {h.focus}
          </p>
        </div>

        {!compact && (
          <p className="mt-3 text-sm text-foreground-muted leading-relaxed line-clamp-3 flex-1">
            {h.description}
          </p>
        )}

        {!compact && (
          <div className="mt-4 flex flex-wrap gap-1.5">
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
        )}

        <div
          className={cn(
            "border-t border-border flex items-center justify-between text-xs",
            compact ? "mt-3 pt-3" : "mt-6 pt-5",
          )}
        >
          <div className="flex items-center gap-1.5 text-foreground-muted">
            <Calendar className="h-3.5 w-3.5" />
            <span>
              {h.monthShort} {h.year}
            </span>
            {!compact && firstDate && lastDate && (
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
