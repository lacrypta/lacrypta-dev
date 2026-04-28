"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Users, CircleDashed, Zap } from "lucide-react";
import {
  fetchProjectByDTag,
  fetchAuthorPictures,
  TOP10_RELAYS,
  type UserProject,
} from "@/lib/userProjects";
import { GithubIcon } from "@/components/BrandIcons";
import { cn } from "@/lib/cn";

const STATUS_BADGE: Record<string, string> = {
  official: "bg-bitcoin/10 border-bitcoin/40 text-bitcoin",
  winner:   "bg-lightning/10 border-lightning/40 text-lightning",
  finalist: "bg-cyan/10 border-cyan/40 text-cyan",
  submitted:"bg-nostr/10 border-nostr/30 text-nostr",
  building: "bg-white/5 border-border text-foreground-muted",
  idea:     "bg-white/5 border-border text-foreground-subtle",
};

export default function StandaloneProjectPage({
  pubkey,
  projectId,
}: {
  pubkey: string;
  projectId: string;
}) {
  const [project, setProject] = useState<UserProject | null | undefined>(undefined);
  const [authorPicture, setAuthorPicture] = useState<string | undefined>();

  useEffect(() => {
    fetchProjectByDTag(pubkey, projectId, TOP10_RELAYS).then((p) => {
      setProject(p);
      if (p) {
        fetchAuthorPictures([pubkey], TOP10_RELAYS).then((pics) =>
          setAuthorPicture(pics.get(pubkey)),
        );
      }
    });
  }, [pubkey, projectId]);

  const backHref = project?.hackathon ? `/hackathons/${project.hackathon}` : "/projects";
  const backLabel = project?.hackathon ? project.hackathon.toUpperCase() : "Proyectos";

  if (project === undefined) {
    return (
      <div className="relative pt-24 pb-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link
            href="/projects"
            className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-widest text-foreground-muted hover:text-foreground transition-colors mb-6"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Proyectos
          </Link>
          <div className="animate-pulse space-y-4 mt-8">
            <div className="h-8 bg-white/5 rounded-lg w-64" />
            <div className="h-4 bg-white/5 rounded w-full max-w-lg" />
            <div className="h-4 bg-white/5 rounded w-3/4 max-w-md" />
          </div>
        </div>
      </div>
    );
  }

  if (project === null) {
    return (
      <div className="relative pt-24 pb-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link
            href="/projects"
            className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-widest text-foreground-muted hover:text-foreground transition-colors mb-6"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Proyectos
          </Link>
          <p className="mt-8 text-sm text-foreground-muted">
            Proyecto no encontrado en los relays.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative pt-24 pb-16">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-widest text-foreground-muted hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {backLabel}
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-8">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span
                className={cn(
                  "inline-flex items-center px-2 py-0.5 rounded-full border text-[9px] font-mono font-semibold tracking-widest uppercase",
                  STATUS_BADGE[project.status] ??
                    "bg-white/5 text-foreground-muted border-border",
                )}
              >
                {project.status}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-nostr/30 bg-nostr/10 text-[9px] font-mono font-semibold tracking-widest text-nostr">
                <Zap className="h-2.5 w-2.5" />
                NOSTR
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
            </div>

            {project.tech && project.tech.length > 0 && (
              <div className="mt-6 rounded-xl border border-border bg-background-card p-5 lg:hidden">
                <div className="flex flex-wrap gap-1.5">
                  {project.tech.map((t) => (
                    <span key={t} className="px-2 py-0.5 rounded-md border border-border bg-white/[0.03] text-[10px] font-mono text-foreground-muted">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 rounded-xl border border-nostr/20 bg-nostr/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <CircleDashed className="h-3.5 w-3.5 text-nostr" />
                <span className="text-[10px] font-mono uppercase tracking-widest text-nostr">
                  Firmado en Nostr · kind:30078
                </span>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-mono text-foreground-subtle break-all">
                  <span className="text-foreground-muted">pubkey </span>{pubkey}
                </p>
                <p className="text-[10px] font-mono text-foreground-subtle break-all">
                  <span className="text-foreground-muted">d </span>lacrypta.labs:project:{projectId}
                </p>
              </div>
            </div>
          </div>

          <aside className="space-y-4">
            {project.tech && project.tech.length > 0 && (
              <div className="hidden lg:block rounded-2xl border border-border bg-background-card p-5">
                <div className="text-[10px] font-mono uppercase tracking-widest text-foreground-muted mb-3">Stack</div>
                <div className="flex flex-wrap gap-1.5">
                  {project.tech.map((t) => (
                    <span key={t} className="px-2 py-0.5 rounded-md border border-border bg-white/[0.03] text-[10px] font-mono text-foreground-muted">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-border bg-background-card p-5">
              <div className="flex items-center gap-2 mb-3">
                <Users className="h-4 w-4 text-foreground-muted" />
                <h2 className="text-xs font-mono uppercase tracking-widest text-foreground-muted font-bold">Equipo</h2>
              </div>
              {project.team.length === 0 ? (
                <p className="text-xs text-foreground-subtle">Sin equipo cargado.</p>
              ) : (
                <ul className="space-y-2">
                  {project.team.map((m, i) => {
                    const pic = i === 0 ? (authorPicture ?? m.picture) : m.picture;
                    return (
                      <li key={`${m.name}-${m.role}`} className="flex items-center gap-2.5">
                        {pic ? (
                          <img
                            src={pic}
                            alt=""
                            className="h-8 w-8 rounded-full object-cover ring-1 ring-nostr/40 shrink-0"
                            onError={(e) => { e.currentTarget.style.display = "none"; }}
                          />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-nostr/30 to-bitcoin/30 ring-1 ring-border-strong flex items-center justify-center text-xs font-display font-bold shrink-0">
                            {m.name.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold truncate">{m.name}</div>
                          <div className="text-[10px] font-mono text-foreground-subtle">{m.role}</div>
                        </div>
                        {m.github && (
                          <a href={`https://github.com/${m.github}`} target="_blank" rel="noopener noreferrer" className="shrink-0 text-foreground-subtle hover:text-foreground">
                            <GithubIcon className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
