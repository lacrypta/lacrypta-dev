"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ExternalLink,
  ImageIcon,
  Pencil,
  SlidersHorizontal,
  Users,
  CircleDashed,
  Video,
  Zap,
} from "lucide-react";
import {
  fetchCommunityProjects,
  fetchCommunityProjectsSnapshot,
  fetchProjectByDTag,
  fetchAuthorPictures,
  TOP10_RELAYS,
  type UserProject,
} from "@/lib/userProjects";
import { GithubIcon } from "@/components/BrandIcons";
import { cn } from "@/lib/cn";
import { useAuth } from "@/lib/auth";
import { dedupeSoldierProfileMembers } from "@/lib/soldierProfileLinks";
import NewProjectModal, {
  type ProjectEditField,
} from "@/components/NewProjectModal";
import { projectMatchesIdentifier } from "@/lib/projectIdentity";

const STATUS_BADGE: Record<string, string> = {
  official: "bg-bitcoin/10 border-bitcoin/40 text-bitcoin",
  winner:   "bg-lightning/10 border-lightning/40 text-lightning",
  finalist: "bg-cyan/10 border-cyan/40 text-cyan",
  submitted:"bg-nostr/10 border-nostr/30 text-nostr",
  building: "bg-white/5 border-border text-foreground-muted",
  idea:     "bg-white/5 border-border text-foreground-subtle",
};

function EditIconButton({
  label,
  onClick,
  className,
}: {
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-white/[0.03] text-foreground-subtle transition-colors hover:border-bitcoin/40 hover:bg-bitcoin/10 hover:text-bitcoin",
        className,
      )}
    >
      <Pencil className="h-3.5 w-3.5" />
    </button>
  );
}

export default function StandaloneProjectPage({
  pubkey,
  projectId,
}: {
  pubkey: string;
  projectId: string;
}) {
  const [project, setProject] = useState<UserProject | null | undefined>(undefined);
  const [authorPicture, setAuthorPicture] = useState<string | undefined>();
  const [editOpen, setEditOpen] = useState(false);
  const [editFocus, setEditFocus] = useState<ProjectEditField>("all");
  const { auth } = useAuth();

  useEffect(() => {
    const abort = new AbortController();
    let cancelled = false;

    async function loadProject() {
      const showProject = (p: UserProject, author = pubkey) => {
        setProject(p);
        fetchAuthorPictures([author], TOP10_RELAYS).then((pics) => {
          if (!cancelled) setAuthorPicture(pics.get(author));
        });
      };

      const direct = await fetchProjectByDTag(pubkey, projectId, TOP10_RELAYS);
      if (cancelled) return;
      if (direct) {
        showProject(direct);
        return;
      }

      const snapshot = await fetchCommunityProjectsSnapshot({
        signal: abort.signal,
      }).catch(() => null);
      if (cancelled) return;
      const fromSnapshot =
        snapshot?.projects.find(
          (p) =>
            p.author === pubkey &&
            projectMatchesIdentifier(p, projectId),
        ) ?? null;
      if (fromSnapshot) {
        showProject(fromSnapshot, fromSnapshot.author);
        return;
      }

      const broad = await fetchCommunityProjects(TOP10_RELAYS, {
        perRelayTimeoutMs: 5000,
        signal: abort.signal,
      }).catch(() => []);
      if (cancelled) return;
      const fromRelays =
        broad.find(
          (p) =>
            p.author === pubkey &&
            projectMatchesIdentifier(p, projectId),
        ) ?? null;
      if (fromRelays) showProject(fromRelays, fromRelays.author);
      else setProject(null);
    }

    loadProject().catch(() => {
      if (!cancelled) setProject(null);
    });

    return () => {
      cancelled = true;
      abort.abort();
    };
  }, [pubkey, projectId]);

  const backHref = project?.hackathon ? `/hackathons/${project.hackathon}` : "/projects";
  const backLabel = project?.hackathon ? project.hackathon.toUpperCase() : "Proyectos";
  const isAuthor = auth?.pubkey === pubkey;

  function openEditor(field: ProjectEditField = "all") {
    setEditFocus(field);
    setEditOpen(true);
  }

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

  const galleryImages = project.images ?? [];
  const galleryThumbs = project.thumbs ?? [];
  const galleryVideos = project.videos ?? [];
  const hasGallery =
    galleryImages.length > 0 ||
    galleryThumbs.length > 0 ||
    galleryVideos.length > 0;
  const showGallery = hasGallery || isAuthor;
  const team = dedupeSoldierProfileMembers(project.team);

  return (
    <>
      <div className="relative pt-24 pb-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <Link
              href={backHref}
              className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-widest text-foreground-muted hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {backLabel}
            </Link>
            {isAuthor && (
              <button
                type="button"
                onClick={() => openEditor("all")}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-bitcoin/30 bg-bitcoin/10 px-4 py-2 text-sm font-semibold text-bitcoin transition-colors hover:bg-bitcoin/15"
              >
                <SlidersHorizontal className="h-4 w-4" />
                Editar todo
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-8">
            <div className="min-w-0">
              <div className="relative mb-6">
                <div className="relative h-44 sm:h-56 overflow-hidden rounded-2xl border border-border bg-background-card">
                  {project.cover ? (
                    <img
                      src={project.cover}
                      alt={`${project.name} cover`}
                      className="absolute inset-0 h-full w-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(247,147,26,0.24),transparent_35%),radial-gradient(circle_at_80%_20%,rgba(168,85,247,0.18),transparent_34%),linear-gradient(135deg,rgba(15,23,42,0.92),rgba(9,9,16,0.95))]" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
                  {isAuthor && (
                    <EditIconButton
                      label="Editar logo y cover"
                      onClick={() => openEditor("media")}
                      className="absolute right-3 top-3 border-white/20 bg-black/45 text-white hover:bg-bitcoin/20"
                    />
                  )}
                </div>
                <div className="relative -mt-12 flex items-end justify-between gap-4 px-4">
                  <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl border-4 border-background bg-background-card shadow-2xl shadow-black/30 ring-1 ring-border-strong">
                    {project.logo ? (
                      <img
                        src={project.logo}
                        alt={`${project.name} logo`}
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-bitcoin/30 to-nostr/30 text-2xl font-display font-bold">
                        {project.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    {isAuthor && (
                      <EditIconButton
                        label="Editar logo"
                        onClick={() => openEditor("media")}
                        className="absolute bottom-1.5 right-1.5 h-7 w-7 border-white/20 bg-black/55 text-white hover:bg-bitcoin/25"
                      />
                    )}
                  </div>
                </div>
              </div>

              <div className="mb-3 flex flex-wrap items-center gap-2">
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
                {isAuthor && (
                  <EditIconButton
                    label="Editar estado y hackatón"
                    onClick={() => openEditor("hackathon")}
                    className="h-7 w-7 rounded-full"
                  />
                )}
              </div>

              <div className="flex items-start gap-3">
                <h1 className="min-w-0 flex-1 font-display text-4xl sm:text-5xl font-bold tracking-tight leading-tight">
                  {project.name}
                </h1>
                {isAuthor && (
                  <EditIconButton
                    label="Editar nombre"
                    onClick={() => openEditor("name")}
                    className="mt-1"
                  />
                )}
              </div>
              <div className="mt-4 flex items-start gap-3">
                <p className="min-w-0 flex-1 text-base text-foreground-muted leading-relaxed">
                  {project.description}
                </p>
                {isAuthor && (
                  <EditIconButton
                    label="Editar descripción"
                    onClick={() => openEditor("description")}
                  />
                )}
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-2 lg:hidden">
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
                {isAuthor && (
                  <EditIconButton
                    label="Editar links"
                    onClick={() => openEditor("links")}
                  />
                )}
              </div>

              {showGallery && (
                <section className="mt-6 rounded-xl border border-border bg-background-card p-5">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <ImageIcon className="h-4 w-4 text-foreground-muted" />
                      <h2 className="text-xs font-mono uppercase tracking-widest text-foreground-muted font-bold">
                        Imágenes y videos
                      </h2>
                    </div>
                    {isAuthor && (
                      <EditIconButton
                        label="Editar imágenes y videos"
                        onClick={() => openEditor("gallery")}
                        className="h-7 w-7"
                      />
                    )}
                  </div>
                  {hasGallery ? (
                    <div className="space-y-5">
                      {galleryImages.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {galleryImages.map((src, idx) => (
                            <img
                              key={`${src}-${idx}`}
                              src={src}
                              alt={`${project.name} imagen ${idx + 1}`}
                              className="aspect-video w-full rounded-lg border border-border object-cover bg-white/[0.03]"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                          ))}
                        </div>
                      )}

                      {galleryThumbs.length > 0 && (
                        <div>
                          <div className="mb-2 text-[10px] font-mono uppercase tracking-widest text-foreground-subtle">
                            Thumbs
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {galleryThumbs.map((src, idx) => (
                              <img
                                key={`${src}-${idx}`}
                                src={src}
                                alt={`${project.name} thumb ${idx + 1}`}
                                className="aspect-video w-full rounded-lg border border-border object-cover bg-white/[0.03]"
                                onError={(e) => {
                                  e.currentTarget.style.display = "none";
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      {galleryVideos.length > 0 && (
                        <div>
                          <div className="mb-2 inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-foreground-subtle">
                            <Video className="h-3.5 w-3.5" />
                            Videos
                          </div>
                          <div className="grid grid-cols-1 gap-3">
                            {galleryVideos.map((src, idx) => (
                              <video
                                key={`${src}-${idx}`}
                                src={src}
                                className="aspect-video w-full rounded-lg border border-border bg-black object-cover"
                                controls
                                playsInline
                                preload="metadata"
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-foreground-subtle">Sin media cargada.</p>
                  )}
                </section>
              )}

              {(project.tech && project.tech.length > 0 || isAuthor) && (
                <div className="mt-6 rounded-xl border border-border bg-background-card p-5 lg:hidden">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="text-[10px] font-mono uppercase tracking-widest text-foreground-muted">Stack</div>
                    {isAuthor && (
                      <EditIconButton
                        label="Editar stack"
                        onClick={() => openEditor("tech")}
                        className="h-7 w-7"
                      />
                    )}
                  </div>
                  {project.tech && project.tech.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {project.tech.map((t) => (
                        <span key={t} className="px-2 py-0.5 rounded-md border border-border bg-white/[0.03] text-[10px] font-mono text-foreground-muted">
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-foreground-subtle">Sin stack cargado.</p>
                  )}
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
                    <span className="text-foreground-muted">d </span>lacrypta.dev:project:{projectId}
                  </p>
                </div>
              </div>
            </div>

            <aside className="space-y-4">
              {(project.repo || project.demo || isAuthor) && (
                <div className="hidden lg:block rounded-2xl border border-border bg-background-card p-5">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="text-[10px] font-mono uppercase tracking-widest text-foreground-muted">Links</div>
                    {isAuthor && (
                      <EditIconButton
                        label="Editar links"
                        onClick={() => openEditor("links")}
                        className="h-7 w-7"
                      />
                    )}
                  </div>
                  {(project.repo || project.demo) ? (
                    <div className="space-y-2">
                      {project.repo && (
                        <a
                          href={project.repo}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-white/[0.03] px-3 py-2 text-xs font-semibold transition-colors hover:bg-white/[0.06]"
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
                          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-white/[0.03] px-3 py-2 text-xs font-semibold transition-colors hover:bg-white/[0.06]"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Demo
                        </a>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-foreground-subtle">Sin links cargados.</p>
                  )}
                </div>
              )}

              {(project.tech && project.tech.length > 0 || isAuthor) && (
                <div className="hidden lg:block rounded-2xl border border-border bg-background-card p-5">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="text-[10px] font-mono uppercase tracking-widest text-foreground-muted">Stack</div>
                    {isAuthor && (
                      <EditIconButton
                        label="Editar stack"
                        onClick={() => openEditor("tech")}
                        className="h-7 w-7"
                      />
                    )}
                  </div>
                  {project.tech && project.tech.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {project.tech.map((t) => (
                        <span key={t} className="px-2 py-0.5 rounded-md border border-border bg-white/[0.03] text-[10px] font-mono text-foreground-muted">
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-foreground-subtle">Sin stack cargado.</p>
                  )}
                </div>
              )}

              <div className="rounded-2xl border border-border bg-background-card p-5">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-foreground-muted" />
                    <h2 className="text-xs font-mono uppercase tracking-widest text-foreground-muted font-bold">Equipo</h2>
                  </div>
                  {isAuthor && (
                    <EditIconButton
                      label="Editar equipo"
                      onClick={() => openEditor("team")}
                      className="h-7 w-7"
                    />
                  )}
                </div>
                {team.length === 0 ? (
                  <p className="text-xs text-foreground-subtle">Sin equipo cargado.</p>
                ) : (
                  <ul className="space-y-2">
                    {team.map((m, i) => {
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
      {isAuthor && (
        <NewProjectModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          editProject={project}
          initialFocus={editFocus}
          onSaved={(updated) => setProject(updated)}
        />
              )}
    </>
  );
}
