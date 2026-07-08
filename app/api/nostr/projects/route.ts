import { NextRequest, NextResponse } from "next/server";
import {
  getNostrProjectByIdDirect,
  getNostrSubmissionsSnapshot,
} from "@/lib/nostrCache";
import { projectMatchesIdentifier } from "@/lib/projectIdentity";
import { getProjectRegistryState } from "@/lib/projectRegistry";
import { attachProjectSlugs } from "@/lib/projectResolver";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const hackathonId = searchParams.get("hackathonId");
  const projectId = searchParams.get("projectId");
  const author = searchParams.get("author");
  const [snapshot, registry] = await Promise.all([
    getNostrSubmissionsSnapshot(),
    getProjectRegistryState(),
  ]);
  const matches = snapshot.projects.filter((project) => {
    if (hackathonId && project.hackathon !== hackathonId) return false;
    if (author && project.author !== author) return false;
    if (projectId && !projectMatchesIdentifier(project, projectId)) return false;
    return true;
  });

  // Targeted fallback: a specific project asked for by uuid that the broad
  // snapshot hasn't captured yet (thin relay propagation) is fetched directly
  // by its `#d` tag, so the client's "snapshot" phase resolves it too instead
  // of falling through to the browser-side relay scan.
  if (matches.length === 0 && projectId && UUID_RE.test(projectId)) {
    const direct = await getNostrProjectByIdDirect(projectId.toLowerCase());
    if (
      direct &&
      (!author || direct.author === author) &&
      (!hackathonId || direct.hackathon === hackathonId)
    ) {
      matches.push(direct);
    }
  }

  const projects = attachProjectSlugs(matches, registry);
  return NextResponse.json({ ...snapshot, projects });
}
