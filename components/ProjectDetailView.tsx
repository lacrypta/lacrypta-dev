"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Archive,
  CircleDashed,
  ExternalLink,
  ImageIcon,
  Loader2,
  Pencil,
  SlidersHorizontal,
  Users,
  Video,
  Zap,
} from "lucide-react";
import { GithubIcon } from "@/components/BrandIcons";
import { cn } from "@/lib/cn";
import type { CommunityProject, UserProject } from "@/lib/userProjects";
import type { ProjectEditField } from "@/components/NewProjectModal";
import {
  dedupeSoldierProfileMembers,
  soldierProfileHref,
} from "@/lib/soldierProfileLinks";

type ProjectLike = UserProject &
  Partial<Pick<CommunityProject, "author" | "eventId" | "eventCreatedAt">>;

const STATUS_BADGE: Record<string, string> = {
  official: "bg-bitcoin/10 border-bitcoin/40 text-bitcoin",
  winner: "bg-lightning/10 border-lightning/40 text-lightning",
  finalist: "bg-cyan/10 border-cyan/40 text-cyan",
  submitted: "bg-nostr/10 border-nostr/30 text-nostr",
  building: "bg-white/5 border-border text-foreground-muted",
  idea: "bg-white/5 border-border text-foreground-subtle",
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

export function ProjectDetailView({
  project,
  authorPubkey,
  authorPicture,
  backHref,
  backLabel,
  contextLabel,
  isAuthor = false,
  revalidating = false,
  onEdit,
  archiveState,
  onArchive,
  onCancelArchive,
  reportSlot,
}: {
  project: ProjectLike;
  authorPubkey: string;
  authorPicture?: string;
  backHref: string;
  backLabel: string;
  contextLabel?: string;
  isAuthor?: boolean;
  revalidating?: boolean;
  onEdit?: (field?: ProjectEditField) => void;
  archiveState?: "idle" | "confirm" | "archiving";
  onArchive?: () => void;
  onCancelArchive?: () => void;
  reportSlot?: ReactNode;
}) {
  const galleryImages = project.images ?? [];
  const galleryThumbs = project.thumbs ?? [];
  const galleryVideos = project.videos ?? [];
  const hasGallery =
    galleryImages.length > 0 ||
    galleryThumbs.length > 0 ||
    galleryVideos.length > 0;
  const showGallery = hasGallery || isAuthor;
  const showTech = (project.tech && project.tech.length > 0) || isAuthor;
  const team = dedupeSoldierProfileMembers(project.team);
  const projectAvatar =
    project.logo ?? authorPicture ?? project.team[0]?.picture;

  const edit = (field?: ProjectEditField) => {
    onEdit?.(field);
  };

  return (
    <div className="relative pt-24 pb-16">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={backHref}
              className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-widest text-foreground-muted hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {backLabel}
            </Link>
            {revalidating && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-nostr/20 bg-nostr/10 px-2 py-1">
                <Loader2 className="h-2.5 w-2.5 animate-spin text-nostr" />
                <span className="text-[9px] font-mono text-nostr">
                  sincronizando...
                </span>
              </span>
            )}
          </div>
          {isAuthor && onEdit && (
            <button
              type="button"
              onClick={() => edit("all")}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-bitcoin/30 bg-bitcoin/10 px-4 py-2 text-sm font-semibold text-bitcoin transition-colors hover:bg-bitcoin/15"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Editar todo
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_280px]">
          <div className="min-w-0">
            <div className="relative mb-6">
              <div className="relative h-44 overflow-hidden rounded-2xl border border-border bg-background-card sm:h-56">
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
                {isAuthor && onEdit && (
                  <EditIconButton
                    label="Editar logo y cover"
                    onClick={() => edit("media")}
                    className="absolute right-3 top-3 border-white/20 bg-black/45 text-white hover:bg-bitcoin/20"
                  />
                )}
              </div>
              <div className="relative -mt-12 flex items-end justify-between gap-4 px-4">
                <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl border-4 border-background bg-background-card shadow-2xl shadow-black/30 ring-1 ring-border-strong">
                  {projectAvatar ? (
                    <img
                      src={projectAvatar}
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
                  {isAuthor && onEdit && (
                    <EditIconButton
                      label="Editar logo"
                      onClick={() => edit("media")}
                      className="absolute bottom-1.5 right-1.5 h-7 w-7 border-white/20 bg-black/55 text-white hover:bg-bitcoin/25"
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-2">
              {contextLabel && (
                <span className="text-[10px] font-mono tracking-widest text-foreground-subtle">
                  {contextLabel}
                </span>
              )}
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-mono font-semibold uppercase tracking-widest",
                  STATUS_BADGE[project.status] ??
                    "bg-white/5 text-foreground-muted border-border",
                )}
              >
                {project.status}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-nostr/30 bg-nostr/10 px-2 py-0.5 text-[9px] font-mono font-semibold tracking-widest text-nostr">
                <Zap className="h-2.5 w-2.5" />
                NOSTR
              </span>
              {isAuthor && onEdit && (
                <EditIconButton
                  label="Editar estado y hackatón"
                  onClick={() => edit("hackathon")}
                  className="h-7 w-7 rounded-full"
                />
              )}
            </div>

            <div className="flex items-start gap-3">
              <h1 className="min-w-0 flex-1 font-display text-4xl font-bold tracking-tight leading-tight sm:text-5xl">
                {project.name}
              </h1>
              {isAuthor && onEdit && (
                <EditIconButton
                  label="Editar nombre"
                  onClick={() => edit("name")}
                  className="mt-1"
                />
              )}
            </div>
            <div className="mt-4 flex items-start gap-3">
              <p className="min-w-0 flex-1 text-base text-foreground-muted leading-relaxed">
                {project.description}
              </p>
              {isAuthor && onEdit && (
                <EditIconButton
                  label="Editar descripción"
                  onClick={() => edit("description")}
                />
              )}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2 lg:hidden">
              <ProjectLinks project={project} />
              {isAuthor && onEdit && (
                <EditIconButton
                  label="Editar links"
                  onClick={() => edit("links")}
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
                  {isAuthor && onEdit && (
                    <EditIconButton
                      label="Editar imágenes y videos"
                      onClick={() => edit("gallery")}
                      className="h-7 w-7"
                    />
                  )}
                </div>
                {hasGallery ? (
                  <ProjectGallery
                    name={project.name}
                    images={galleryImages}
                    thumbs={galleryThumbs}
                    videos={galleryVideos}
                  />
                ) : (
                  <p className="text-xs text-foreground-subtle">
                    Sin media cargada.
                  </p>
                )}
              </section>
            )}

            {showTech && (
              <ProjectStack
                tech={project.tech ?? []}
                editable={isAuthor && !!onEdit}
                onEdit={() => edit("tech")}
                className="lg:hidden"
              />
            )}

            <div className="mt-6 rounded-xl border border-nostr/20 bg-nostr/5 p-4">
              <div className="mb-2 flex items-center gap-2">
                <CircleDashed className="h-3.5 w-3.5 text-nostr" />
                <span className="text-[10px] font-mono uppercase tracking-widest text-nostr">
                  Firmado en Nostr · kind:30078
                </span>
              </div>
              <div className="space-y-1">
                {project.eventId && (
                  <p className="text-[10px] font-mono text-foreground-subtle break-all">
                    <span className="text-foreground-muted">event </span>
                    {project.eventId}
                  </p>
                )}
                <p className="text-[10px] font-mono text-foreground-subtle break-all">
                  <span className="text-foreground-muted">pubkey </span>
                  {authorPubkey}
                </p>
                <p className="text-[10px] font-mono text-foreground-subtle break-all">
                  <span className="text-foreground-muted">d </span>
                  lacrypta.dev:project:{project.id}
                </p>
              </div>
            </div>

            {reportSlot}
          </div>

          <aside className="space-y-4">
            {(isAuthor && (onEdit || onArchive)) && (
              <ProjectActions
                archiveState={archiveState}
                onArchive={onArchive}
                onCancelArchive={onCancelArchive}
                onEdit={() => edit("all")}
              />
            )}

            {(project.repo || project.demo || isAuthor) && (
              <div className="hidden rounded-2xl border border-border bg-background-card p-5 lg:block">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-foreground-muted">
                    Links
                  </div>
                  {isAuthor && onEdit && (
                    <EditIconButton
                      label="Editar links"
                      onClick={() => edit("links")}
                      className="h-7 w-7"
                    />
                  )}
                </div>
                {project.repo || project.demo ? (
                  <div className="space-y-2">
                    <ProjectLinks project={project} fullWidth />
                  </div>
                ) : (
                  <p className="text-xs text-foreground-subtle">
                    Sin links cargados.
                  </p>
                )}
              </div>
            )}

            {showTech && (
              <ProjectStack
                tech={project.tech ?? []}
                editable={isAuthor && !!onEdit}
                onEdit={() => edit("tech")}
                className="hidden lg:block"
              />
            )}

            <div className="rounded-2xl border border-border bg-background-card p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-foreground-muted" />
                  <h2 className="text-xs font-mono uppercase tracking-widest text-foreground-muted font-bold">
                    Equipo
                  </h2>
                </div>
                {isAuthor && onEdit && (
                  <EditIconButton
                    label="Editar equipo"
                    onClick={() => edit("team")}
                    className="h-7 w-7"
                  />
                )}
              </div>
              {team.length === 0 ? (
                <p className="text-xs text-foreground-subtle">
                  Sin equipo cargado.
                </p>
              ) : (
                <ul className="space-y-2">
                  {team.map((m, i) => {
                    const pic = i === 0 ? (authorPicture ?? m.picture) : m.picture;
                    const displayName = m.name || m.nip05 || "Anónimo";
                    const profileHref = soldierProfileHref(m);
                    const memberContent = (
                      <>
                        {pic ? (
                          <img
                            src={pic}
                            alt=""
                            className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-nostr/40"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-nostr/30 to-bitcoin/30 text-xs font-display font-bold ring-1 ring-border-strong">
                            {displayName.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold transition-colors group-hover/member:text-nostr">
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
                        key={`${displayName}-${m.role}-${i}`}
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
    </div>
  );
}

function ProjectLinks({
  project,
  fullWidth = false,
}: {
  project: ProjectLike;
  fullWidth?: boolean;
}) {
  const className = cn(
    "inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-white/[0.03] px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-white/[0.06]",
    fullWidth && "w-full py-2",
  );
  return (
    <>
      {project.repo && (
        <a
          href={project.repo}
          target="_blank"
          rel="noopener noreferrer"
          className={className}
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
          className={className}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Demo
        </a>
      )}
    </>
  );
}

function ProjectGallery({
  name,
  images,
  thumbs,
  videos,
}: {
  name: string;
  images: string[];
  thumbs: string[];
  videos: string[];
}) {
  return (
    <div className="space-y-5">
      {images.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {images.map((src, idx) => (
            <img
              key={`${src}-${idx}`}
              src={src}
              alt={`${name} imagen ${idx + 1}`}
              className="aspect-video w-full rounded-lg border border-border bg-white/[0.03] object-cover"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          ))}
        </div>
      )}

      {thumbs.length > 0 && (
        <div>
          <div className="mb-2 text-[10px] font-mono uppercase tracking-widest text-foreground-subtle">
            Thumbs
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {thumbs.map((src, idx) => (
              <img
                key={`${src}-${idx}`}
                src={src}
                alt={`${name} thumb ${idx + 1}`}
                className="aspect-video w-full rounded-lg border border-border bg-white/[0.03] object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            ))}
          </div>
        </div>
      )}

      {videos.length > 0 && (
        <div>
          <div className="mb-2 inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-foreground-subtle">
            <Video className="h-3.5 w-3.5" />
            Videos
          </div>
          <div className="grid grid-cols-1 gap-3">
            {videos.map((src, idx) => (
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
  );
}

function ProjectStack({
  tech,
  editable,
  onEdit,
  className,
}: {
  tech: string[];
  editable: boolean;
  onEdit: () => void;
  className?: string;
}) {
  return (
    <div className={cn("mt-6 rounded-xl border border-border bg-background-card p-5", className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-[10px] font-mono uppercase tracking-widest text-foreground-muted">
          Stack
        </div>
        {editable && (
          <EditIconButton
            label="Editar stack"
            onClick={onEdit}
            className="h-7 w-7"
          />
        )}
      </div>
      {tech.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {tech.map((t) => (
            <span
              key={t}
              className="rounded-md border border-border bg-white/[0.03] px-2 py-0.5 text-[10px] font-mono text-foreground-muted"
            >
              {t}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-foreground-subtle">Sin stack cargado.</p>
      )}
    </div>
  );
}

function ProjectActions({
  archiveState = "idle",
  onArchive,
  onCancelArchive,
  onEdit,
}: {
  archiveState?: "idle" | "confirm" | "archiving";
  onArchive?: () => void;
  onCancelArchive?: () => void;
  onEdit?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background-card p-4 space-y-2">
      {onEdit && (
        <button
          onClick={onEdit}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-bitcoin/30 bg-bitcoin/5 px-3 py-2 text-xs font-semibold text-bitcoin transition-colors hover:bg-bitcoin/10"
        >
          <Pencil className="h-3.5 w-3.5" />
          Editar proyecto
        </button>
      )}
      {onArchive && archiveState === "idle" && (
        <button
          onClick={onArchive}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-white/[0.03] px-3 py-2 text-xs font-semibold transition-colors hover:border-danger/40 hover:bg-danger/10 hover:text-danger"
        >
          <Archive className="h-3.5 w-3.5" />
          Archivar
        </button>
      )}
      {onArchive && archiveState === "confirm" && (
        <div className="space-y-2">
          <p className="text-center text-[11px] text-foreground-muted">
            ¿Archivar este proyecto?
          </p>
          <div className="flex gap-2">
            <button
              onClick={onArchive}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-danger/50 bg-danger/10 px-3 py-2 text-xs font-semibold text-danger transition-colors"
            >
              Confirmar
            </button>
            <button
              onClick={onCancelArchive}
              className="flex-1 rounded-lg px-3 py-2 text-xs font-semibold text-foreground-muted transition-colors hover:bg-white/5 hover:text-foreground"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
      {archiveState === "archiving" && (
        <button
          disabled
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold opacity-60"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Archivando...
        </button>
      )}
    </div>
  );
}
