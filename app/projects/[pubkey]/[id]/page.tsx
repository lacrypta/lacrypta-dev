import type { Metadata } from "next";
import {
  getNostrProjectByAuthor,
  type CachedNostrProject,
} from "@/lib/nostrCache";
import type { UserProject } from "@/lib/userProjects";
import StandaloneProjectPage from "./StandaloneProjectPage";

export const metadata: Metadata = {
  title: "Proyecto",
  robots: { index: false, follow: false },
};

/**
 * Map the server-cached snapshot shape onto the client `UserProject` shape.
 * The cached projects carry every display field the client needs plus extra
 * relay metadata we drop here.
 */
function toUserProject(p: CachedNostrProject): UserProject {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    team: p.team,
    logo: p.logo,
    cover: p.cover,
    images: p.images,
    thumbs: p.thumbs,
    videos: p.videos,
    repo: p.repo,
    demo: p.demo,
    tech: p.tech,
    status: p.status,
    submittedAt: p.submittedAt,
    hackathon: p.hackathon,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ pubkey: string; id: string }>;
}) {
  const { pubkey, id: projectId } = await params;
  // Pre-fetch from the shared cached relay snapshot (same source the hackathon
  // project pages and sitemap use). This makes the page resilient: if the
  // browser-side relay fetch can't reach the relays in production, the project
  // still renders from server data instead of dead-ending at "not found".
  const cached = await getNostrProjectByAuthor(pubkey, projectId);
  return (
    <StandaloneProjectPage
      pubkey={pubkey}
      projectId={projectId}
      initialProject={cached ? toUserProject(cached) : undefined}
    />
  );
}
