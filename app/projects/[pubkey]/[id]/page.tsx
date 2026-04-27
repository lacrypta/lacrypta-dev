"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ExternalLink,
  Users,
  FlaskConical,
  Loader2,
} from "lucide-react";
import { fetchUserProjects, type UserProject } from "@/lib/userProjects";
import { GithubIcon } from "@/components/BrandIcons";
import { cn } from "@/lib/cn";

const STATUS_BADGE: Record<string, string> = {
  official: "bg-bitcoin/10 border-bitcoin/40 text-bitcoin",
  winner: "bg-lightning/10 border-lightning/40 text-lightning",
  finalist: "bg-cyan/10 border-cyan/40 text-cyan",
  submitted: "bg-nostr/10 border-nostr/30 text-nostr",
  building: "bg-white/5 border-border text-foreground-muted",
  idea: "bg-white/5 border-border text-foreground-subtle",
};

export default function PublicProjectPage() {
  const { pubkey, id } = useParams<{ pubkey: string; id: string }>();
  const [project, setProject] = useState<UserProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetchUserProjects(pubkey)
      .then((doc) => {
        const found = doc.projects.find((p) => p.id === id);
        if (found) setProject(found);
        else setNotFound(true);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [pubkey, id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-foreground-muted" />
      </div>
    );
  }

  if (notFound || !project) {
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
          <p className="text-foreground-muted">Proyecto no encontrado.</p>
        </div>
      </div>
    );
  }

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

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-8">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="text-[10px] font-mono tracking-widest text-foreground-subtle">
                NIP-78 · KIND 30078
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

            {project.description && (
              <p className="mt-4 text-base text-foreground-muted leading-relaxed">
                {project.description}
              </p>
            )}

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
                <StackCard tech={project.tech} />
              </div>
            )}
          </div>

          <aside className="space-y-4">
            {project.tech && project.tech.length > 0 && (
              <div className="hidden lg:block rounded-2xl border border-border bg-background-card p-5">
                <StackCard tech={project.tech} />
              </div>
            )}

            {project.team && project.team.length > 0 && (
              <div className="rounded-2xl border border-border bg-background-card p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Users className="h-4 w-4 text-foreground-muted" />
                  <h2 className="text-xs font-mono uppercase tracking-widest text-foreground-muted font-bold">
                    Equipo
                  </h2>
                </div>
                <ul className="space-y-2">
                  {project.team.map((m) => (
                    <li
                      key={`${m.name}-${m.role}`}
                      className="flex items-center gap-2.5"
                    >
                      <div className="h-8 w-8 rounded-full bg-gradient-to-br from-bitcoin/30 to-nostr/30 ring-1 ring-border-strong flex items-center justify-center text-xs font-display font-bold shrink-0">
                        {(m.name || "?").slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold truncate">
                          {m.name}
                        </div>
                        <div className="text-[10px] font-mono text-foreground-subtle">
                          {m.role}
                          {m.github && (
                            <>
                              {" · "}
                              <a
                                href={`https://github.com/${m.github}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-foreground-muted hover:text-foreground"
                              >
                                @{m.github}
                              </a>
                            </>
                          )}
                        </div>
                      </div>
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
                  ))}
                </ul>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

function StackCard({ tech }: { tech: string[] }) {
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
