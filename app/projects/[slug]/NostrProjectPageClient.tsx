"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Radio,
  Search,
  XCircle,
  CircleDashed,
  Trophy,
  Lightbulb,
  AlertTriangle,
} from "lucide-react";
import {
  fetchCommunityProjects,
  fetchCommunityProjectsSnapshot,
  getCachedCommunityProjects,
  refetchCommunityProjectById,
  fetchAuthorPictures,
  refreshNostrServerCache,
  archiveUserProject,
  removeCachedCommunityProject,
  upsertCachedCommunityProject,
  TOP10_RELAYS,
  DEFAULT_USER_RELAYS,
  type CommunityProject,
  type CommunityScanProgress,
  type RelayScanStatus,
} from "@/lib/userProjects";
import { getHackathon, hackathonSlugForId, type ProjectReport } from "@/lib/hackathons";
import { useProjectReport } from "@/lib/nostrReports";
import { useAuth } from "@/lib/auth";
import { getSigner } from "@/lib/nostrSigner";
import { useToast } from "@/components/Toast";
import { cn } from "@/lib/cn";
import { projectMatchesIdentifier } from "@/lib/projectIdentity";
import { mergeDataRelays } from "@/lib/nostrRelayConfig";
import { seedProjectEntities, seedProfileEntities, useProjectEntity } from "@/lib/entityStore";
import NewProjectModal from "@/components/NewProjectModal";
import { ProjectDetailView } from "@/components/ProjectDetailView";

type SearchPhase = "cache" | "snapshot" | "relays";

function ProjectRelaySearchLoading({
  projectId,
  knownName,
  phase,
  progress,
}: {
  projectId: string;
  knownName?: string;
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
          href="/projects"
          className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-widest text-foreground-muted hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Proyectos
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
                {knownName ?? "Cargando proyecto"}
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

function HackathonReport({ report }: { report: ProjectReport }) {
  return (
    <>
      {report.position != null && (
        <div className="mt-6 overflow-hidden rounded-2xl border border-bitcoin/40 bg-gradient-to-br from-bitcoin/10 via-transparent to-nostr/5">
          <div className="flex flex-col divide-y divide-border/60 sm:flex-row sm:items-stretch sm:divide-x sm:divide-y-0">
            <div className="flex flex-1 items-center gap-4 px-5 py-4">
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
              <div className="flex min-w-[110px] flex-col items-center justify-center px-5 py-4">
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

      <div className="mt-6 overflow-hidden rounded-xl border border-border bg-background-card">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <Trophy className="h-4 w-4 text-bitcoin" />
          <h2 className="text-xs font-mono uppercase tracking-widest font-bold">
            Jurado AI
          </h2>
          {report.finalScore != null && (
            <span className="ml-auto text-sm font-mono tabular-nums">
              promedio ·{" "}
              <span className="font-bold">{report.finalScore.toFixed(2)}</span>
            </span>
          )}
        </div>
        <div className="divide-y divide-border">
          {report.judges.map((judge) => (
            <div key={judge.name} className="px-5 py-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="font-display text-sm font-bold">
                    {judge.name}
                  </div>
                  {judge.model && (
                    <div className="text-[10px] font-mono text-foreground-subtle">
                      {judge.model}
                    </div>
                  )}
                </div>
                {judge.score != null && (
                  <span className="font-mono text-base font-bold tabular-nums">
                    {judge.score.toFixed(2)}
                  </span>
                )}
              </div>
              {judge.categories.length > 0 && (
                <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {judge.categories.map((category) => (
                    <div
                      key={category.name}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border bg-white/[0.02] px-2.5 py-1.5 text-xs"
                    >
                      <span className="truncate text-foreground-muted">
                        {category.name}
                      </span>
                      <span className="font-mono font-bold tabular-nums">
                        {category.score}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {judge.summary && (
                <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground-muted">
                  {judge.summary}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {(report.feedback.strengths.length > 0 ||
        report.feedback.improvements.length > 0) && (
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          {report.feedback.strengths.length > 0 && (
            <FeedbackCard
              title="Fortalezas"
              items={report.feedback.strengths}
              icon={<Lightbulb className="h-4 w-4 text-success" />}
              tone="success"
            />
          )}
          {report.feedback.improvements.length > 0 && (
            <FeedbackCard
              title="Áreas de Mejora"
              items={report.feedback.improvements}
              icon={<AlertTriangle className="h-4 w-4 text-lightning" />}
              tone="lightning"
            />
          )}
        </div>
      )}
    </>
  );
}

function FeedbackCard({
  title,
  items,
  icon,
  tone,
}: {
  title: string;
  items: string[];
  icon: ReactNode;
  tone: "success" | "lightning";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-background-card p-5",
        tone === "success" ? "border-success/30" : "border-lightning/30",
      )}
    >
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h3 className="text-xs font-mono uppercase tracking-widest font-bold">
          {title}
        </h3>
      </div>
      <ul className="space-y-2 text-xs leading-relaxed text-foreground-muted">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-foreground-subtle">›</span>
            <span className="flex-1">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Client side of the canonical Nostr project page. The hackathon context is
 * derived from the project data itself (projects may have none); `author`
 * narrows relay lookups when the caller knows it (registry-backed URLs).
 */
export default function NostrProjectPage({
  projectId,
  author,
  canonicalSlug,
  initialProject,
}: {
  projectId: string;
  author?: string;
  canonicalSlug?: string;
  initialProject?: CommunityProject;
}) {
  const [project, setProject] = useState<CommunityProject | null | undefined>(
    initialProject ?? undefined,
  );
  const [authorPicture, setAuthorPicture] = useState<string | undefined>();
  const { auth } = useAuth();
  const router = useRouter();
  const { push: pushToast } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [archiveStep, setArchiveStep] = useState<"idle" | "confirm" | "archiving">("idle");
  const [revalidating, setRevalidating] = useState(false);
  const [cachePending, setCachePending] = useState(false);
  const [searchPhase, setSearchPhase] = useState<SearchPhase>("cache");
  const [searchProgress, setSearchProgress] =
    useState<CommunityScanProgress | null>(null);
  const knownEntity = useProjectEntity(canonicalSlug ?? projectId);
  const hackathon = project?.hackathon ? getHackathon(project.hackathon) : null;
  // Report lookups key off the project's own id (report events + reports.json
  // are keyed by it) — never the URL slug.
  const { report } = useProjectReport(
    project?.hackathon ?? "",
    project?.id ?? projectId,
  );
  const relays = useMemo(() => {
    return mergeDataRelays(DEFAULT_USER_RELAYS, auth?.bunker?.relays);
  }, [auth]);

  useEffect(() => {
    let cancelled = false;
    const snapshotAbort = new AbortController();

    const matches = (p: CommunityProject) =>
      projectMatchesIdentifier(p, projectId) && (!author || p.author === author);

    function showProject(next: CommunityProject) {
      setProject(next);
      upsertCachedCommunityProject(next);
      seedProjectEntities([
        {
          id: next.id,
          slug: next.slug ?? canonicalSlug,
          name: next.name,
          description: next.description,
          logo: next.logo,
          cover: next.cover,
          status: next.status,
          hackathon: next.hackathon,
          author: next.author,
          tech: next.tech,
          updatedAt: next.eventCreatedAt,
        },
      ]);
      fetchAuthorPictures([next.author], TOP10_RELAYS).then((pics) => {
        if (cancelled) return;
        const picture = pics.get(next.author);
        setAuthorPicture(picture);
        if (picture) seedProfileEntities([{ pubkey: next.author, picture }]);
      });
    }

    async function refreshServerForProject(candidate: CommunityProject) {
      setRevalidating(true);
      try {
        const snapshot = await refreshNostrServerCache({
          scopes: ["projects"],
          projectId: candidate.id,
          author: candidate.author,
          candidateEventId: candidate.eventId,
          candidateCreatedAt: candidate.eventCreatedAt,
          blocking: true,
          signal: snapshotAbort.signal,
        });
        const fromServer =
          snapshot?.projects.find(
            (p) =>
              p.author === candidate.author &&
              projectMatchesIdentifier(p, candidate.id),
          ) ?? null;
        if (!cancelled && fromServer) {
          setCachePending(fromServer.eventCreatedAt < candidate.eventCreatedAt);
          showProject(
            fromServer.eventCreatedAt >= candidate.eventCreatedAt
              ? fromServer
              : candidate,
          );
        } else if (!cancelled) {
          setCachePending(true);
        }
        if (!cancelled) router.refresh();
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError")) {
          console.warn("[labs] project cache refresh failed", e);
        }
      } finally {
        if (!cancelled) setRevalidating(false);
      }
    }

    async function load() {
      // 1. Show cached version immediately for instant render.
      setSearchPhase("cache");
      setSearchProgress(null);
      const cached = getCachedCommunityProjects();
      let latest = cached?.find(matches) ?? null;
      if (!latest && initialProject) latest = initialProject;
      if (latest && !cancelled) {
        showProject(latest);
      }

      // 2. Pull the server snapshot, then reconcile this project from relays.
      if (!cancelled) setRevalidating(true);
      try {
        try {
          if (!cancelled) setSearchPhase("snapshot");
          const snapshot = await fetchCommunityProjectsSnapshot({
            signal: snapshotAbort.signal,
          });
          const fromSnapshot = snapshot.projects.find(matches) ?? null;
          if (fromSnapshot && !cancelled) {
            if (!latest || fromSnapshot.eventCreatedAt >= latest.eventCreatedAt) {
              latest = fromSnapshot;
              showProject(fromSnapshot);
            }
          }
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") return;
        }

        if (!cancelled) setSearchPhase("relays");
        const fresh = await refetchCommunityProjectById(
          latest?.id ?? projectId,
          TOP10_RELAYS,
          5000,
          latest?.author ?? author,
          {
            signal: snapshotAbort.signal,
            onProgress: (progress) => {
              if (!cancelled) setSearchProgress(progress);
            },
          },
        );

        if (cancelled) return;

        if (
          fresh &&
          matches(fresh) &&
          (!latest || fresh.eventCreatedAt > latest.eventCreatedAt)
        ) {
          showProject(fresh);
          await refreshServerForProject(fresh);
        } else if (!latest) {
          const broad = await fetchCommunityProjects(TOP10_RELAYS, {
            perRelayTimeoutMs: 5000,
            signal: snapshotAbort.signal,
            onProgress: (progress) => {
              if (!cancelled) setSearchProgress(progress);
            },
          });
          if (cancelled) return;
          const aliased = broad.find(matches) ?? null;
          if (aliased) {
            showProject(aliased);
            await refreshServerForProject(aliased);
          } else {
            setProject(null);
          }
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
    // Depend on the initialProject's stable identity, not the object:
    // router.refresh() streams a fresh reference and would otherwise re-run
    // the whole cache/snapshot/relay scan after every refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, author, canonicalSlug, initialProject?.eventId, router]);

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
        projectId={projectId}
        knownName={knownEntity?.name}
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
            href="/projects"
            className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-widest text-foreground-muted hover:text-foreground transition-colors mb-6"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Proyectos
          </Link>
          <p className="mt-8 text-sm text-foreground-muted">
            Proyecto no encontrado.
          </p>
        </div>
      </div>
    );
  }

  const backHref = project.hackathon
    ? `/hackathons/${hackathonSlugForId(project.hackathon)}`
    : "/projects";
  const backLabel =
    hackathon?.name ??
    (project.hackathon ? project.hackathon.toUpperCase() : "Proyectos");
  const contextLabel = hackathon
    ? `${hackathon.icon ?? ""} ${hackathon.name}${
        hackathon.monthShort && hackathon.year
          ? ` · ${hackathon.monthShort} ${hackathon.year}`
          : ""
      }`
    : undefined;

  const reportSlot =
    project.hackathon && report ? <HackathonReport report={report} /> : undefined;
  const isAuthor = auth?.pubkey === project.author;

  return (
    <>
      <ProjectDetailView
        project={project}
        authorPubkey={project.author}
        authorPicture={authorPicture}
        backHref={backHref}
        backLabel={backLabel}
        contextLabel={contextLabel}
        isAuthor={isAuthor}
        revalidating={revalidating || cachePending}
        onEdit={isAuthor ? () => setEditOpen(true) : undefined}
        archiveState={archiveStep}
        onArchive={
          isAuthor
            ? archiveStep === "idle"
              ? () => setArchiveStep("confirm")
              : archiveStep === "confirm"
                ? handleArchive
                : undefined
            : undefined
        }
        onCancelArchive={() => setArchiveStep("idle")}
        reportSlot={reportSlot}
      />
      {isAuthor && (
        <NewProjectModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          editProject={project}
          onSaved={(updated) =>
            setProject((prev) => {
              if (!prev) return prev;
              const merged: CommunityProject = { ...prev, ...updated };
              upsertCachedCommunityProject(merged);
              return merged;
            })
          }
        />
      )}
    </>
  );
}
