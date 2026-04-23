"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CircleDashed,
  ExternalLink,
  Loader2,
  RefreshCw,
  Trophy,
  Zap,
} from "lucide-react";
import {
  mergeWithSubmissions,
  prizedProjects,
  type Hackathon,
  type HackathonProject,
  type HackathonSubmission,
  type PrizedProject,
} from "@/lib/hackathons";
import {
  fetchCommunityProjects,
  getCachedCommunityProjects,
  TOP10_RELAYS,
  type CommunityProject,
} from "@/lib/userProjects";
import { formatSats } from "@/lib/hackathons";
import { GithubIcon } from "@/components/BrandIcons";
import { cn } from "@/lib/cn";

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

export default function HackathonProjectsList({
  hackathon,
}: {
  hackathon: Hackathon;
}) {
  const [nostrSubmissions, setNostrSubmissions] = useState<
    HackathonSubmission[]
  >(() => {
    const cached = getCachedCommunityProjects();
    if (!cached) return [];
    return cached
      .filter((p) => p.hackathon === hackathon.id)
      .map(fromCommunity);
  });
  const [scanning, setScanning] = useState(false);

  const awards = useMemo<PrizedProject[]>(
    () => prizedProjects(hackathon.id),
    [hackathon.id],
  );
  const prizeByProjectId = useMemo(
    () => new Map(awards.map((a) => [a.project.id, a])),
    [awards],
  );

  const merged = useMemo(
    () => mergeWithSubmissions(hackathon.id, nostrSubmissions),
    [hackathon.id, nostrSubmissions],
  );

  async function scan() {
    if (scanning) return;
    setScanning(true);
    try {
      const all = await fetchCommunityProjects(TOP10_RELAYS);
      setNostrSubmissions(
        all.filter((p) => p.hackathon === hackathon.id).map(fromCommunity),
      );
    } catch (e) {
      console.warn("[labs] hackathon scan failed", e);
    } finally {
      setScanning(false);
    }
  }

  useEffect(() => {
    scan();
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
    <section className="py-12 border-t border-border">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-start justify-between gap-3 mb-6 flex-wrap">
          <div>
            <div className="inline-flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-foreground-subtle">
              {headerLabel}
              {scanning && (
                <span className="inline-flex items-center gap-1 text-nostr">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  sincronizando
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
          <button
            onClick={scan}
            disabled={scanning}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-white/[0.03] hover:bg-white/[0.06] text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-progress"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", scanning && "animate-spin")}
            />
            <span className="hidden sm:inline">Rescanear Nostr</span>
          </button>
        </div>

        {merged.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-foreground-muted">
            Aún no hay proyectos inscriptos para {hackathon.name}.
          </div>
        ) : (
          <div className="space-y-2">
            {merged.map((p) => (
              <ProjectRow
                key={p.nostrEventId ?? p.id}
                project={p}
                hackathonId={hackathon.id}
                award={prizeByProjectId.get(p.id) ?? null}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ProjectRow({
  project,
  hackathonId,
  award,
}: {
  project: HackathonSubmission;
  hackathonId: string;
  award: PrizedProject | null;
}) {
  const pos = project.report?.position;
  const score = project.report?.finalScore;
  const prize = award?.prize ?? null;
  const isNostr = !!project.nostrEventId;
  const href = isNostr
    ? project.demo || project.repo || "#"
    : `/hackathons/${hackathonId}/${project.id}`;
  const external = isNostr;

  const Wrapper: React.ElementType = isNostr ? "a" : Link;
  const wrapperProps = isNostr
    ? {
        href,
        target: "_blank",
        rel: "noopener noreferrer",
      }
    : { href };

  return (
    <Wrapper
      {...wrapperProps}
      className="group flex items-stretch gap-4 rounded-xl border border-border bg-background-card hover:border-border-strong hover:-translate-y-0.5 transition-all overflow-hidden"
    >
      <div className="flex flex-col items-center justify-center w-16 sm:w-20 shrink-0 border-r border-border bg-black/30 py-3">
        {pos ? (
          <>
            <div className="text-2xl leading-none">{medal(pos) || `#${pos}`}</div>
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
            <CircleDashed className="h-4 w-4 text-nostr" />
            <div className="mt-1 text-[9px] font-mono uppercase tracking-widest text-nostr">
              NOSTR
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
          {project.team.length > 0 && (
            <span className="truncate">
              {project.team.map((t) => t.name).join(" · ")}
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

      <div className="flex items-center pr-4 shrink-0">
        <ArrowRight className="h-4 w-4 text-foreground-muted group-hover:text-bitcoin group-hover:translate-x-0.5 transition-all" />
      </div>
    </Wrapper>
  );
}
