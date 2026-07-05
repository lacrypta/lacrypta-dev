/**
 * Server-only resolution of `/projects/[slug]` params to concrete projects.
 *
 * Canonical URL rule (see lib/projectRegistryContract.ts): a project's
 * canonical slug is its registry slug when registered, else its own id
 * (curated ids lowercased). Every other identifier that reaches the route —
 * mixed-case curated ids, Nostr event ids, slugified names, pre-registration
 * uuid URLs — resolves and redirects to the canonical form.
 *
 * All reads come from the two cached round-trips (submissions snapshot +
 * registry event); this module adds no relay traffic of its own.
 */

import type { Hackathon, HackathonProject } from "./hackathons";
import {
  HACKATHONS,
  comparableProjectName,
  comparableRepo,
  getHackathon,
  getHackathonProjects,
} from "./hackathons";
import { PROJECTS as HOME_PROJECTS, type Project as HomeProject } from "./projects";
import { projectMatchesIdentifier } from "./projectIdentity";
import {
  getNostrSubmissionsSnapshot,
  type CachedNostrProject,
} from "./nostrCache";
import {
  getProjectRegistryState,
  registryEntryForProject,
  type ProjectRegistryState,
} from "./projectRegistry";
import type { ProjectRegistryEntry } from "./projectRegistryContract";

const HEX64_RE = /^[0-9a-f]{64}$/;

/** Params/ids are user-controlled — a stray `%` must not throw URIError. */
export function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export type ResolvedProject = {
  kind: "project";
  canonicalSlug: string;
  /** Set when the request param is an alias — caller must redirect. */
  redirectTo: string | null;
  registryEntry: ProjectRegistryEntry | null;
  /** Hackathon the project belongs to (from whichever source knows it). */
  hackathon: Hackathon | null;
  /** Hackathon-curated project (richest view: report, prize). */
  curated: HackathonProject | null;
  /** Homepage-curated project (lib/projects.ts). */
  home: HomeProject | null;
  /** Community Nostr project. */
  nostr: CachedNostrProject | null;
};

export type ResolvedParam =
  | ResolvedProject
  | { kind: "pubkey"; pubkey: string }
  | { kind: "unknown"; param: string };

function findCuratedHackathonProject(idLc: string): HackathonProject | null {
  for (const h of HACKATHONS) {
    const hit = getHackathonProjects(h.id).find(
      (p) => p.id.toLowerCase() === idLc,
    );
    if (hit) return hit;
  }
  return null;
}

function findHomeProject(idLc: string): HomeProject | null {
  return HOME_PROJECTS.find((p) => p.id.toLowerCase() === idLc) ?? null;
}

/**
 * Curated lookup for a registry entry. Entries registered from a community
 * twin carry the community uuid as `id`, so a curated project added later
 * would never surface by id alone — also match by the entry's slug and by
 * the normalized-name identity contract (same name ⇒ same logical project),
 * so curated data (reports, prizes) always wins at render time.
 */
function curatedForEntry(entry: ProjectRegistryEntry): HackathonProject | null {
  const byId =
    findCuratedHackathonProject(entry.id.toLowerCase()) ??
    findCuratedHackathonProject(entry.slug);
  if (byId) return byId;
  const nameKey = comparableProjectName(entry.name);
  if (!nameKey) return null;
  for (const h of HACKATHONS) {
    const hit = getHackathonProjects(h.id).find(
      (p) => comparableProjectName(p.name) === nameKey,
    );
    if (hit) return hit;
  }
  return null;
}

function homeForEntry(entry: ProjectRegistryEntry): HomeProject | null {
  const byId =
    findHomeProject(entry.id.toLowerCase()) ?? findHomeProject(entry.slug);
  if (byId) return byId;
  const nameKey = comparableProjectName(entry.name);
  if (!nameKey) return null;
  return (
    HOME_PROJECTS.find((p) => comparableProjectName(p.name) === nameKey) ?? null
  );
}

function findNostrProject(
  projects: CachedNostrProject[],
  identifier: string,
  author?: string,
): CachedNostrProject | null {
  return (
    projects.find(
      (p) =>
        (!author || p.author === author) &&
        projectMatchesIdentifier(p, identifier),
    ) ?? null
  );
}

function canonicalSlugFor(
  entry: ProjectRegistryEntry | null,
  curated: HackathonProject | null,
  home: HomeProject | null,
  nostr: CachedNostrProject | null,
): string {
  if (entry) return entry.slug;
  if (curated) return curated.id.toLowerCase();
  if (home) return home.id.toLowerCase();
  return nostr?.id ?? "";
}

function resolvedProject(
  param: string,
  registry: ProjectRegistryState,
  entry: ProjectRegistryEntry | null,
  curated: HackathonProject | null,
  home: HomeProject | null,
  nostr: CachedNostrProject | null,
): ResolvedProject {
  if (!entry) {
    const source = curated ?? home ?? nostr;
    entry = source
      ? registryEntryForProject(registry, {
          id: source.id,
          name: source.name,
          author: nostr?.author,
        })
      : null;
  }
  const canonicalSlug = canonicalSlugFor(entry, curated, home, nostr);
  // Hackathon context follows the same source priority the views render with.
  const hackathonId = curated
    ? curated.hackathon
    : home
      ? home.hackathon
      : (nostr?.hackathon ?? null);
  return {
    kind: "project",
    canonicalSlug,
    redirectTo: param === canonicalSlug ? null : `/projects/${canonicalSlug}`,
    registryEntry: entry,
    hackathon: hackathonId ? getHackathon(hackathonId) : null,
    curated,
    home,
    nostr,
  };
}

async function decodeNpub(param: string): Promise<string | null> {
  try {
    const { decode } = await import("nostr-tools/nip19");
    const decoded = decode(param);
    if (decoded.type === "npub") return decoded.data as string;
    if (decoded.type === "nprofile") {
      return (decoded.data as { pubkey: string }).pubkey;
    }
  } catch {
    /* not an npub */
  }
  return null;
}

export async function resolveProjectParam(
  rawParam: string,
): Promise<ResolvedParam> {
  const param = safeDecodeURIComponent(rawParam).trim();
  const paramLc = param.toLowerCase();

  if (HEX64_RE.test(paramLc)) {
    // Could be a user pubkey (listing) — the historic meaning of this
    // segment — or a project event id. Prefer the pubkey listing; event-id
    // aliases arrive through the redirect handlers which resolve them first.
    return { kind: "pubkey", pubkey: paramLc };
  }
  if (paramLc.startsWith("npub1") || paramLc.startsWith("nprofile1")) {
    const pubkey = await decodeNpub(param);
    if (pubkey) return { kind: "pubkey", pubkey };
  }

  const [registry, snapshot] = await Promise.all([
    getProjectRegistryState(),
    getNostrSubmissionsSnapshot(),
  ]);

  // 1. Registry slug (the canonical namespace).
  const entry = registry.bySlug.get(paramLc) ?? null;
  if (entry) {
    const curated = curatedForEntry(entry);
    const home = homeForEntry(entry);
    const nostr = entry.author
      ? findNostrProject(snapshot.projects, entry.id, entry.author)
      : findNostrProject(snapshot.projects, entry.id);
    return resolvedProject(param, registry, entry, curated, home, nostr);
  }

  // 2. Registered project addressed by its id → redirect to the slug.
  const byId = registry.byIdLc.get(paramLc) ?? null;

  // 3. Direct data lookups (also covers the pre-registration window).
  const curated = findCuratedHackathonProject(paramLc);
  const home = findHomeProject(paramLc);
  const nostr = findNostrProject(snapshot.projects, param);
  if (byId || curated || home || nostr) {
    return resolvedProject(param, registry, byId, curated, home, nostr);
  }

  return { kind: "unknown", param };
}

/* ───────────────────────── slug decoration ─────────────────────────────── */

/**
 * Attach canonical slugs to Nostr projects so client components can link
 * `/projects/<slug>` without carrying registry state.
 */
export function attachProjectSlugs<T extends { id: string; name: string; author?: string }>(
  projects: T[],
  registry: ProjectRegistryState,
): (T & { slug?: string })[] {
  return projects.map((p) => {
    const entry = registryEntryForProject(registry, p);
    return entry ? { ...p, slug: entry.slug } : p;
  });
}

/* ─────────────────── canonical list (sitemap / SSG) ────────────────────── */

export type CanonicalProjectRef = {
  slug: string;
  hackathonId: string | null;
  lastModified: Date;
  source: "curated" | "nostr";
};

/**
 * One entry per logical project, at its canonical URL. Used by
 * generateStaticParams and the sitemap so both emit the same param set.
 * Deduped against curated sources the same way `mergeWithSubmissions` does.
 */
export async function getCanonicalProjectRefs(): Promise<CanonicalProjectRef[]> {
  const [registry, snapshot] = await Promise.all([
    getProjectRegistryState(),
    getNostrSubmissionsSnapshot(),
  ]);

  const refs = new Map<string, CanonicalProjectRef>();
  const now = new Date();

  // Unregistered community ids come from attacker-controlled event content;
  // anything that isn't URL-safe stays out of static params and sitemaps
  // (such projects still resolve at request time).
  const SAFE_SLUG_RE = /^[a-zA-Z0-9._~-]+$/;

  const add = (
    slug: string,
    hackathonId: string | null,
    lastModified: Date,
    source: "curated" | "nostr",
  ) => {
    if (!slug || refs.has(slug) || !SAFE_SLUG_RE.test(slug)) return;
    refs.set(slug, { slug, hackathonId, lastModified, source });
  };

  for (const h of HACKATHONS) {
    const lastDate = h.dates[h.dates.length - 1]?.date;
    for (const p of getHackathonProjects(h.id)) {
      const entry = registryEntryForProject(registry, p);
      add(
        entry?.slug ?? p.id.toLowerCase(),
        h.id,
        p.submittedAt
          ? new Date(p.submittedAt)
          : lastDate
            ? new Date(lastDate)
            : now,
        "curated",
      );
    }
  }

  for (const p of HOME_PROJECTS) {
    const entry = registryEntryForProject(registry, p);
    add(
      entry?.slug ?? p.id.toLowerCase(),
      p.hackathon,
      p.submittedAt ? new Date(p.submittedAt) : now,
      "curated",
    );
  }

  // Dedupe community submissions against curated twins with the same
  // identity contract mergeWithSubmissions uses, so the pre-registration
  // sitemap never lists a curated project twice (curated slug + twin uuid).
  const curatedAll = [
    ...HACKATHONS.flatMap((h) => getHackathonProjects(h.id)),
    ...HOME_PROJECTS,
  ];
  const curatedIds = new Set(curatedAll.map((p) => p.id.toLowerCase()));
  const curatedRepos = new Set(
    curatedAll
      .map((p) => comparableRepo(p.repo))
      .filter((r): r is string => !!r),
  );
  const curatedNames = new Set(
    curatedAll.map((p) => comparableProjectName(p.name)),
  );
  for (const p of snapshot.projects) {
    const entry = registryEntryForProject(registry, p);
    if (!entry) {
      const repo = comparableRepo(p.repo);
      if (
        curatedIds.has(p.id.toLowerCase()) ||
        (repo && curatedRepos.has(repo)) ||
        curatedNames.has(comparableProjectName(p.name))
      ) {
        continue;
      }
    }
    // Registered twins resolve to the curated slug via the registry and get
    // skipped by the refs.has() guard.
    add(
      entry?.slug ?? p.id,
      p.hackathon,
      new Date(p.eventCreatedAt * 1000),
      "nostr",
    );
  }

  return [...refs.values()];
}
