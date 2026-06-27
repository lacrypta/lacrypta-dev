"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CircleDashed,
  ExternalLink,
  Loader2,
  RefreshCw,
  Trophy,
  Zap,
} from "lucide-react";
import {
  isHackathonInscriptionOpen,
  mergeWithSubmissions,
  prizedProjects,
  type Hackathon,
  type HackathonProject,
  type HackathonSubmission,
  type PrizedProject,
} from "@/lib/hackathons";
import HackathonInscripcionButton from "@/components/HackathonInscripcionButton";
import {
  fetchAuthorPictures,
  fetchCommunityProjectsSnapshot,
  getCachedCommunityProjects,
  communityProjectKey,
  mergeCommunityProjects,
  newerCommunityProjects,
  refreshNostrServerCache,
  refreshCommunityProjectsFromRelays,
  sortCommunityProjects,
  TOP10_RELAYS,
  type CommunityProject,
} from "@/lib/userProjects";
import { formatSats, hackathonSlugForId } from "@/lib/hackathons";
import { useHackathonResults, type WinnerEntry } from "@/lib/nostrReports";
import { GithubIcon } from "@/components/BrandIcons";
import { cn } from "@/lib/cn";
import { dedupeSoldierProfileMembers } from "@/lib/soldierProfileLinks";
import {
  rememberScrollPosition,
  restoreScrollPosition,
} from "@/lib/scrollMemory";
import {
  ProjectVotingControls,
  ProjectVotingToolbar,
} from "./VotingSection";

function medal(position: number | null | undefined) {
  if (position === 1) return "🥇";
  if (position === 2) return "🥈";
  if (position === 3) return "🥉";
  return null;
}

const STATUS_BADGE: Record<string, string> = {
  official: "bg-bitcoin/10 border-bitcoin/40 text-bitcoin",
  winner: "bg-lightning/10 border-lightning/40 text-lightning",
  finalist: "bg-cyan/10 border-cyan/40 text-cyan",
  submitted: "bg-nostr/10 border-nostr/30 text-nostr",
  building: "bg-white/5 border-border text-foreground-muted",
  idea: "bg-white/5 border-border text-foreground-subtle",
};

function fromCommunity(np: CommunityProject): HackathonSubmission {
  return {
    ...np,
    nostrAuthor: np.author,
    nostrEventId: np.eventId,
    nostrCreatedAt: np.eventCreatedAt,
  };
}

function communityFromSubmission(
  submission: HackathonSubmission,
): CommunityProject | null {
  if (
    !submission.nostrAuthor ||
    !submission.nostrEventId ||
    !submission.nostrCreatedAt
  ) {
    return null;
  }
  const withRuntime = submission as HackathonSubmission & {
    createdAt?: number;
    updatedAt?: number;
  };
  return {
    ...submission,
    author: submission.nostrAuthor,
    eventId: submission.nostrEventId,
    eventCreatedAt: submission.nostrCreatedAt,
    createdAt: withRuntime.createdAt ?? submission.nostrCreatedAt,
    updatedAt: withRuntime.updatedAt ?? submission.nostrCreatedAt,
  };
}

export default function HackathonProjectsList({
  hackathon,
  initialNostrSubmissions = [],
}: {
  hackathon: Hackathon;
  initialNostrSubmissions?: HackathonSubmission[];
}) {
  const router = useRouter();
  const [nostrSubmissions, setNostrSubmissions] = useState<
    HackathonSubmission[]
  >(initialNostrSubmissions);
  const [scanning, setScanning] = useState(false);
  const [syncingCache, setSyncingCache] = useState(false);
  const [cachePending, setCachePending] = useState(false);
  const [authorPictures, setAuthorPictures] = useState<Map<string, string>>(
    () => picturesFromSubmissions(initialNostrSubmissions),
  );
  const sectionRef = useRef<HTMLElement>(null);
  const relayAbortRef = useRef<AbortController | null>(null);
  const communityRef = useRef<CommunityProject[]>(
    initialNostrSubmissions
      .map(communityFromSubmission)
      .filter((project): project is CommunityProject => project !== null),
  );

  useLayoutEffect(() => {
    return restoreScrollPosition(`/hackathons/${hackathonSlugForId(hackathon.id)}`);
  }, [hackathon.id]);

  const awards = useMemo<PrizedProject[]>(
    () => prizedProjects(hackathon.id),
    [hackathon.id],
  );
  const prizeByProjectId = useMemo(
    () => new Map(awards.map((a) => [a.project.id, a])),
    [awards],
  );

  const { results: nostrResults } = useHackathonResults(hackathon.id);
  const nostrWinnerByProjectId = useMemo(
    () =>
      new Map<string, WinnerEntry>(
        nostrResults?.winners.map((w) => [w.projectId, w]) ?? [],
      ),
    [nostrResults],
  );

  const merged = useMemo(
    () => mergeWithSubmissions(hackathon.id, nostrSubmissions),
    [hackathon.id, nostrSubmissions],
  );

  function applyCommunityProjects(
    projects: CommunityProject[],
    opts?: { merge?: boolean },
  ) {
    const filtered = sortCommunityProjects(
      projects.filter((p) => p.hackathon === hackathon.id),
    );
    const next = opts?.merge
      ? mergeCommunityProjects(communityRef.current, filtered).filter(
          (p) => p.hackathon === hackathon.id,
        )
      : filtered;
    communityRef.current = next;
    setNostrSubmissions(next.map(fromCommunity));
    const seeded = picturesFromCommunityProjects(next);
    if (seeded.size > 0) {
      setAuthorPictures((prev) => new Map([...prev, ...seeded]));
    }
    const pubkeys = [...new Set(next.map((p) => p.author))];
    if (pubkeys.length > 0) {
      fetchAuthorPictures(pubkeys, TOP10_RELAYS).then(setAuthorPictures);
    }
  }

  function upsertCommunityProject(project: CommunityProject) {
    if (project.hackathon !== hackathon.id) return;
    communityRef.current = mergeCommunityProjects(communityRef.current, [
      project,
    ]).filter((p) => p.hackathon === hackathon.id);
    const next = fromCommunity(project);
    setNostrSubmissions((prev) => {
      const idx = prev.findIndex(
        (p) => p.id === next.id && p.nostrAuthor === next.nostrAuthor,
      );
      const merged =
        idx === -1
          ? [next, ...prev]
          : prev.map((p, i) => (i === idx ? next : p));
      return [...merged].sort(
        (a, b) => (b.nostrCreatedAt ?? 0) - (a.nostrCreatedAt ?? 0),
      );
    });
    const pics = picturesFromCommunityProjects([project]);
    if (pics.size > 0) {
      setAuthorPictures((prev) => new Map([...prev, ...pics]));
    }
  }

  async function syncServerSnapshot(signal?: AbortSignal) {
    const snapshot = await fetchCommunityProjectsSnapshot({ signal });
    applyCommunityProjects(snapshot.projects, { merge: true });
  }

  async function refreshFromRelays(opts?: { manual?: boolean }) {
    if (scanning) return;
    setScanning(true);
    relayAbortRef.current?.abort();
    const abort = new AbortController();
    relayAbortRef.current = abort;
    try {
      const snapshot = await refreshCommunityProjectsFromRelays({
        signal: abort.signal,
      });
      const visible = snapshot.projects.filter(
        (p) => p.hackathon === hackathon.id,
      );
      const newer = newerCommunityProjects(visible, communityRef.current);
      if (newer.length > 0) {
        applyCommunityProjects(snapshot.projects, { merge: true });
        const newest = newer.reduce((best, project) =>
          project.eventCreatedAt > best.eventCreatedAt ? project : best,
        );
        setSyncingCache(true);
        try {
          const serverSnapshot = await refreshNostrServerCache({
            scopes: ["projects"],
            hackathonId: hackathon.id,
            candidateEventId: newest.eventId,
            candidateCreatedAt: newest.eventCreatedAt,
            blocking: true,
            signal: abort.signal,
          });
          if (serverSnapshot) {
            applyCommunityProjects(serverSnapshot.projects, { merge: true });
            setCachePending(
              newer.some(
                (candidate) =>
                  !serverSnapshot.projects.some(
                    (serverProject) =>
                      communityProjectKey(serverProject) ===
                        communityProjectKey(candidate) &&
                      serverProject.eventCreatedAt >= candidate.eventCreatedAt,
                  ),
              ),
            );
            router.refresh();
          }
        } catch (e) {
          if (!(e instanceof DOMException && e.name === "AbortError")) {
            console.warn("[labs] hackathon cache refresh failed", e);
          }
        } finally {
          setSyncingCache(false);
        }
      } else if (opts?.manual) {
        setCachePending(false);
        const serverSnapshot = await refreshNostrServerCache({
          scopes: ["projects"],
          hackathonId: hackathon.id,
          blocking: true,
          signal: abort.signal,
        });
        if (serverSnapshot) {
          applyCommunityProjects(serverSnapshot.projects, { merge: true });
          router.refresh();
        }
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      console.warn("[labs] hackathon scan failed", e);
    } finally {
      setScanning(false);
    }
  }

  useEffect(() => {
    const snapshotAbort = new AbortController();
    const cached =
      initialNostrSubmissions.length === 0
        ? getCachedCommunityProjects()
        : null;
    if (cached) {
      const filtered = cached.filter((p) => p.hackathon === hackathon.id);
      if (filtered.length > 0) {
        communityRef.current = filtered;
        setNostrSubmissions(filtered.map(fromCommunity));
        const pics = picturesFromCommunityProjects(filtered);
        if (pics.size > 0) setAuthorPictures(pics);
      }
    }
    syncServerSnapshot(snapshotAbort.signal)
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        console.warn("[labs] cached hackathon snapshot failed", e);
      })
      .finally(() => {
        if (!snapshotAbort.signal.aborted) {
          const idle = window.requestIdleCallback?.(
            () => refreshFromRelays(),
            { timeout: 1200 },
          );
          const fallback =
            idle === undefined
              ? window.setTimeout(() => refreshFromRelays(), 250)
              : null;
          snapshotAbort.signal.addEventListener(
            "abort",
            () => {
              if (idle !== undefined) window.cancelIdleCallback(idle);
              if (fallback !== null) window.clearTimeout(fallback);
            },
            { once: true },
          );
        }
      });
    return () => {
      snapshotAbort.abort();
      relayAbortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hackathon.id]);

  useEffect(() => {
    function onPublished(e: Event) {
      const { hackathonId, project } = (
        e as CustomEvent<{
          hackathonId: string;
          project?: CommunityProject;
        }>
      ).detail;
      if (hackathonId !== hackathon.id) return;
      sectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      if (project) upsertCommunityProject(project);
      refreshFromRelays({ manual: true });
    }
    window.addEventListener("labs:project-published", onPublished);
    return () =>
      window.removeEventListener("labs:project-published", onPublished);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hackathon.id]);

  const curated = merged.filter((p) => !p.nostrEventId);
  const nostrCount = merged.length - curated.length;
  const total = merged.length;
  const hasReports = curated.some((p) => p.report);
  const headerLabel =
    hasReports && nostrCount === 0
      ? "RANKING FINAL · JURADO AI"
      : hasReports
        ? "RANKING FINAL + ENVIADOS POR NOSTR"
        : "PROYECTOS INSCRIPTOS";

  return (
    <section
      id="votar"
      ref={sectionRef}
      className="scroll-mt-24 py-12 border-t border-border"
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-start justify-between gap-3 mb-6 flex-wrap">
          <div>
            <div className="inline-flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-foreground-subtle">
              {headerLabel}
              {(scanning || syncingCache || cachePending) && (
                <span className="inline-flex items-center gap-1 text-nostr">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {syncingCache || cachePending
                    ? "sincronizando cache"
                    : "sincronizando"}
                </span>
              )}
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold mt-1">
              {total} {total === 1 ? "proyecto" : "proyectos"}
              {nostrCount > 0 && (
                <>
                  {" · "}
                  <span className="text-nostr">{nostrCount} desde Nostr</span>
                </>
              )}
            </h2>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {isHackathonInscriptionOpen(hackathon) && (
              <HackathonInscripcionButton hackathonId={hackathon.id} />
            )}
            <button
              onClick={() => refreshFromRelays({ manual: true })}
              disabled={scanning}
              aria-label="Rescanear Nostr"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-white/[0.03] hover:bg-white/[0.06] text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-progress"
            >
              <RefreshCw
                className={cn("h-3.5 w-3.5", scanning && "animate-spin")}
              />
              <span className="hidden sm:inline">Rescanear Nostr</span>
            </button>
          </div>
        </div>

        {merged.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-foreground-muted">
            Aún no hay proyectos inscriptos para {hackathon.name}.
          </div>
        ) : (
          <>
            <ProjectVotingToolbar />
            <div className="space-y-2">
              {merged.map((p) => (
                <ProjectRow
                  key={p.nostrEventId ?? p.id}
                  project={p}
                  hackathonId={hackathon.id}
                  award={prizeByProjectId.get(p.id) ?? null}
                  nostrWinner={nostrWinnerByProjectId.get(p.id) ?? null}
                  authorPicture={
                    p.nostrAuthor
                      ? authorPictures.get(p.nostrAuthor)
                      : undefined
                  }
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function picturesFromSubmissions(projects: HackathonSubmission[]) {
  const pics = new Map<string, string>();
  for (const p of projects) {
    const author = p.nostrAuthor;
    const pic = p.team[0]?.picture;
    if (author && pic) pics.set(author, pic);
  }
  return pics;
}

function picturesFromCommunityProjects(projects: CommunityProject[]) {
  const pics = new Map<string, string>();
  for (const p of projects) {
    const pic = p.team[0]?.picture;
    if (pic) pics.set(p.author, pic);
  }
  return pics;
}

function ProjectRow({
  project,
  hackathonId,
  award,
  nostrWinner,
  authorPicture,
}: {
  project: HackathonSubmission;
  hackathonId: string;
  award: PrizedProject | null;
  nostrWinner: WinnerEntry | null;
  authorPicture?: string;
}) {
  const pos = project.report?.position ?? nostrWinner?.position ?? null;
  const score = project.report?.finalScore ?? null;
  const prize = award?.prize ?? nostrWinner?.sats ?? null;
  const isNostr = !!project.nostrEventId;
  const href = `/hackathons/${hackathonSlugForId(hackathonId)}/${project.id}`;
  const authorDisplayName = isNostr
    ? displayNameForNostrProject(project)
    : null;
  const team = dedupeSoldierProfileMembers(project.team);

  const linkProps = {
    href,
    onClick(event: MouseEvent<HTMLAnchorElement>) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      rememberScrollPosition(`/hackathons/${hackathonSlugForId(hackathonId)}`);
    },
  };

  return (
    <div className="group flex items-stretch rounded-xl border border-border bg-background-card hover:border-border-strong hover:-translate-y-0.5 transition-all overflow-hidden">
      <Link
        {...linkProps}
        className="flex min-w-0 flex-1 items-stretch gap-4"
      >
        <div className="flex flex-col items-center justify-center w-16 sm:w-20 shrink-0 border-r border-border bg-black/30 py-3">
          {pos ? (
            <>
              <div className="text-2xl leading-none">
                {medal(pos) || `#${pos}`}
              </div>
              {!(pos >= 1 && pos <= 3) && (
                <div className="text-[10px] font-mono text-foreground-subtle mt-1">
                  #{pos}
                </div>
              )}
              {score != null && (
                <div className="text-[10px] font-mono tabular-nums text-foreground-muted mt-1">
                  {score.toFixed(2)}
                </div>
              )}
            </>
          ) : isNostr ? (
            <>
              {authorPicture ? (
                <img
                  src={authorPicture}
                  alt=""
                  className="h-8 w-8 rounded-full object-cover ring-1 ring-nostr/40"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                    e.currentTarget.nextElementSibling?.classList.remove(
                      "hidden",
                    );
                  }}
                />
              ) : null}
              <CircleDashed
                className={cn(
                  "h-4 w-4 text-nostr",
                  authorPicture && "hidden",
                )}
              />
              <div
                className="mt-1 max-w-[3.75rem] truncate px-1 text-center text-[10px] font-mono font-semibold leading-tight text-nostr sm:max-w-[4.5rem]"
                title={authorDisplayName ?? undefined}
              >
                {authorDisplayName}
              </div>
            </>
          ) : (
            <div
              className={cn(
                "inline-flex items-center justify-center px-1.5 py-0.5 rounded-full border text-[8px] font-mono font-bold uppercase tracking-widest",
                STATUS_BADGE[project.status] ??
                  "bg-white/5 text-foreground-muted border-border",
              )}
            >
              {project.status}
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 py-3 pr-3 sm:pr-4 flex flex-col justify-center">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-display text-base sm:text-lg font-bold leading-tight group-hover:text-bitcoin transition-colors truncate">
                {project.name}
              </h3>
              <p className="text-xs text-foreground-muted mt-1 line-clamp-2">
                {project.description}
              </p>
            </div>
            {prize && (
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-bitcoin/10 border border-bitcoin/30 text-[10px] font-mono font-bold tabular-nums text-bitcoin whitespace-nowrap shrink-0">
                <Trophy className="h-3 w-3" />
                {formatSats(prize)} sats
              </span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-mono text-foreground-subtle">
            {team.length > 0 && (
              <span className="truncate">
                {team.map((t) => t.name).join(" · ")}
              </span>
            )}
            {project.repo && (
              <span className="inline-flex items-center gap-1">
                <GithubIcon className="h-3 w-3" />
                repo
              </span>
            )}
            {project.demo && (
              <span className="inline-flex items-center gap-1">
                <ExternalLink className="h-3 w-3" />
                demo
              </span>
            )}
            {isNostr && (
              <span className="inline-flex items-center gap-1 text-nostr">
                <Zap className="h-3 w-3" />
                submission firmada
              </span>
            )}
          </div>
        </div>
      </Link>

      <div className="flex shrink-0 items-center gap-2 pr-3 sm:pr-4">
        <ProjectVotingControls
          projectId={project.id}
          projectName={project.name}
        />
      </div>
    </div>
  );
}

function displayNameForNostrProject(project: HackathonSubmission): string {
  const author = project.nostrAuthor;
  const authorMember = author
    ? project.team.find((m) => m.pubkey === author)
    : null;
  const namedMember = project.team.find((m) => m.name.trim().length > 0);
  return (
    authorMember?.name.trim() ||
    namedMember?.name.trim() ||
    (author ? `${author.slice(0, 8)}…` : "Nostr")
  );
}
