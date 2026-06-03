"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  fetchAuthorPictures,
  fetchCommunityProjects,
  fetchCommunityProjectsSnapshot,
  fetchProjectByDTag,
  TOP10_RELAYS,
  type UserProject,
} from "@/lib/userProjects";
import { useAuth } from "@/lib/auth";
import NewProjectModal, {
  type ProjectEditField,
} from "@/components/NewProjectModal";
import { projectMatchesIdentifier } from "@/lib/projectIdentity";
import { ProjectDetailView } from "@/components/ProjectDetailView";

export default function StandaloneProjectPage({
  pubkey,
  projectId,
}: {
  pubkey: string;
  projectId: string;
}) {
  const [project, setProject] = useState<UserProject | null | undefined>(
    undefined,
  );
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
          (p) => p.author === pubkey && projectMatchesIdentifier(p, projectId),
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
          (p) => p.author === pubkey && projectMatchesIdentifier(p, projectId),
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

  const backHref = project.hackathon ? `/hackathons/${project.hackathon}` : "/projects";
  const backLabel = project.hackathon ? project.hackathon.toUpperCase() : "Proyectos";

  return (
    <>
      <ProjectDetailView
        project={project}
        authorPubkey={pubkey}
        authorPicture={authorPicture}
        backHref={backHref}
        backLabel={backLabel}
        contextLabel={project.hackathon ? project.hackathon.toUpperCase() : undefined}
        isAuthor={isAuthor}
        onEdit={isAuthor ? openEditor : undefined}
      />
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
