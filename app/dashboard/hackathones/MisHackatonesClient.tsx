"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Trophy, FolderGit2, Loader2, Award } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { isDevMode } from "@/lib/devMode";
import {
  fetchUserProjects,
  getCachedUserProjects,
  type UserProject,
} from "@/lib/userProjects";
import { HACKATHONS, hackathonSlugForId } from "@/lib/hackathons";
import { cn } from "@/lib/cn";

const HACKATHON_NAME = new Map(HACKATHONS.map((h) => [h.id, h.name]));
function hackathonName(id: string): string {
  return HACKATHON_NAME.get(id) ?? id;
}

type Group = { hackathonId: string; projects: UserProject[] };

export default function MisHackatonesClient() {
  const { auth, ready } = useAuth();
  const router = useRouter();
  const [projects, setProjects] = useState<UserProject[]>([]);
  const [loading, setLoading] = useState(true);

  // In dev, an impersonated session reads the impersonated user's projects.
  const readPubkey =
    isDevMode() && auth?.impersonating ? auth.impersonating : auth?.pubkey;

  useEffect(() => {
    if (!ready) return;
    if (!auth) router.replace("/");
  }, [ready, auth, router]);

  useEffect(() => {
    if (!readPubkey) return;
    const cached = getCachedUserProjects(readPubkey);
    if (cached) {
      setProjects(cached.projects);
      setLoading(false);
    }
    let cancelled = false;
    fetchUserProjects(readPubkey)
      .then((doc) => {
        if (!cancelled) setProjects(doc.projects);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [readPubkey]);

  const groups = useMemo<Group[]>(() => {
    const byHackathon = new Map<string, UserProject[]>();
    for (const p of projects) {
      if (!p.hackathon) continue;
      const list = byHackathon.get(p.hackathon) ?? [];
      list.push(p);
      byHackathon.set(p.hackathon, list);
    }
    return [...byHackathon.entries()]
      .map(([hackathonId, ps]) => ({ hackathonId, projects: ps }))
      .sort((a, b) => hackathonName(a.hackathonId).localeCompare(hackathonName(b.hackathonId)));
  }, [projects]);

  const projectsInHackathons = groups.reduce((n, g) => n + g.projects.length, 0);

  return (
    <div className="relative min-h-screen pt-28 pb-20">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al dashboard
        </Link>

        <h1 className="font-display text-3xl font-bold tracking-tight">
          Mis hackatones
        </h1>
        <p className="mt-2 text-sm text-foreground-muted max-w-2xl">
          Los hackatones en los que participaste y con qué proyectos.
          {isDevMode() && auth?.impersonating && (
            <span className="ml-1 text-bitcoin">(usuario impersonado)</span>
          )}
        </p>

        {/* Summary */}
        <div className="mt-6 flex flex-wrap gap-3">
          <SummaryCell label="Hackatones" value={groups.length} icon={<Award className="h-4 w-4 text-bitcoin" />} />
          <SummaryCell label="Proyectos" value={projectsInHackathons} icon={<FolderGit2 className="h-4 w-4 text-nostr" />} />
        </div>

        {loading ? (
          <div className="mt-10 flex items-center gap-2 text-sm text-foreground-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando participaciones…
          </div>
        ) : groups.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-border bg-background-card p-8 text-center">
            <p className="text-sm text-foreground-muted">
              Todavía no participaste en ningún hackatón con un proyecto Nostr.
            </p>
            <Link
              href="/dashboard/projects"
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-bitcoin/40 bg-bitcoin/10 px-4 py-2 text-sm font-semibold text-bitcoin hover:bg-bitcoin/20 transition-colors"
            >
              <FolderGit2 className="h-4 w-4" />
              Ir a Mis proyectos
            </Link>
          </div>
        ) : (
          <div className="mt-8 space-y-6">
            {groups.map((g) => (
              <section
                key={g.hackathonId}
                className="rounded-2xl border border-border bg-background-card overflow-hidden"
              >
                <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border bg-white/[0.02]">
                  <Link
                    href={`/hackathons/${hackathonSlugForId(g.hackathonId)}`}
                    className="inline-flex items-center gap-2 font-display font-bold text-bitcoin hover:underline"
                  >
                    <Trophy className="h-4 w-4" />
                    {hackathonName(g.hackathonId)}
                  </Link>
                  <span className="text-[11px] font-mono text-foreground-subtle uppercase tracking-widest">
                    {g.projects.length} proyecto{g.projects.length === 1 ? "" : "s"}
                  </span>
                </div>
                <ul className="divide-y divide-border/60">
                  {g.projects.map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/hackathons/${hackathonSlugForId(g.hackathonId)}/${p.id}`}
                        className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-white/[0.03] transition-colors group"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-sm group-hover:text-bitcoin transition-colors truncate">
                            {p.name}
                          </div>
                          {p.description && (
                            <div className="text-xs text-foreground-subtle truncate max-w-xl">
                              {p.description}
                            </div>
                          )}
                        </div>
                        <span
                          className={cn(
                            "shrink-0 text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full border",
                            "border-border text-foreground-muted",
                          )}
                        >
                          {p.status}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCell({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-background-card px-4 py-3">
      {icon}
      <div>
        <div className="font-display text-2xl font-bold leading-none tabular-nums">
          {value}
        </div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-foreground-subtle mt-1">
          {label}
        </div>
      </div>
    </div>
  );
}
