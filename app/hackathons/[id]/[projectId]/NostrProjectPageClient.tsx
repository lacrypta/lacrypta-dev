"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Pencil,
  Radio,
  Search,
  Users,
  XCircle,
  Zap,
  CircleDashed,
} from "lucide-react";
import {
  fetchCommunityProjects,
  fetchCommunityProjectsSnapshot,
  getCachedCommunityProjects,
  refetchCommunityProjectById,
  fetchAuthorPictures,
  archiveUserProject,
  removeCachedCommunityProject,
  upsertCachedCommunityProject,
  TOP10_RELAYS,
  DEFAULT_USER_RELAYS,
  type CommunityProject,
  type CommunityScanProgress,
  type RelayScanStatus,
} from "@/lib/userProjects";
import { getHackathon, type Hackathon } from "@/lib/hackathons";
import { useProjectReport } from "@/lib/nostrReports";
import { useAuth } from "@/lib/auth";
import { getSigner } from "@/lib/nostrSigner";
import { useToast } from "@/components/Toast";
import { GithubIcon } from "@/components/BrandIcons";
import { cn } from "@/lib/cn";
import {
  dedupeSoldierProfileMembers,
  soldierProfileHref,
} from "@/lib/soldierProfileLinks";
import { projectMatchesIdentifier } from "@/lib/projectIdentity";
import { mergeDataRelays } from "@/lib/nostrRelayConfig";
import { Trophy, Lightbulb, AlertTriangle } from "lucide-react";
import NewProjectModal from "@/components/NewProjectModal";

const STATUS_BADGE: Record<string, string> = {
  official: "bg-bitcoin/10 border-bitcoin/40 text-bitcoin",
  winner: "bg-lightning/10 border-lightning/40 text-lightning",
  finalist: "bg-cyan/10 border-cyan/40 text-cyan",
  submitted: "bg-nostr/10 border-nostr/30 text-nostr",
  building: "bg-white/5 border-border text-foreground-muted",
  idea: "bg-white/5 border-border text-foreground-subtle",
};

type SearchPhase = "cache" | "snapshot" | "relays";

function ProjectRelaySearchLoading({
  hackathonId,
  hackathonName,
  projectId,
  phase,
  progress,
}: {
  hackathonId: string;
  hackathonName: string;
  projectId: string;
  phase: SearchPhase;
  progress: CommunityScanProgress | null;
}) {
  const total = progress?.totalRelays ?? TOP10_RELAYS.length;
  const completed = progress?.completedRelays ?? 0;
  const basePct =
    phase === "cache" ? 14 : phase === "snapshot" ? 36 : progress ? 48 : 44;
  const relayPct =
    progress && total > 0 ? Math.round((completed / total) * 52) : 0;
  const pct =
    progress?.projectsSoFar && progress.projectsSoFar > 0
      ? 96
      : Math.min(96, basePct + relayPct);
  const relayStates =
    progress?.relays ??
    TOP10_RELAYS.map((relay) => ({
      relay,
      state: "pending" as const,
      events: 0,
    }));
  const headline =
    phase === "cache"
      ? "Revisando cache local"
      : phase === "snapshot"
        ? "Leyendo snapshot del servidor"
        : progress?.projectsSoFar
          ? "Evento encontrado"
          : "Buscando evento en relays";

  return (
    <div className="relative min-h-[calc(100vh-5rem)] overflow-hidden pt-24 pb-16">
      <div className="absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-24 h-72 w-72 -translate-x-1/2 rounded-full bg-nostr/10 blur-[90px]" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-bitcoin/10 blur-[110px]" />
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <Link
          href={`/hackathons/${hackathonId}`}
          className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-widest text-foreground-muted hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {hackathonName}
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 18, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="relative overflow-hidden rounded-3xl border border-nostr/25 bg-background-card/80 p-5 shadow-2xl shadow-nostr/10 backdrop-blur sm:p-7"
        >
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-nostr/70 to-transparent" />
          <div className="grid gap-7 lg:grid-cols-[260px_1fr] lg:items-center">
            <div className="relative flex min-h-64 items-center justify-center">
              <motion.div
                className="absolute h-52 w-52 rounded-full border border-nostr/20"
                animate={{ rotate: 360 }}
                transition={{ duration: 16, repeat: Infinity, ease: "linear" }}
              >
                {relayStates.slice(0, 6).map((relay, i) => (
                  <span
                    key={relay.relay}
                    className={cn(
                      "absolute h-2.5 w-2.5 rounded-full border",
                      relay.state === "done"
                        ? "border-success bg-success"
                        : relay.state === "error"
                          ? "border-danger bg-danger"
                          : relay.state === "receiving"
                            ? "border-nostr bg-nostr shadow-[0_0_18px_rgba(168,85,247,0.9)]"
                            : "border-nostr/50 bg-background",
                    )}
                    style={{
                      left: `${50 + 46 * Math.cos((i / 6) * Math.PI * 2)}%`,
                      top: `${50 + 46 * Math.sin((i / 6) * Math.PI * 2)}%`,
                    }}
                  />
                ))}
              </motion.div>
              <motion.div
                className="absolute h-40 w-40 rounded-full border border-bitcoin/20"
                animate={{ rotate: -360 }}
                transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
              />
              <motion.div
                className="absolute h-28 w-28 rounded-full bg-nostr/10"
                animate={{ scale: [1, 1.12, 1], opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 1.8, repeat: Infinity }}
              />
              <div className="relative flex h-24 w-24 items-center justify-center rounded-3xl border border-nostr/35 bg-black/50 shadow-xl shadow-nostr/20">
                {phase === "relays" ? (
                  <Radio className="h-8 w-8 text-nostr" />
                ) : (
                  <Search className="h-8 w-8 text-nostr" />
                )}
              </div>
            </div>

            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-nostr/25 bg-nostr/10 px-3 py-1 text-[10px] font-mono uppercase tracking-widest text-nostr">
                <Loader2 className="h-3 w-3 animate-spin" />
                {headline}
              </div>
              <h1 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-5xl">
                Cargando proyecto
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-foreground-muted">
                Buscando el evento NIP-78 más nuevo para{" "}
                <span className="font-mono text-foreground">
                  {projectId.slice(0, 8)}…
                </span>
              </p>

              <div className="mt-6">
                <div className="mb-2 flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-foreground-subtle">
                  <span>
                    {phase === "relays"
                      ? `${completed}/${total} relays`
                      : "Preparando consulta"}
                  </span>
                  <span className="text-nostr">{pct}%</span>
                </div>
                <div className="relative h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <motion.div
                    className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-nostr via-bitcoin to-nostr"
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.35, ease: "easeOut" }}
                  />
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                    animate={{ x: ["-100%", "100%"] }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                  />
                </div>
              </div>

              <div className="mt-5 grid gap-2 sm:grid-cols-3">
                <SearchStage active={phase === "cache"} done={phase !== "cache"}>
                  Cache local
                </SearchStage>
                <SearchStage
                  active={phase === "snapshot"}
                  done={phase === "relays"}
                >
                  Snapshot
                </SearchStage>
                <SearchStage active={phase === "relays"} done={false}>
                  Relays
                </SearchStage>
              </div>

              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {relayStates.map((relay) => (
                  <RelaySearchRow key={relay.relay} relay={relay} />
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function SearchStage({
  active,
  done,
  children,
}: {
  active: boolean;
  done: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl border px-3 py-2 text-[10px] font-mono uppercase tracking-widest",
        done
          ? "border-success/25 bg-success/10 text-success"
          : active
            ? "border-nostr/35 bg-nostr/10 text-nostr"
            : "border-border bg-white/[0.02] text-foreground-subtle",
      )}
    >
      {done ? (
        <CheckCircle2 className="h-3.5 w-3.5" />
      ) : active ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <CircleDashed className="h-3.5 w-3.5" />
      )}
      {children}
    </div>
  );
}

function RelaySearchRow({ relay }: { relay: RelayScanStatus }) {
  const icon =
    relay.state === "done" ? (
      <CheckCircle2 className="h-3.5 w-3.5 text-success" />
    ) : relay.state === "error" ? (
      <XCircle className="h-3.5 w-3.5 text-danger" />
    ) : relay.state === "receiving" ? (
      <Radio className="h-3.5 w-3.5 text-nostr" />
    ) : relay.state === "connecting" ? (
      <Loader2 className="h-3.5 w-3.5 animate-spin text-foreground-muted" />
    ) : (
      <CircleDashed className="h-3.5 w-3.5 text-foreground-subtle" />
    );

  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-black/20 px-2.5 py-2 text-[11px] font-mono">
      {icon}
      <span className="min-w-0 flex-1 truncate text-foreground-muted">
        {relay.relay.replace("wss://", "")}
      </span>
      {relay.events > 0 && (
        <span className="shrink-0 tabular-nums text-nostr">
          {relay.events} ev
        </span>
      )}
    </div>
  );
}

export default function NostrProjectPage({
  hackathonId,
  projectId,
}: {
  hackathonId: string;
  projectId: string;
}) {
  const [project, setProject] = useState<CommunityProject | null | undefined>(
    undefined,
  );
  const [authorPicture, setAuthorPicture] = useState<string | undefined>();
  const hackathon = getHackathon(hackathonId) as Hackathon;
  const { report } = useProjectReport(hackathonId, projectId);
  const { auth } = useAuth();
  const router = useRouter();
  const { push: pushToast } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [archiveStep, setArchiveStep] = useState<"idle" | "confirm" | "archiving">("idle");
  const [revalidating, setRevalidating] = useState(false);
  const [searchPhase, setSearchPhase] = useState<
    "cache" | "snapshot" | "relays"
  >("cache");
  const [searchProgress, setSearchProgress] =
    useState<CommunityScanProgress | null>(null);
  const relays = useMemo(() => {
    return mergeDataRelays(DEFAULT_USER_RELAYS, auth?.bunker?.relays);
  }, [auth]);

  useEffect(() => {
    let cancelled = false;
    const snapshotAbort = new AbortController();

    function showProject(next: CommunityProject) {
      setProject(next);
      upsertCachedCommunityProject(next);
      fetchAuthorPictures([next.author], TOP10_RELAYS).then((pics) => {
        if (!cancelled) setAuthorPicture(pics.get(next.author));
      });
    }

    async function load() {
      // 1. Show cached version immediately for instant render.
      setSearchPhase("cache");
      setSearchProgress(null);
      const cached = getCachedCommunityProjects();
      let latest =
        cached?.find(
          (p) =>
            p.hackathon === hackathonId &&
            projectMatchesIdentifier(p, projectId),
        ) ?? null;
      if (latest && !cancelled) {
        showProject(latest);
      }

      // 2. Pull the server snapshot quickly, then refresh this d-tag from relays.
      if (!cancelled) setRevalidating(true);
      try {
        try {
          if (!cancelled) setSearchPhase("snapshot");
          const snapshot = await fetchCommunityProjectsSnapshot({
            signal: snapshotAbort.signal,
          });
          const fromSnapshot =
            snapshot.projects.find(
              (p) =>
                p.hackathon === hackathonId &&
                projectMatchesIdentifier(p, projectId),
            ) ?? null;
          if (fromSnapshot && !cancelled) {
            latest = fromSnapshot;
            showProject(fromSnapshot);
          }
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") return;
        }

        if (!cancelled) setSearchPhase("relays");
        const fresh = await refetchCommunityProjectById(
          latest?.id ?? projectId,
          TOP10_RELAYS,
          5000,
          latest?.author,
          {
            signal: snapshotAbort.signal,
            onProgress: (progress) => {
              if (!cancelled) setSearchProgress(progress);
            },
          },
        );

        if (cancelled) return;

        if (fresh && fresh.hackathon === hackathonId) {
          showProject(fresh);
        } else if (!latest) {
          const broad = await fetchCommunityProjects(TOP10_RELAYS, {
            perRelayTimeoutMs: 5000,
            signal: snapshotAbort.signal,
            onProgress: (progress) => {
              if (!cancelled) setSearchProgress(progress);
            },
          });
          if (cancelled) return;
          const aliased =
            broad.find(
              (p) =>
                p.hackathon === hackathonId &&
                projectMatchesIdentifier(p, projectId),
            ) ?? null;
          if (aliased) showProject(aliased);
          else setProject(null);
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        if (!latest) setProject(null);
      } finally {
        if (!cancelled) setRevalidating(false);
      }
    }

    load();
    return () => {
      cancelled = true;
      snapshotAbort.abort();
    };
  }, [hackathonId, projectId]);

  async function handleArchive() {
    if (!auth || !project) return;
    setArchiveStep("archiving");
    try {
      const signer = await getSigner(auth, {
        onAuthUrl: (url) => {
          pushToast({ kind: "info", title: "Autorizá la firma en tu bunker", description: url, duration: 20000 });
          try { window.open(url, "_blank", "noopener,noreferrer"); } catch { /* popup blocked */ }
        },
      });
      await archiveUserProject(signer, project, relays);
      removeCachedCommunityProject(project);
      signer.close?.().catch(() => {});
      router.back();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      pushToast({ kind: "error", title: "No se pudo archivar el proyecto", description: msg, duration: 12000 });
      setArchiveStep("idle");
    }
  }

  if (project === undefined) {
    return (
      <ProjectRelaySearchLoading
        hackathonId={hackathonId}
        hackathonName={hackathon?.name ?? "Hackatones"}
        projectId={projectId}
        phase={searchPhase}
        progress={searchProgress}
      />
    );
  }

  if (project === null) {
    return (
      <div className="relative pt-24 pb-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link
            href={`/hackathons/${hackathonId}`}
            className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-widest text-foreground-muted hover:text-foreground transition-colors mb-6"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {hackathon?.name ?? "Hackatones"}
          </Link>
          <p className="mt-8 text-sm text-foreground-muted">
            Proyecto no encontrado.
          </p>
        </div>
      </div>
    );
  }

  const team = dedupeSoldierProfileMembers(project.team);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
      className="relative pt-24 pb-16"
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 mb-6">
          <Link
            href={`/hackathons/${hackathonId}`}
            className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-widest text-foreground-muted hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {hackathon?.name ?? "Hackatones"}
          </Link>
          {revalidating && (
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-nostr/10 border border-nostr/20">
              <Loader2 className="h-2.5 w-2.5 animate-spin text-nostr" />
              <span className="text-[9px] font-mono text-nostr">sincronizando…</span>
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-8">
          {auth?.pubkey === project.author && (
            <NewProjectModal
              open={editOpen}
              onClose={() => setEditOpen(false)}
              editProject={project}
              onSaved={(updated) => setProject((prev) => {
                if (!prev) return prev;
                const merged: CommunityProject = { ...prev, ...updated };
                upsertCachedCommunityProject(merged);
                return merged;
              })}
            />
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="text-[10px] font-mono tracking-widest text-foreground-subtle">
                {hackathon?.icon} {hackathon?.name} · {hackathon?.monthShort}{" "}
                {hackathon?.year}
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

            <div className="mt-6 flex flex-wrap items-center gap-3">
              {project.repo && (
                <a
                  href={project.repo}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-12 items-center gap-3 rounded-xl border border-border bg-white/[0.03] px-6 py-3 text-base font-semibold transition-colors hover:bg-white/[0.06]"
                >
                  <GithubIcon className="h-5 w-5" />
                  Repo
                </a>
              )}
              {project.demo && (
                <a
                  href={project.demo}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-12 items-center gap-3 rounded-xl border border-border bg-white/[0.03] px-6 py-3 text-base font-semibold transition-colors hover:bg-white/[0.06]"
                >
                  <ExternalLink className="h-5 w-5" />
                  Demo
                </a>
              )}
            </div>

            {project.tech && project.tech.length > 0 && (
              <div className="mt-6 rounded-xl border border-border bg-background-card p-5 lg:hidden">
                <div className="flex flex-wrap gap-1.5">
                  {project.tech.map((t) => (
                    <span
                      key={t}
                      className="px-2 py-0.5 rounded-md border border-border bg-white/[0.03] text-[10px] font-mono text-foreground-muted"
                    >
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
                  Submission firmada en Nostr
                </span>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-mono text-foreground-subtle break-all">
                  <span className="text-foreground-muted">event </span>
                  {project.eventId}
                </p>
                <p className="text-[10px] font-mono text-foreground-subtle break-all">
                  <span className="text-foreground-muted">pubkey </span>
                  {project.author}
                </p>
              </div>
            </div>

            {/* Nostr-sourced judge report */}
            {report && (
              <>
                {report.position != null && (
                  <div className="mt-6 rounded-2xl border border-bitcoin/40 bg-gradient-to-br from-bitcoin/10 via-transparent to-nostr/5 overflow-hidden">
                    <div className="flex flex-col sm:flex-row items-stretch divide-y sm:divide-y-0 sm:divide-x divide-border/60">
                      <div className="flex items-center gap-4 px-5 py-4 flex-1">
                        <div className="text-5xl leading-none">
                          {report.position === 1
                            ? "🥇"
                            : report.position === 2
                              ? "🥈"
                              : report.position === 3
                                ? "🥉"
                                : `#${report.position}`}
                        </div>
                        <div>
                          <div className="text-[10px] font-mono uppercase tracking-widest text-foreground-subtle">
                            POSICIÓN FINAL
                          </div>
                          <div className="font-display text-2xl font-bold">
                            {report.position === 1
                              ? "1° — Ganador"
                              : `${report.position}° lugar`}
                          </div>
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
                    </div>
                  </div>
                )}

                <div className="mt-6 rounded-xl border border-border bg-background-card overflow-hidden">
                  <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
                    <Trophy className="h-4 w-4 text-bitcoin" />
                    <h2 className="text-xs font-mono uppercase tracking-widest font-bold">
                      Jurado AI
                    </h2>
                    {report.finalScore != null && (
                      <span className="ml-auto text-sm font-mono tabular-nums">
                        promedio ·{" "}
                        <span className="font-bold">
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
                      <div className="rounded-xl border border-success/30 bg-background-card p-5">
                        <div className="flex items-center gap-2 mb-3">
                          <Lightbulb className="h-4 w-4 text-success" />
                          <h3 className="text-xs font-mono uppercase tracking-widest font-bold">
                            Fortalezas
                          </h3>
                        </div>
                        <ul className="space-y-2 text-xs text-foreground-muted leading-relaxed">
                          {report.feedback.strengths.map((s, i) => (
                            <li key={i} className="flex gap-2">
                              <span className="text-foreground-subtle">›</span>
                              <span className="flex-1">{s}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {report.feedback.improvements.length > 0 && (
                      <div className="rounded-xl border border-lightning/30 bg-background-card p-5">
                        <div className="flex items-center gap-2 mb-3">
                          <AlertTriangle className="h-4 w-4 text-lightning" />
                          <h3 className="text-xs font-mono uppercase tracking-widest font-bold">
                            Áreas de Mejora
                          </h3>
                        </div>
                        <ul className="space-y-2 text-xs text-foreground-muted leading-relaxed">
                          {report.feedback.improvements.map((s, i) => (
                            <li key={i} className="flex gap-2">
                              <span className="text-foreground-subtle">›</span>
                              <span className="flex-1">{s}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          <aside className="space-y-4">
            {auth?.pubkey === project.author && (
              <div className="rounded-2xl border border-border bg-background-card p-4 space-y-2">
                <button
                  onClick={() => setEditOpen(true)}
                  className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-bitcoin/30 bg-bitcoin/5 hover:bg-bitcoin/10 text-bitcoin text-xs font-semibold transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Editar proyecto
                </button>
                {archiveStep === "idle" && (
                  <button
                    onClick={() => setArchiveStep("confirm")}
                    className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-border bg-white/[0.03] hover:bg-danger/10 hover:border-danger/40 hover:text-danger text-xs font-semibold transition-colors"
                  >
                    <Archive className="h-3.5 w-3.5" />
                    Archivar
                  </button>
                )}
                {archiveStep === "confirm" && (
                  <div className="space-y-2">
                    <p className="text-[11px] text-foreground-muted text-center">¿Archivar este proyecto?</p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleArchive}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-danger/50 bg-danger/10 text-danger text-xs font-semibold transition-colors"
                      >
                        Confirmar
                      </button>
                      <button
                        onClick={() => setArchiveStep("idle")}
                        className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold text-foreground-muted hover:text-foreground hover:bg-white/5 transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
                {archiveStep === "archiving" && (
                  <button
                    disabled
                    className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-border text-xs font-semibold opacity-60"
                  >
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Archivando…
                  </button>
                )}
              </div>
            )}

            {project.tech && project.tech.length > 0 && (
              <div className="hidden lg:block rounded-2xl border border-border bg-background-card p-5">
                <div className="text-[10px] font-mono uppercase tracking-widest text-foreground-muted mb-3">
                  Stack
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {project.tech.map((t) => (
                    <span
                      key={t}
                      className="px-2 py-0.5 rounded-md border border-border bg-white/[0.03] text-[10px] font-mono text-foreground-muted"
                    >
                      {t}
                    </span>
                  ))}
                </div>
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
                <p className="text-xs text-foreground-subtle">
                  Sin equipo cargado.
                </p>
              ) : (
                <ul className="space-y-2">
                  {team.map((m, i) => {
                    const pic =
                      i === 0 ? (authorPicture ?? m.picture) : m.picture;
                    const displayName = m.name || m.nip05 || "Anónimo";
                    const profileHref = soldierProfileHref(m);
                    const memberContent = (
                      <>
                        {pic ? (
                          <img
                            src={pic}
                            alt=""
                            className="h-8 w-8 rounded-full object-cover ring-1 ring-nostr/40 shrink-0"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-nostr/30 to-bitcoin/30 ring-1 ring-border-strong flex items-center justify-center text-xs font-display font-bold shrink-0">
                            {displayName.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold truncate transition-colors group-hover/member:text-nostr">
                            {displayName}
                          </div>
                          <div className="text-[10px] font-mono text-foreground-subtle">
                            {m.role}
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
                            aria-label={`Ver perfil de ${displayName}`}
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
                            aria-label={`GitHub de ${displayName}`}
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
          </aside>
        </div>
      </div>
    </motion.div>
  );
}
