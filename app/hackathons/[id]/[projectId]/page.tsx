import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  ExternalLink,
  Trophy,
  CirclePlay,
  Users,
  FlaskConical,
  Lightbulb,
  AlertTriangle,
} from "lucide-react";
import {
  HACKATHONS,
  formatSats,
  getHackathon,
  getProject,
  getHackathonProjects,
  hackathonSlug,
  hackathonSlugForId,
  prizeForProject,
} from "@/lib/hackathons";
import { GithubIcon } from "@/components/BrandIcons";
import { cn } from "@/lib/cn";
import { breadcrumbLd, creativeWorkLd, jsonLdScript } from "@/lib/jsonld";
import {
  getNostrProject,
  getNostrSubmissionsSnapshot,
} from "@/lib/nostrCache";
import {
  dedupeSoldierProfileMembers,
  soldierProfileHref,
} from "@/lib/soldierProfileLinks";
import NostrProjectServer from "./NostrProjectServer";

export async function generateStaticParams() {
  const hackathonIds = new Set(HACKATHONS.map((h) => h.id));
  // Dedup keys off the canonical hackathon id; the emitted route segment is the
  // public slug (e.g. "gaming" for the "zaps" hackathon).
  const seen = new Set<string>();
  const out: { id: string; projectId: string }[] = [];

  for (const h of HACKATHONS) {
    for (const p of getHackathonProjects(h.id)) {
      const key = `${h.id}/${p.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ id: hackathonSlug(h), projectId: p.id });
    }
  }

  // Prerender every Nostr-submitted project visible at build time. Without
  // this, community-only projects (no curated JSON entry) 404 in production
  // because the dynamic fallback never gets a chance to run.
  const { projects } = await getNostrSubmissionsSnapshot();
  for (const p of projects) {
    if (!p.hackathon || !hackathonIds.has(p.hackathon)) continue;
    const key = `${p.hackathon}/${p.id}`;
    if (seen.has(key)) continue; // dedup vs curated AND other community events
    seen.add(key);
    out.push({ id: hackathonSlugForId(p.hackathon), projectId: p.id });
  }

  return out;
}

function truncate(s: string, max = 155): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; projectId: string }>;
}): Promise<Metadata> {
  await connection();
  const { id: routeParam, projectId } = await params;
  const h = getHackathon(routeParam);
  if (!h) return { title: "Proyecto" };
  // Data lookups key off the canonical id; the public URL uses the slug.
  const id = h.id;

  const curated = getProject(id, projectId);
  let name: string | null = null;
  let description = "";

  if (curated) {
    name = curated.name;
    description = curated.description;
  } else {
    const fromNostr = await getNostrProject(id, projectId);
    if (fromNostr) {
      name = fromNostr.name;
      description = fromNostr.description;
    }
  }

  if (!name) return { title: "Proyecto" };

  const url = `/hackathons/${hackathonSlug(h)}/${projectId}`;
  const desc = truncate(description || `Proyecto presentado en ${h.name}.`);
  return {
    title: `${name} · ${h.name}`,
    description: desc,
    alternates: { canonical: url },
    openGraph: {
      title: `${name} · ${h.name}`,
      description: desc,
      url,
      type: "article",
    },
    twitter: {
      title: `${name} · ${h.name}`,
      description: desc,
    },
  };
}

function medal(position: number | null | undefined): string {
  if (position === 1) return "🥇";
  if (position === 2) return "🥈";
  if (position === 3) return "🥉";
  return "";
}

const STATUS_BADGE: Record<string, string> = {
  official: "bg-bitcoin/10 border-bitcoin/40 text-bitcoin",
  winner: "bg-lightning/10 border-lightning/40 text-lightning",
  finalist: "bg-cyan/10 border-cyan/40 text-cyan",
  submitted: "bg-nostr/10 border-nostr/30 text-nostr",
  building: "bg-white/5 border-border text-foreground-muted",
  idea: "bg-white/5 border-border text-foreground-subtle",
};

type ProjectPageParams = {
  id: string;
  projectId: string;
};

export default function ProjectPage({
  params,
}: {
  params: Promise<ProjectPageParams>;
}) {
  return (
    <Suspense fallback={<ProjectPageFallback />}>
      <ProjectPageContent params={params} />
    </Suspense>
  );
}

function ProjectPageFallback() {
  return (
    <div className="relative pt-24 pb-16">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="h-4 w-36 rounded bg-white/5 mb-8" />
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-8 animate-pulse">
          <div className="min-w-0 space-y-6">
            <div className="flex items-center gap-2">
              <div className="h-4 w-28 rounded-full bg-white/5" />
              <div className="h-4 w-16 rounded-full bg-white/5" />
            </div>
            <div className="space-y-2">
              <div className="h-10 w-3/4 rounded-lg bg-white/5" />
              <div className="h-10 w-1/2 rounded-lg bg-white/5" />
            </div>
            <div className="space-y-2">
              <div className="h-4 w-full rounded bg-white/5" />
              <div className="h-4 w-[92%] rounded bg-white/5" />
              <div className="h-4 w-4/5 rounded bg-white/5" />
            </div>
          </div>
          <aside className="space-y-4">
            <div className="rounded-2xl border border-border bg-background-card p-5 space-y-3">
              <div className="h-3 w-10 rounded bg-white/5" />
              <div className="flex flex-wrap gap-1.5">
                {[44, 60, 52, 36, 56].map((w) => (
                  <div
                    key={w}
                    className="h-5 rounded-md bg-white/5"
                    style={{ width: w }}
                  />
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-background-card p-5 space-y-4">
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

async function ProjectPageContent({
  params,
}: {
  params: Promise<ProjectPageParams>;
}) {
  await connection();
  const { id: routeParam, projectId } = await params;
  const hackathon = getHackathon(routeParam);
  if (!hackathon) notFound();
  // Data lookups key off the canonical id; public links use the slug.
  const id = hackathon.id;
  const project = getProject(id, projectId);
  if (!project) {
    return <NostrProjectServer hackathonId={id} projectId={projectId} />;
  }

  const report = project.report;
  const award = prizeForProject(id, projectId);
  const prize = award?.prize ?? null;
  const team = dedupeSoldierProfileMembers(project.team);

  return (
    <div className="relative pt-24 pb-16">
      {jsonLdScript(creativeWorkLd(project, hackathon), "ld-project")}
      {jsonLdScript(
        breadcrumbLd([
          { name: "Inicio", url: "https://lacrypta.dev" },
          { name: "Hackatones", url: "https://lacrypta.dev/hackathons" },
          {
            name: hackathon.name,
            url: `https://lacrypta.dev/hackathons/${hackathonSlug(hackathon)}`,
          },
          {
            name: project.name,
            url: `https://lacrypta.dev/hackathons/${hackathonSlug(hackathon)}/${project.id}`,
          },
        ]),
        "ld-breadcrumbs",
      )}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <Link
          href={`/hackathons/${hackathonSlug(hackathon)}`}
          className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-widest text-foreground-muted hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {hackathon.name}
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-8">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="text-[10px] font-mono tracking-widest text-foreground-subtle">
                {hackathon.icon} {hackathon.name} · {hackathon.monthShort}{" "}
                {hackathon.year}
              </span>
              <span
                className={cn(
                  "inline-flex items-center px-2 py-0.5 rounded-full border text-[9px] font-mono font-semibold tracking-widest uppercase",
                  STATUS_BADGE[project.status] ??
                    "bg-white/5 text-foreground-muted border-border",
                )}
              >
                {project.status}
              </span>
            </div>

            <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight leading-tight">
              {project.name}
            </h1>
            <p className="mt-4 text-base text-foreground-muted leading-relaxed">
              {project.description}
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              {project.repo && (
                <a
                  href={project.repo}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-white/[0.03] hover:bg-white/[0.06] text-xs font-semibold transition-colors"
                >
                  <GithubIcon className="h-3.5 w-3.5" />
                  Repo
                </a>
              )}
              {project.demo && (
                <a
                  href={project.demo}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-white/[0.03] hover:bg-white/[0.06] text-xs font-semibold transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Demo
                </a>
              )}
              {project.pitched && (
                <a
                  href={project.pitched}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-danger/30 bg-danger/10 hover:bg-danger/20 text-xs font-semibold text-danger transition-colors"
                >
                  <CirclePlay className="h-3.5 w-3.5" />
                  Pitch
                </a>
              )}
              {project.pitched_final && (
                <a
                  href={project.pitched_final}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-danger/30 bg-danger/10 hover:bg-danger/20 text-xs font-semibold text-danger transition-colors"
                >
                  <CirclePlay className="h-3.5 w-3.5" />
                  Pitch Final
                </a>
              )}
            </div>

            {report?.position != null && (
              <div className="mt-6 rounded-2xl border border-bitcoin/40 bg-gradient-to-br from-bitcoin/10 via-transparent to-nostr/5 overflow-hidden">
                <div className="flex flex-col sm:flex-row items-stretch divide-y sm:divide-y-0 sm:divide-x divide-border/60">
                  <div className="flex items-center gap-4 px-5 py-4 flex-1 min-w-0">
                    <div className="shrink-0 text-5xl leading-none">
                      {medal(report.position) || `#${report.position}`}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] font-mono uppercase tracking-widest text-foreground-subtle">
                        POSICIÓN FINAL
                      </div>
                      <div className="font-display text-2xl font-bold leading-tight">
                        {report.position === 1
                          ? "1° — Ganador"
                          : report.position === 2
                            ? "2° lugar"
                            : report.position === 3
                              ? "3° lugar"
                              : `#${report.position} en el ranking`}
                      </div>
                      {award?.tied && (
                        <div className="text-[10px] font-mono text-foreground-subtle mt-0.5">
                          Empate con {award.tiedWith - 1} proyecto
                          {award.tiedWith - 1 === 1 ? "" : "s"}
                        </div>
                      )}
                    </div>
                  </div>

                  {report.finalScore != null && (
                    <div className="flex flex-col items-center justify-center px-5 py-4 min-w-[110px]">
                      <div className="text-[10px] font-mono uppercase tracking-widest text-foreground-subtle">
                        Score
                      </div>
                      <div className="font-display text-3xl font-bold tabular-nums">
                        {report.finalScore.toFixed(2)}
                      </div>
                    </div>
                  )}

                  {prize != null && (
                    <div className="flex flex-col items-center justify-center px-5 py-4 min-w-[150px] bg-bitcoin/[0.06]">
                      <div className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-bitcoin/80">
                        <Trophy className="h-3 w-3" />
                        Premio
                      </div>
                      <div className="font-display text-3xl font-bold text-bitcoin tabular-nums">
                        {formatSats(prize)}
                      </div>
                      <div className="text-[10px] font-mono text-bitcoin/70">
                        sats
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {project.tech && project.tech.length > 0 && (
              <div className="mt-6 rounded-xl border border-border bg-background-card p-5 lg:hidden">
                <StackCardBody tech={project.tech} />
              </div>
            )}

            {report && (
              <>
                <div className="mt-6 rounded-xl border border-border bg-background-card overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                    <div className="flex items-center gap-2">
                      <Trophy className="h-4 w-4 text-bitcoin" />
                      <h2 className="text-xs font-mono uppercase tracking-widest font-bold">
                        Jurado AI
                      </h2>
                    </div>
                    {report.finalScore != null && (
                      <span className="text-sm font-mono tabular-nums">
                        promedio ·{" "}
                        <span className="font-bold text-foreground">
                          {report.finalScore.toFixed(2)}
                        </span>
                      </span>
                    )}
                  </div>
                  <div className="divide-y divide-border">
                    {report.judges.map((j) => (
                      <div key={j.name} className="px-5 py-4">
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <div>
                            <div className="font-display font-bold text-sm">
                              {j.name}
                            </div>
                            {j.model && (
                              <div className="text-[10px] font-mono text-foreground-subtle">
                                {j.model}
                              </div>
                            )}
                          </div>
                          {j.score != null && (
                            <span className="font-mono text-base font-bold tabular-nums">
                              {j.score.toFixed(2)}
                            </span>
                          )}
                        </div>
                        {j.categories.length > 0 && (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
                            {j.categories.map((c) => (
                              <div
                                key={c.name}
                                className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-border text-xs"
                              >
                                <span className="text-foreground-muted truncate">
                                  {c.name}
                                </span>
                                <span className="font-mono font-bold tabular-nums">
                                  {c.score}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                        {j.summary && (
                          <p className="text-xs text-foreground-muted leading-relaxed whitespace-pre-wrap">
                            {j.summary}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {(report.feedback.strengths.length > 0 ||
                  report.feedback.improvements.length > 0) && (
                  <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {report.feedback.strengths.length > 0 && (
                      <FeedbackList
                        title="Fortalezas"
                        icon={<Lightbulb className="h-4 w-4 text-success" />}
                        items={report.feedback.strengths}
                        accent="border-success/30"
                      />
                    )}
                    {report.feedback.improvements.length > 0 && (
                      <FeedbackList
                        title="Áreas de Mejora"
                        icon={
                          <AlertTriangle className="h-4 w-4 text-lightning" />
                        }
                        items={report.feedback.improvements}
                        accent="border-lightning/30"
                      />
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          <aside className="space-y-4">
            {project.tech && project.tech.length > 0 && (
              <div className="hidden lg:block rounded-2xl border border-border bg-background-card p-5">
                <StackCardBody tech={project.tech} />
              </div>
            )}

            <div className="rounded-2xl border border-border bg-background-card p-5">
              <div className="flex items-center gap-2 mb-3">
                <Users className="h-4 w-4 text-foreground-muted" />
                <h2 className="text-xs font-mono uppercase tracking-widest text-foreground-muted font-bold">
                  Equipo
                </h2>
              </div>
              {team.length === 0 ? (
                <p className="text-xs text-foreground-subtle">Sin equipo cargado.</p>
              ) : (
                <ul className="space-y-2">
                  {team.map((m) => {
                    const profileHref = soldierProfileHref(m);
                    const memberContent = (
                      <>
                        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-bitcoin/30 to-nostr/30 ring-1 ring-border-strong flex items-center justify-center text-xs font-display font-bold shrink-0">
                          {m.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold truncate transition-colors group-hover/member:text-nostr">
                            {m.name}
                          </div>
                          <div className="text-[10px] font-mono text-foreground-subtle">
                            {m.role}
                            {m.github && (
                              <>
                                {" · "}
                                <span className="text-foreground-muted">
                                  @{m.github}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </>
                    );

                    return (
                      <li
                        key={`${m.name}-${m.role}`}
                        className="flex items-center gap-2.5"
                      >
                        {profileHref ? (
                          <Link
                            href={profileHref}
                            className="-m-1.5 flex min-w-0 flex-1 items-center gap-2.5 rounded-xl p-1.5 transition-colors hover:bg-white/[0.04] group/member"
                            aria-label={`Ver perfil de ${m.name}`}
                          >
                            {memberContent}
                          </Link>
                        ) : (
                          <div className="flex min-w-0 flex-1 items-center gap-2.5">
                            {memberContent}
                          </div>
                        )}
                        {m.github && (
                          <a
                            href={`https://github.com/${m.github}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 text-foreground-subtle hover:text-foreground"
                            aria-label={`GitHub de ${m.name}`}
                          >
                            <GithubIcon className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {project.submittedAt && (
              <div className="rounded-2xl border border-border bg-background-card p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="h-4 w-4 text-foreground-muted" />
                  <h2 className="text-xs font-mono uppercase tracking-widest text-foreground-muted font-bold">
                    Inscripción
                  </h2>
                </div>
                <div className="text-sm font-mono tabular-nums">
                  {project.submittedAt}
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

function StackCardBody({ tech }: { tech: string[] }) {
  return (
    <>
      <div className="flex items-center gap-2 mb-3">
        <FlaskConical className="h-4 w-4 text-foreground-muted" />
        <h2 className="text-xs font-mono uppercase tracking-widest text-foreground-muted font-bold">
          Stack
        </h2>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {tech.map((t) => (
          <span
            key={t}
            className="px-2 py-0.5 rounded-md border border-border bg-white/[0.03] text-[10px] font-mono text-foreground-muted"
          >
            {t}
          </span>
        ))}
      </div>
    </>
  );
}

function FeedbackList({
  title,
  icon,
  items,
  accent,
}: {
  title: string;
  icon: React.ReactNode;
  items: string[];
  accent: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-background-card p-5",
        accent,
      )}
    >
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h3 className="text-xs font-mono uppercase tracking-widest font-bold">
          {title}
        </h3>
      </div>
      <ul className="space-y-2 text-xs text-foreground-muted leading-relaxed">
        {items.map((t, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-foreground-subtle">›</span>
            <span className="flex-1">{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
