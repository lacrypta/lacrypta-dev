import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Trophy,
  CirclePlay,
  ExternalLink,
  Zap,
  Sparkles,
  Users,
} from "lucide-react";
import {
  HACKATHONS,
  PROGRAM,
  formatSats,
  getHackathon,
  hackathonStatus,
  prizedProjects,
  programRules,
  rankedProjects,
} from "@/lib/hackathons";
import { cn } from "@/lib/cn";
import HackathonProjectsList from "./HackathonProjectsList";
import HackathonInscripcionButton from "@/components/HackathonInscripcionButton";

export function generateStaticParams() {
  return HACKATHONS.map((h) => ({ id: h.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const h = getHackathon(id);
  if (!h) return { title: "Hackatón" };
  return {
    title: `${h.name} · Hackatón #${h.number}`,
    description: `${h.focus}. ${h.description}`,
  };
}

const EVENT_STYLE: Record<string, { label: string; color: string }> = {
  apertura: { label: "Apertura", color: "text-success border-success/30" },
  pitch: { label: "Pitches", color: "text-cyan border-cyan/30" },
  "pitch-final": {
    label: "Pitch Final",
    color: "text-lightning border-lightning/30",
  },
  cierre: { label: "Cierre", color: "text-nostr border-nostr/30" },
  premios: { label: "Premios", color: "text-bitcoin border-bitcoin/30" },
};

const STATUS_META: Record<
  "upcoming" | "active" | "closed",
  { label: string; color: string }
> = {
  upcoming: { label: "PRÓXIMO", color: "text-foreground-muted bg-white/5" },
  active: { label: "EN CURSO", color: "text-success bg-success/10" },
  closed: { label: "CERRADO", color: "text-bitcoin bg-bitcoin/10" },
};

const STATUS_BADGE: Record<string, string> = {
  official: "bg-bitcoin/10 border-bitcoin/40 text-bitcoin",
  winner: "bg-lightning/10 border-lightning/40 text-lightning",
  finalist: "bg-cyan/10 border-cyan/40 text-cyan",
  submitted: "bg-nostr/10 border-nostr/30 text-nostr",
  building: "bg-white/5 border-border text-foreground-muted",
  idea: "bg-white/5 border-border text-foreground-subtle",
};

function medal(position: number | null): string {
  if (position === 1) return "🥇";
  if (position === 2) return "🥈";
  if (position === 3) return "🥉";
  if (!position) return "";
  return `#${position}`;
}

export default async function HackathonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const hackathon = getHackathon(id);
  if (!hackathon) notFound();
  const status = hackathonStatus(hackathon);
  const statusMeta = STATUS_META[status];
  const projects = rankedProjects(id);
  const total = projects.length;
  const hasReports = projects.some((p) => p.report);
  const awards = prizedProjects(id);
  const prizeByProjectId = new Map(
    awards.map((a) => [a.project.id, a] as const),
  );

  return (
    <div className="relative">
      {/* Hero */}
      <section className="relative pt-28 pb-16 overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-bitcoin/10 blur-[120px] rounded-full" />
          <div className="absolute top-32 left-0 w-[400px] h-[400px] bg-nostr/10 blur-[120px] rounded-full" />
        </div>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link
            href="/hackathons"
            className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-widest text-foreground-muted hover:text-foreground transition-colors mb-6"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Todos los hackatones
          </Link>
          <div className="flex items-start gap-4 flex-wrap">
            <div className="text-7xl leading-none shrink-0">{hackathon.icon}</div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="text-[10px] font-mono tracking-widest text-foreground-subtle">
                  HACKATÓN #{String(hackathon.number).padStart(2, "0")} ·{" "}
                  {hackathon.monthShort} {hackathon.year}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-mono font-semibold tracking-widest",
                    statusMeta.color,
                  )}
                >
                  {statusMeta.label}
                </span>
              </div>
              <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight">
                {hackathon.name}
              </h1>
              <p className="mt-2 text-lg text-foreground-muted">
                {hackathon.focus}
              </p>
              <p className="mt-4 text-base text-foreground leading-relaxed max-w-2xl">
                {hackathon.description}
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-nostr/30 bg-nostr/10 text-xs font-mono font-semibold tracking-wider text-nostr">
                  {"★".repeat(hackathon.stars)} {hackathon.difficulty}
                </span>
                {hackathon.tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center px-2.5 py-1 rounded-full border border-border bg-white/[0.03] text-xs font-mono font-semibold tracking-wider text-foreground-muted"
                  >
                    {t}
                  </span>
                ))}
              </div>
              {status !== "closed" && (
                <div className="mt-6">
                  <HackathonInscripcionButton hackathonId={hackathon.id} />
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="pb-12">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Dates timeline */}
          <div className="lg:col-span-2 space-y-6">
            <Card
              title="Calendario"
              icon={<Calendar className="h-4 w-4" />}
              subtitle={`${hackathon.dates.length} community calls`}
            >
              <ol className="relative border-l border-border pl-6 space-y-5">
                {hackathon.dates.map((d) => {
                  const style = EVENT_STYLE[d.type];
                  return (
                    <li key={d.date} className="relative">
                      <span
                        className={cn(
                          "absolute -left-[30px] top-1.5 h-3 w-3 rounded-full border-2 bg-background",
                          style?.color ?? "border-border",
                        )}
                      />
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="text-xs font-mono font-bold tabular-nums">
                          {d.date.slice(8, 10)} {hackathon.monthShort}
                        </span>
                        {style && (
                          <span
                            className={cn(
                              "inline-flex items-center px-1.5 py-0.5 rounded-full border text-[9px] font-mono font-semibold tracking-widest",
                              style.color,
                            )}
                          >
                            {style.label}
                          </span>
                        )}
                        {d.youtube && (
                          <a
                            href={d.youtube}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] font-mono text-danger hover:text-danger/80 transition-colors"
                          >
                            <CirclePlay className="h-3 w-3" />
                            VIDEO
                          </a>
                        )}
                      </div>
                      <div className="text-sm font-semibold">{d.title}</div>
                      <p className="text-xs text-foreground-muted mt-1 max-w-xl leading-relaxed">
                        {d.description}
                      </p>
                    </li>
                  );
                })}
              </ol>
            </Card>

            {hackathon.topics.length > 0 && (
              <Card
                title="Temas"
                icon={<Sparkles className="h-4 w-4" />}
                subtitle={`${hackathon.topics.length} áreas`}
              >
                <div className="flex flex-wrap gap-2">
                  {hackathon.topics.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center px-3 py-1.5 rounded-lg border border-border bg-white/[0.03] text-sm"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </Card>
            )}
          </div>

          {/* Prize distribution */}
          <div className="space-y-6">
            <Card
              title="Premios"
              icon={<Trophy className="h-4 w-4" />}
              subtitle={`${formatSats(PROGRAM.prizePerHackathon)} sats`}
            >
              {awards.length > 0 ? (
                <ol className="space-y-2">
                  {awards.map((a) => (
                    <li key={a.project.id}>
                      <Link
                        href={`/hackathons/${hackathon.id}/${a.project.id}`}
                        className={cn(
                          "group flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors",
                          a.position === 1
                            ? "bg-bitcoin/10 border-bitcoin/30 hover:bg-bitcoin/15"
                            : "bg-white/[0.02] border-border hover:bg-white/[0.05]",
                        )}
                      >
                        <span className="text-lg leading-none shrink-0 w-7 text-center">
                          {medal(a.position) || (
                            <span className="text-xs font-mono text-foreground-muted">
                              #{a.position}
                            </span>
                          )}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-semibold truncate group-hover:text-bitcoin transition-colors">
                            {a.project.name}
                          </div>
                          <div className="text-[10px] font-mono text-foreground-subtle flex items-center gap-1.5">
                            <span className="tabular-nums">
                              {formatSats(a.prize)} sats
                            </span>
                            {a.tied && (
                              <span className="px-1 rounded bg-lightning/10 text-lightning border border-lightning/30 text-[9px] tracking-widest uppercase">
                                empate
                              </span>
                            )}
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ol>
              ) : (
                <ol className="space-y-2">
                  {PROGRAM.prizeDistribution.map((slot) => (
                    <li
                      key={slot.position}
                      className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.02] border border-border"
                    >
                      <span className="text-sm font-mono text-foreground-muted">
                        {medal(slot.position) || `#${slot.position}`}
                      </span>
                      <span className="text-sm font-bold tabular-nums">
                        {formatSats(slot.sats)} sats
                      </span>
                    </li>
                  ))}
                </ol>
              )}
              {awards.some((a) => a.tied) && (
                <p className="mt-3 text-[10px] font-mono text-foreground-subtle leading-relaxed">
                  * Los premios de posiciones empatadas se dividen en partes
                  iguales.
                </p>
              )}
            </Card>

            <Card
              title="Participación"
              icon={<Users className="h-4 w-4" />}
              subtitle="Reglas básicas"
            >
              <ul className="space-y-2 text-sm text-foreground-muted">
                {programRules().map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      </section>

      {/* Projects / leaderboard (curated + Nostr submissions) */}
      <HackathonProjectsList hackathon={hackathon} />
    </div>
  );
}

function Card({
  title,
  icon,
  subtitle,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background-card p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-foreground-muted">{icon}</span>
          <h3 className="font-display font-bold text-sm uppercase tracking-widest text-foreground-muted">
            {title}
          </h3>
        </div>
        {subtitle && (
          <span className="text-[10px] font-mono text-foreground-subtle">
            {subtitle}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
