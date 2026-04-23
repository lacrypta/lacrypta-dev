"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  ExternalLink,
  Search,
  Users,
  Calendar,
  Radio,
  Loader2,
  RefreshCw,
  Check,
  XCircle,
  CircleDashed,
} from "lucide-react";
import {
  PROJECTS,
  deriveTags,
  HACKATHON_LABELS,
  type Project,
  type ProjectStatus,
} from "@/lib/projects";
import {
  fetchCommunityProjects,
  getCachedCommunityProjects,
  TOP10_RELAYS,
  type CommunityProject,
  type CommunityScanProgress,
  type RelayScanStatus,
} from "@/lib/userProjects";
import { GithubIcon } from "@/components/BrandIcons";
import { cn } from "@/lib/cn";

type ProjectSource = "builtin" | "nostr";

type DisplayProject = {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  tags: string[];
  tech?: string[];
  team: { name: string; github: string; role: string }[];
  repo?: string;
  demo?: string;
  website?: string;
  year?: number;
  hackathon?: Project["hackathon"];
  submittedAt?: string;
  source: ProjectSource;
  /** Nostr author pubkey (hex), only for source=nostr */
  author?: string;
  nostrCreatedAt?: number;
};

type FilterId =
  | "all"
  | "nostr-live"
  | "official"
  | "foundations"
  | "identity"
  | "lightning"
  | "nostr"
  | "bitcoin"
  | "ai";

const FILTERS: { id: FilterId; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "nostr-live", label: "Desde Nostr" },
  { id: "official", label: "Oficiales" },
  { id: "foundations", label: "Foundations · Mar 2026" },
  { id: "identity", label: "Identity · Abr 2026" },
  { id: "lightning", label: "Lightning" },
  { id: "nostr", label: "Nostr" },
  { id: "bitcoin", label: "Bitcoin" },
  { id: "ai", label: "IA" },
];

type BadgeStyle = { text: string; bg: string; border: string; label: string };

function getBadge(project: DisplayProject): BadgeStyle {
  if (project.source === "nostr") {
    return {
      text: "text-nostr",
      bg: "bg-nostr/10",
      border: "border-nostr/40",
      label: "NOSTR",
    };
  }
  if (project.status === "official") {
    return {
      text: "text-bitcoin",
      bg: "bg-bitcoin/10",
      border: "border-bitcoin/40",
      label: "OFICIAL",
    };
  }
  if (project.status === "live") {
    return {
      text: "text-success",
      bg: "bg-success/10",
      border: "border-success/30",
      label: "EN LÍNEA",
    };
  }
  return {
    text: "text-cyan",
    bg: "bg-cyan/10",
    border: "border-cyan/30",
    label: "COMMUNITY",
  };
}

const TAG_STYLES: Record<string, string> = {
  bitcoin: "bg-bitcoin/10 text-bitcoin border-bitcoin/30",
  lightning: "bg-lightning/10 text-lightning border-lightning/30",
  nostr: "bg-nostr/10 text-nostr border-nostr/30",
  infra: "bg-cyan/10 text-cyan border-cyan/30",
  ai: "bg-success/10 text-success border-success/30",
  wallet: "bg-white/5 text-foreground-muted border-border",
};

function toDisplay(p: Project): DisplayProject {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    status: p.status,
    tags: deriveTags(p),
    tech: p.tech,
    team: p.team,
    repo: p.repo,
    demo: p.demo,
    hackathon: p.hackathon,
    submittedAt: p.submittedAt,
    source: "builtin",
  };
}

function nostrToDisplay(np: CommunityProject): DisplayProject {
  const team =
    np.team && np.team.length > 0
      ? np.team.map((m) => ({
          name: m.name,
          github: m.github ?? "",
          role: m.role,
        }))
      : [
          {
            name: `${np.author.slice(0, 8)}…${np.author.slice(-4)}`,
            github: "",
            role: "Builder",
          },
        ];
  return {
    id: `nostr:${np.author}:${np.id}`,
    name: np.name,
    description: np.description ?? "",
    status: np.status ?? "submitted",
    tags: np.tech ?? [],
    tech: np.tech,
    team,
    repo: np.repo,
    demo: np.demo,
    hackathon:
      np.hackathon === "foundations" || np.hackathon === "identity"
        ? np.hackathon
        : undefined,
    source: "nostr",
    author: np.author,
    nostrCreatedAt: np.eventCreatedAt,
  };
}

export default function ProjectsGrid() {
  const [filter, setFilter] = useState<FilterId>("all");
  const [query, setQuery] = useState("");
  const {
    projects: nostrProjects,
    scanning,
    progress,
    error: scanError,
    rescan,
  } = useNostrCommunityProjects();

  const allProjects = useMemo<DisplayProject[]>(() => {
    const builtins = PROJECTS.map(toDisplay);
    const nostr = nostrProjects.map(nostrToDisplay);
    // Dedupe: if a Nostr project shares name+repo with a builtin, skip builtin is trivial; here we prefer builtin for curated copy
    const builtinKeys = new Set(
      builtins.map((p) => (p.repo ?? p.name).toLowerCase()),
    );
    const uniqueNostr = nostr.filter(
      (p) => !builtinKeys.has((p.repo ?? p.name).toLowerCase()),
    );
    return [...builtins, ...uniqueNostr];
  }, [nostrProjects]);

  const filtered = useMemo(() => {
    let out = allProjects;
    if (filter === "nostr-live") {
      out = out.filter((p) => p.source === "nostr");
    } else if (filter === "official") {
      out = out.filter(
        (p) =>
          p.source === "builtin" &&
          (p.status === "official" || p.status === "live"),
      );
    } else if (filter === "foundations" || filter === "identity") {
      out = out.filter((p) => p.hackathon === filter);
    } else if (["lightning", "nostr", "bitcoin", "ai"].includes(filter)) {
      out = out.filter((p) =>
        p.tags.map((t) => t.toLowerCase()).includes(filter),
      );
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      out = out.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          (p.tech ?? []).some((t) => t.toLowerCase().includes(q)) ||
          p.team.some((m) => m.name.toLowerCase().includes(q)),
      );
    }
    return [...out].sort((a, b) => {
      // Nostr projects first (freshest)
      if (a.source !== b.source) return a.source === "nostr" ? -1 : 1;
      if (a.source === "nostr") {
        return (b.nostrCreatedAt ?? 0) - (a.nostrCreatedAt ?? 0);
      }
      const order: ProjectStatus[] = [
        "live",
        "official",
        "winner",
        "finalist",
        "submitted",
        "building",
        "idea",
      ];
      const ai = order.indexOf(a.status);
      const bi = order.indexOf(b.status);
      if (ai !== bi) return ai - bi;
      return (b.submittedAt ?? "").localeCompare(a.submittedAt ?? "");
    });
  }, [allProjects, filter, query]);

  return (
    <section className="relative py-16 sm:py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <NostrScanPanel
          scanning={scanning}
          progress={progress}
          error={scanError}
          projectCount={nostrProjects.length}
          onRescan={rescan}
        />

        <div className="flex flex-col gap-4 mb-10">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground-subtle" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar proyectos, tecnologías o builders…"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.03] border border-border focus:border-bitcoin/50 focus:bg-white/[0.05] text-sm placeholder:text-foreground-subtle transition-colors"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => {
              const active = filter === f.id;
              const isNostr = f.id === "nostr-live";
              return (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all",
                    active
                      ? isNostr
                        ? "bg-nostr text-white shadow-lg shadow-nostr/20"
                        : "bg-bitcoin text-black shadow-lg shadow-bitcoin/20"
                      : isNostr
                        ? "bg-nostr/10 text-nostr border border-nostr/30 hover:bg-nostr/20"
                        : "bg-white/[0.03] text-foreground-muted border border-border hover:bg-white/[0.06] hover:text-foreground",
                  )}
                >
                  {isNostr && <Radio className="h-3 w-3" />}
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mb-6 text-sm font-mono text-foreground-subtle">
          {filtered.length} proyecto{filtered.length !== 1 ? "s" : ""}
          {nostrProjects.length > 0 && (
            <>
              {" · "}
              <span className="text-nostr">
                {nostrProjects.length} desde Nostr
              </span>
            </>
          )}
        </div>

        <motion.div
          layout
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          <AnimatePresence mode="popLayout">
            {filtered.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </AnimatePresence>
        </motion.div>

        {filtered.length === 0 && (
          <div className="py-20 text-center">
            <p className="font-display text-2xl font-bold mb-2">
              No hay proyectos que coincidan
            </p>
            <p className="text-foreground-muted text-sm">
              Probá limpiar el filtro o la búsqueda para ver todo.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

/* ─────────────────────────── Nostr scan hook ───────────────────────────── */

function useNostrCommunityProjects() {
  const [projects, setProjects] = useState<CommunityProject[]>([]);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<CommunityScanProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function scan() {
    if (scanning) return;
    setScanning(true);
    setError(null);
    const abort = new AbortController();
    abortRef.current = abort;
    try {
      const result = await fetchCommunityProjects(TOP10_RELAYS, {
        signal: abort.signal,
        onProgress: (p) => {
          setProgress(p);
        },
      });
      setProjects(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setScanning(false);
    }
  }

  useEffect(() => {
    // Hydrate cache + kick off scan
    const cached = getCachedCommunityProjects();
    if (cached) setProjects(cached);
    scan();
    return () => {
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { projects, scanning, progress, error, rescan: scan };
}

/* ─────────────────────── Nostr scan progress panel ─────────────────────── */

function NostrScanPanel({
  scanning,
  progress,
  error,
  projectCount,
  onRescan,
}: {
  scanning: boolean;
  progress: CommunityScanProgress | null;
  error: string | null;
  projectCount: number;
  onRescan: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const total = progress?.totalRelays ?? TOP10_RELAYS.length;
  const completed = progress?.completedRelays ?? 0;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="mb-8 rounded-2xl border border-nostr/20 bg-gradient-to-br from-nostr/5 to-transparent overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4">
        <div className="relative h-9 w-9 shrink-0 rounded-xl bg-nostr/15 border border-nostr/30 flex items-center justify-center">
          {scanning ? (
            <Loader2 className="h-4 w-4 animate-spin text-nostr" />
          ) : (
            <Radio className="h-4 w-4 text-nostr" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-nostr mb-0.5">
            <span>NIP-78 · KIND 30078</span>
            <span className="text-foreground-subtle">·</span>
            <span className="text-foreground-muted">
              tag{" "}
              <span className="font-semibold text-foreground">
                #lacrypta-labs-project
              </span>
            </span>
          </div>
          <div className="font-display font-bold text-sm truncate">
            {scanning
              ? `Escaneando ${total} relays…`
              : error
                ? "Error escaneando relays"
                : projectCount > 0
                  ? `${projectCount} proyecto${projectCount !== 1 ? "s" : ""} encontrados en Nostr`
                  : "No se encontraron proyectos en Nostr todavía"}
          </div>
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="hidden sm:inline-flex items-center text-[10px] font-mono uppercase tracking-widest text-foreground-subtle hover:text-foreground transition-colors"
        >
          {expanded ? "ocultar" : "detalles"}
        </button>
        <button
          onClick={onRescan}
          disabled={scanning}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-white/[0.03] hover:bg-white/[0.06] text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-progress"
          aria-label="Rescanear"
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", scanning && "animate-spin")}
          />
          <span className="hidden sm:inline">Rescanear</span>
        </button>
      </div>

      <div className="h-1.5 bg-black/40 relative overflow-hidden">
        <motion.div
          className="absolute left-0 top-0 h-full bg-gradient-to-r from-nostr via-purple-500 to-nostr"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
        {scanning && (
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-pulse" />
        )}
      </div>

      <AnimatePresence>
        {(expanded || scanning) && progress && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-border/60"
          >
            <div className="px-5 py-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
              {progress.relays.map((r) => (
                <RelayRow key={r.relay} status={r} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <div className="px-5 py-2 text-[11px] font-mono text-danger bg-danger/5 border-t border-danger/30">
          {error}
        </div>
      )}
    </div>
  );
}

function RelayRow({ status }: { status: RelayScanStatus }) {
  const iconProps = { className: "h-3 w-3 shrink-0" } as const;
  const state = status.state;
  const icon =
    state === "done" ? (
      <Check {...iconProps} className="h-3 w-3 shrink-0 text-success" />
    ) : state === "error" ? (
      <XCircle {...iconProps} className="h-3 w-3 shrink-0 text-danger" />
    ) : state === "receiving" ? (
      <Loader2 {...iconProps} className="h-3 w-3 shrink-0 text-nostr animate-spin" />
    ) : state === "connecting" ? (
      <Loader2 {...iconProps} className="h-3 w-3 shrink-0 text-foreground-muted animate-spin" />
    ) : (
      <CircleDashed {...iconProps} className="h-3 w-3 shrink-0 text-foreground-subtle" />
    );

  return (
    <div className="flex items-center gap-2 text-[11px] font-mono">
      {icon}
      <span className="text-foreground-muted truncate flex-1">
        {status.relay.replace("wss://", "")}
      </span>
      {status.events > 0 && (
        <span className="text-nostr tabular-nums">
          {status.events} ev
        </span>
      )}
      {status.error && (
        <span className="text-danger/80 truncate max-w-[40%]" title={status.error}>
          {status.error}
        </span>
      )}
    </div>
  );
}

/* ─────────────────────────── card ──────────────────────────────────────── */

function ProjectCard({ project }: { project: DisplayProject }) {
  const status = getBadge(project);
  const href = project.demo || project.website || project.repo || "#";
  const external = Boolean(project.demo || project.website || project.repo);

  const Wrapper: React.ElementType = external ? "a" : "div";
  const wrapperProps = external
    ? { href, target: "_blank", rel: "noopener noreferrer" }
    : {};

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.3 }}
    >
      <Wrapper
        {...wrapperProps}
        className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-background-card hover:border-border-strong hover:-translate-y-1 transition-all"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

        <div className="relative flex flex-col h-full p-6">
          <div className="flex items-start justify-between gap-3 mb-4">
            <span
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-mono font-semibold tracking-widest whitespace-nowrap",
                status.bg,
                status.border,
                status.text,
              )}
            >
              {project.source === "nostr" && <Radio className="h-2.5 w-2.5" />}
              {status.label}
            </span>
            {project.hackathon && (
              <span className="inline-flex items-center gap-1 text-[10px] font-mono text-foreground-subtle">
                <Calendar className="h-3 w-3" />
                {HACKATHON_LABELS[project.hackathon].split(" · ")[1]}
              </span>
            )}
            {project.source === "nostr" && project.nostrCreatedAt && (
              <span className="inline-flex items-center gap-1 text-[10px] font-mono text-foreground-subtle">
                <Calendar className="h-3 w-3" />
                {new Date(project.nostrCreatedAt * 1000).toLocaleDateString(
                  "es-AR",
                  { day: "2-digit", month: "short" },
                )}
              </span>
            )}
          </div>

          <h3 className="font-display text-xl font-bold mb-2 tracking-tight group-hover:text-bitcoin transition-colors break-words">
            {project.name}
          </h3>
          <p className="text-sm text-foreground-muted leading-relaxed line-clamp-4">
            {project.description}
          </p>

          {project.team.length > 0 && (
            <div className="mt-4 flex items-center gap-1.5 text-xs text-foreground-muted">
              <Users className="h-3.5 w-3.5 opacity-60" />
              <span className="truncate">
                {project.team.map((m) => m.name).join(" · ")}
              </span>
            </div>
          )}

          {project.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {project.tags.slice(0, 4).map((tag) => (
                <span
                  key={tag}
                  className={cn(
                    "px-2 py-0.5 rounded-md border text-[10px] font-mono font-semibold uppercase tracking-wider",
                    TAG_STYLES[tag.toLowerCase()] ?? TAG_STYLES.wallet,
                  )}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {project.tech && project.tech.length > 0 && project.source !== "nostr" && (
            <div className="mt-3 flex flex-wrap gap-1">
              {project.tech.slice(0, 5).map((t) => (
                <span
                  key={t}
                  className="px-1.5 py-0.5 rounded text-[10px] font-mono text-foreground-subtle bg-white/[0.03] border border-border"
                >
                  {t}
                </span>
              ))}
              {project.tech.length > 5 && (
                <span className="px-1.5 py-0.5 text-[10px] font-mono text-foreground-subtle">
                  +{project.tech.length - 5}
                </span>
              )}
            </div>
          )}

          <div className="mt-auto pt-5 border-t border-border flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-foreground-muted">
              {project.repo && (
                <span className="inline-flex items-center gap-1 text-xs hover:text-foreground transition-colors">
                  <GithubIcon className="h-3.5 w-3.5" />
                  Repo
                </span>
              )}
              {(project.demo || project.website) && (
                <span className="inline-flex items-center gap-1 text-xs hover:text-foreground transition-colors">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Sitio
                </span>
              )}
            </div>
            <ArrowUpRight className="h-4 w-4 text-foreground-muted group-hover:text-bitcoin group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-all" />
          </div>
        </div>
      </Wrapper>
    </motion.div>
  );
}
