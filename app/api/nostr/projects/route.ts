import { NextRequest, NextResponse } from "next/server";
import { getNostrSubmissionsSnapshot } from "@/lib/nostrCache";
import { projectMatchesIdentifier } from "@/lib/projectIdentity";
import { getProjectRegistryState } from "@/lib/projectRegistry";
import { attachProjectSlugs } from "@/lib/projectResolver";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const hackathonId = searchParams.get("hackathonId");
  const projectId = searchParams.get("projectId");
  const author = searchParams.get("author");
  const [snapshot, registry] = await Promise.all([
    getNostrSubmissionsSnapshot(),
    getProjectRegistryState(),
  ]);
  const projects = attachProjectSlugs(
    snapshot.projects.filter((project) => {
      if (hackathonId && project.hackathon !== hackathonId) return false;
      if (author && project.author !== author) return false;
      if (projectId && !projectMatchesIdentifier(project, projectId)) return false;
      return true;
    }),
    registry,
  );
  return NextResponse.json({ ...snapshot, projects });
}
