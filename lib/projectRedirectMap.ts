/**
 * Edge-readable `id/old-slug → canonical-slug` redirect map.
 *
 * Why this exists: the canonical `/projects/[slug]` page issues its id→slug
 * redirect with `permanentRedirect` INSIDE a Suspense boundary under
 * `cacheComponents`/PPR. That redirect degrades to a streamed meta tag and,
 * worse, cannot overwrite a full-route cache entry that was previously cached
 * as a 200 (a pre-registration soft-404) — so a registered project's legacy
 * `/projects/<uuid>` URL gets pinned to "Proyecto no encontrado" and never
 * redirects. The legacy two-segment URLs already dodge this by redirecting from
 * a route handler (a real 308); the single-segment case is a page, so we handle
 * it in `proxy.ts` instead — a real 308 emitted BEFORE the full-route
 * cache, driven only by this small map (never the flaky relay/snapshot scans).
 *
 * The map is a plain JSON object in Upstash, written by the registry layer
 * (`lib/projectRegistry.ts`) on sync/registration and by the warm cron. Both
 * the Node writer and the edge reader go through `upstashGet`/`upstashSet`, so
 * the key namespacing (`lacrypta:<env>:…`) stays consistent.
 */

import type { ProjectRegistryEntry } from "./projectRegistryContract";
import { upstashGet } from "./upstashCache";

/** Logical Upstash key (namespaced by `upstashGet`/`upstashSet`). */
export const PROJECT_REDIRECT_MAP_KEY = "nostr:registry-redirects:v1";
/** Long TTL — the map is rewritten on every sync/registration/warm, and even a
 *  stale copy is safe (append-only registry; a missing entry just means the
 *  page handles that redirect, as before). */
export const PROJECT_REDIRECT_MAP_TTL = 60 * 60 * 24 * 30;

/**
 * Build the compact redirect map from registry entries. Keys are a project's
 * `id` (lowercased) and any of its OLD slugs; the value is the current
 * canonical slug. Only entries that actually need a redirect are included
 * (`key !== canonical slug`), so canonical-slug URLs are absent → pass through.
 */
export function buildRedirectMap(
  entries: ProjectRegistryEntry[],
): Record<string, string> {
  // Canonical slug per id = latest `registeredAt` wins (matches buildRegistryState).
  const canonicalById = new Map<string, string>();
  const ordered = [...entries].sort(
    (a, b) => (a.registeredAt || 0) - (b.registeredAt || 0),
  );
  for (const e of ordered) canonicalById.set(e.id.toLowerCase(), e.slug);

  const map: Record<string, string> = {};
  for (const [idLc, slug] of canonicalById) {
    if (idLc !== slug) map[idLc] = slug; // /projects/<id> → /projects/<slug>
  }
  for (const e of entries) {
    const canonical = canonicalById.get(e.id.toLowerCase());
    if (canonical && e.slug !== canonical) {
      map[e.slug] = canonical; // /projects/<old-slug> → /projects/<new-slug>
    }
  }
  return map;
}

/* ─────────────────────────── edge read path ────────────────────────────── */

// Per-instance cache so middleware doesn't hit Upstash on every project request.
let cache: { at: number; map: Record<string, string> } | null = null;
const CACHE_TTL_MS = 60_000;

async function getRedirectMapCached(): Promise<Record<string, string>> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.map;
  const map =
    (await upstashGet<Record<string, string>>(PROJECT_REDIRECT_MAP_KEY)) ?? {};
  cache = { at: now, map };
  return map;
}

/**
 * Resolve `/projects/<param>` to its canonical slug, or `null` if `param` is
 * already canonical / unknown / the cache is unavailable. Used by middleware.
 */
export async function resolveProjectRedirect(
  param: string,
): Promise<string | null> {
  const key = param.trim().toLowerCase();
  if (!key) return null;
  try {
    const map = await getRedirectMapCached();
    const target = map[key];
    return target && target !== key ? target : null;
  } catch {
    return null; // never break navigation on a cache hiccup
  }
}
