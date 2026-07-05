import { NextRequest, NextResponse } from "next/server";
import {
  getNostrProjectByAuthor,
  getNostrSubmissionsSnapshot,
} from "@/lib/nostrCache";
import { projectMatchesIdentifier } from "@/lib/projectIdentity";
import {
  getProjectRegistryState,
  registryEntryForProject,
} from "@/lib/projectRegistry";
import { projectSlugHref, safeDecodeURIComponent } from "@/lib/projectLinks";

/**
 * Legacy standalone project URL: `/projects/<pubkey>/<id>`.
 *
 * Permanently redirects to the canonical `/projects/<slug>` page. A route
 * handler (not a page) so the redirect is a real HTTP 308 — under
 * cacheComponents a page-level redirect degrades to a streamed meta tag.
 *
 * Unresolvable ids still redirect to `/projects/<id>` (never 404): the
 * canonical page's live relay scan preserves the old behavior for projects
 * that haven't reached the cached snapshot yet.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug: rawAuthor, id } = await params;
  const projectId = safeDecodeURIComponent(id);
  const author = safeDecodeURIComponent(rawAuthor);
  // Lowercased id is canonical for curated ids and harmless for uuids; the
  // resolver matches Nostr ids case-insensitively.
  let target = projectSlugHref(projectId.toLowerCase());

  try {
    const [registry, snapshot, byAuthor] = await Promise.all([
      getProjectRegistryState(),
      getNostrSubmissionsSnapshot(),
      getNostrProjectByAuthor(author, projectId),
    ]);
    const project =
      byAuthor ??
      // Second chance ignoring the author segment: event-id aliases and
      // republished projects still deserve a correct redirect.
      snapshot.projects.find((p) => projectMatchesIdentifier(p, projectId)) ??
      null;
    const entry = project
      ? registryEntryForProject(registry, project)
      : (registry.byIdLc.get(projectId.toLowerCase()) ?? null);
    if (entry) {
      target = projectSlugHref(entry.slug);
    } else if (project) {
      target = projectSlugHref(project.id);
    }
  } catch {
    /* fall through to the id-based URL */
  }

  return NextResponse.redirect(new URL(target, req.url), 308);
}
