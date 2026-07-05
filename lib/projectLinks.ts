/**
 * Canonical project URL builder — the ONLY place that turns a project into an
 * href. Isomorphic (no server deps): server callers attach the registry slug
 * to project objects before rendering; client callers use whatever slug came
 * with the data and fall back to the stable project id, which the canonical
 * route resolves (and 308s to the slug once registered).
 */

/** Href for an already-resolved canonical slug (or stable project id). */
export function projectSlugHref(slug: string): string {
  return `/projects/${encodeURIComponent(slug)}`;
}

export function projectHref(project: {
  slug?: string | null;
  id: string;
}): string {
  return projectSlugHref(project.slug || project.id);
}

/** Params/ids are user-controlled — a stray `%` must not throw URIError. */
export function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Curated project ids are hand-authored slugs already; their registry slug is
 * the lowercased id by construction, so client components can link curated
 * projects without carrying registry state.
 */
export function curatedProjectHref(id: string): string {
  return projectHref({ id: id.toLowerCase() });
}

/** Community submission ids are `crypto.randomUUID()` — curated ids never are. */
const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Voting data (period projects, winners, final rows, prize targets) only
 * carries a project's id, which is either a community submission's uuid or a
 * curated id. Link uuids as-is — the canonical route resolves them (and 308s
 * to the slug once registered) — and lowercase curated ids into their slug.
 */
export function votingProjectHref(id: string, slug?: string | null): string {
  if (slug || UUID_SHAPE.test(id)) return projectHref({ slug, id });
  return curatedProjectHref(id);
}
