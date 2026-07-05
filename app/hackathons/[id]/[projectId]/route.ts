import { NextRequest, NextResponse } from "next/server";
import { getHackathon } from "@/lib/hackathons";
import { getNostrProject, getNostrSubmissionsSnapshot } from "@/lib/nostrCache";
import { projectMatchesIdentifier } from "@/lib/projectIdentity";
import {
  getProjectRegistryState,
  registryEntryForProject,
} from "@/lib/projectRegistry";
import { safeDecodeURIComponent } from "@/lib/projectResolver";

/**
 * Legacy hackathon project URL: `/hackathons/<hackathonSlug>/<projectId>`.
 *
 * Permanently redirects to the canonical `/projects/<slug>` page. A route
 * handler (not a page) so crawlers and scrapers get a real HTTP 308 — under
 * cacheComponents a page-level redirect degrades to a streamed meta tag.
 *
 * The projectId may be a curated id (any case), a Nostr project id, an event
 * id, or a slugified name — all historic alias forms resolve before
 * redirecting so old links land on the right project.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; projectId: string }> },
) {
  const { id: routeParam, projectId: rawProjectId } = await params;
  const projectId = safeDecodeURIComponent(rawProjectId);
  let target = `/projects/${encodeURIComponent(projectId)}`;

  try {
    const hackathon = getHackathon(safeDecodeURIComponent(routeParam));
    const [registry, snapshot] = await Promise.all([
      getProjectRegistryState(),
      getNostrSubmissionsSnapshot(),
    ]);
    const nostr =
      (hackathon ? await getNostrProject(hackathon.id, projectId) : null) ??
      // Second chance across all hackathons: event-id aliases and projects
      // whose hackathon field changed still deserve a correct redirect.
      snapshot.projects.find((p) => projectMatchesIdentifier(p, projectId)) ??
      null;
    const entry = nostr
      ? registryEntryForProject(registry, nostr)
      : (registry.byIdLc.get(projectId.toLowerCase()) ?? null);
    if (entry) {
      target = `/projects/${encodeURIComponent(entry.slug)}`;
    } else if (nostr) {
      target = `/projects/${encodeURIComponent(nostr.id)}`;
    } else {
      // Curated ids are their own (lowercased) canonical slug.
      target = `/projects/${encodeURIComponent(projectId.toLowerCase())}`;
    }
  } catch {
    /* fall through to the id-based URL */
  }

  return NextResponse.redirect(new URL(target, req.url), 308);
}
