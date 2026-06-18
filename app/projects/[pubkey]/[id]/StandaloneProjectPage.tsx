"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  fetchAuthorPictures,
  fetchCommunityProjects,
  fetchCommunityProjectsSnapshot,
  refetchCommunityProjectById,
  refreshNostrServerCache,
  TOP10_RELAYS,
  upsertCachedCommunityProject,
  type CommunityProject,
} from "@/lib/userProjects";
import { useAuth } from "@/lib/auth";
import NewProjectModal, {
  type ProjectEditField,
} from "@/components/NewProjectModal";
import { getHackathon, hackathonSlugForId } from "@/lib/hackathons";
import { projectMatchesIdentifier } from "@/lib/projectIdentity";
import { ProjectDetailView } from "@/components/ProjectDetailView";

export default function StandaloneProjectPage({
  pubkey,
  projectId,
  initialProject,
}: {
  pubkey: string;
  projectId: string;
  /** Project pre-fetched on the server from the cached relay snapshot. When
   *  present the page renders immediately and a failed client fetch never
   *  downgrades it to the "not found" state. */
  initialProject?: CommunityProject;
}) {
  const [project, setProject] = useState<CommunityProject | null | undefined>(
    initialProject ?? undefined,
  );
  const [authorPicture, setAuthorPicture] = useState<string | undefined>();
  const [editOpen, setEditOpen] = useState(false);
  const [editFocus, setEditFocus] = useState<ProjectEditField>("all");
  const [revalidating, setRevalidating] = useState(false);
  const [cachePending, setCachePending] = useState(false);
  const { auth } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const abort = new AbortController();
    let cancelled = false;

    // If the browser can't reach the relays (the production failure mode),
    // keep whatever the server already gave us instead of clobbering it.
    const fail = () => {
      if (!cancelled && !initialProject) setProject(null);
    };

    async function loadProject() {
      const showProject = (p: CommunityProject) => {
        setProject(p);
        upsertCachedCommunityProject(p);
        fetchAuthorPictures([p.author], TOP10_RELAYS).then((pics) => {
          if (!cancelled) setAuthorPicture(pics.get(p.author));
        });
      };

      let latest = initialProject ?? null;
      if (latest) showProject(latest);

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
            signal: abort.signal,
          }).catch(() => null);
          const fromServer =
            snapshot?.projects.find(
              (p) => p.author === pubkey && projectMatchesIdentifier(p, projectId),
            ) ?? null;
          if (cancelled) return;
          if (fromServer) {
            setCachePending(fromServer.eventCreatedAt < candidate.eventCreatedAt);
            showProject(
              fromServer.eventCreatedAt >= candidate.eventCreatedAt
                ? fromServer
                : candidate,
            );
          } else {
            setCachePending(true);
          }
          router.refresh();
        } finally {
          if (!cancelled) setRevalidating(false);
        }
      }

      const snapshot = await fetchCommunityProjectsSnapshot({
        signal: abort.signal,
      }).catch(() => null);
      if (cancelled) return;
      const fromSnapshot =
        snapshot?.projects.find(
          (p) => p.author === pubkey && projectMatchesIdentifier(p, projectId),
        ) ?? null;
      if (fromSnapshot) {
        if (!latest || fromSnapshot.eventCreatedAt >= latest.eventCreatedAt) {
          latest = fromSnapshot;
          showProject(fromSnapshot);
        }
      }

      const direct = await refetchCommunityProjectById(
        latest?.id ?? projectId,
        TOP10_RELAYS,
        5000,
        pubkey,
        { signal: abort.signal },
      ).catch(() => null);
      if (cancelled) return;
      if (direct && (!latest || direct.eventCreatedAt > latest.eventCreatedAt)) {
        latest = direct;
        showProject(direct);
        await refreshServerForProject(direct);
        return;
      }

      if (latest) return;

      const broad = await fetchCommunityProjects(TOP10_RELAYS, {
        perRelayTimeoutMs: 5000,
        signal: abort.signal,
      }).catch(() => []);
      if (cancelled) return;
      const fromRelays =
        broad.find(
          (p) => p.author === pubkey && projectMatchesIdentifier(p, projectId),
        ) ?? null;
      if (fromRelays) {
        showProject(fromRelays);
        await refreshServerForProject(fromRelays);
      } else {
        fail();
      }
    }

    loadProject().catch(fail);

    return () => {
      cancelled = true;
      abort.abort();
    };
  }, [pubkey, projectId, initialProject, router]);

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
            className="mb-6 inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-widest text-foreground-muted transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Proyectos
          </Link>
          <div className="mt-8 animate-pulse space-y-4">
            <div className="h-8 w-64 rounded-lg bg-white/5" />
            <div className="h-4 w-full max-w-lg rounded bg-white/5" />
            <div className="h-4 w-3/4 max-w-md rounded bg-white/5" />
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
            className="mb-6 inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-widest text-foreground-muted transition-colors hover:text-foreground"
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

  const backHref = project.hackathon ? `/hackathons/${hackathonSlugForId(project.hackathon)}` : "/projects";
  const hackathon = project.hackathon ? getHackathon(project.hackathon) : null;
  const backLabel = hackathon?.name ?? (project.hackathon ? project.hackathon.toUpperCase() : "Proyectos");
  const contextLabel = hackathon
    ? `${hackathon.icon ?? ""} ${hackathon.name}${
        hackathon.monthShort && hackathon.year
          ? ` · ${hackathon.monthShort} ${hackathon.year}`
          : ""
      }`
    : project.hackathon?.toUpperCase();

  return (
    <>
      <ProjectDetailView
        project={project}
        authorPubkey={pubkey}
        authorPicture={authorPicture}
        backHref={backHref}
        backLabel={backLabel}
        contextLabel={contextLabel}
        isAuthor={isAuthor}
        revalidating={revalidating || cachePending}
        onEdit={isAuthor ? openEditor : undefined}
      />
      {isAuthor && (
        <NewProjectModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          editProject={project}
          initialFocus={editFocus}
          onSaved={(updated) =>
            setProject((prev) => {
              if (!prev) {
                const eventCreatedAt = updated.updatedAt;
                return {
                  ...updated,
                  author: pubkey,
                  eventId: updated.id,
                  eventCreatedAt,
                };
              }
              return {
                ...prev,
                ...updated,
                eventCreatedAt: Math.max(prev.eventCreatedAt, updated.updatedAt),
              };
            })
          }
        />
      )}
    </>
  );
}
