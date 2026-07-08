/**
 * Server-only cached Nostr fetchers. Backs the sitemap, dynamic OG images,
 * and the SSR-rendered hackathon project page.
 *
 * Intentionally self-contained — `lib/userProjects.ts` is a "use client"
 * module and cannot be imported from server code. The relay subscription
 * + parser duplicated here is deliberately minimal (SEO-relevant fields
 * only); the canonical client-side version still owns publish/sign/cache.
 */

import { cacheLife, cacheTag } from "next/cache";
import { DEFAULT_RELAYS } from "./nostrRelayConfig";
import type { ProjectStatus } from "./hackathons";
import { projectMatchesIdentifier } from "./projectIdentity";
import {
  NOSTR_LEGACY_SUBMISSIONS_TAG,
  NOSTR_PROJECTS_TAG,
  nostrProjectByIdTag,
} from "./nostrCacheTags";

const PROJECT_KIND = 30078;
const PROJECT_TAG = "lacrypta-dev-project";
const PROJECT_D_PREFIX = "lacrypta.dev:project:";
export const NOSTR_SUBMISSIONS_TAG = NOSTR_LEGACY_SUBMISSIONS_TAG;
export { NOSTR_PROJECTS_TAG };

const TOP10_RELAYS = DEFAULT_RELAYS;

type IncomingEvent = {
  id: string;
  pubkey: string;
  content: string;
  tags: string[][];
  created_at: number;
};

export type CachedNostrTeamMember = {
  name: string;
  role: string;
  pubkey?: string;
  nip05?: string;
  github?: string;
  picture?: string;
};

export type CachedNostrProject = {
  id: string;
  /** Canonical URL slug from the project registry, attached after fetch by
   *  `lib/projectResolver.ts:attachProjectSlugs` — never parsed from events. */
  slug?: string;
  name: string;
  description: string;
  hackathon: string | null;
  status: ProjectStatus;
  team: CachedNostrTeamMember[];
  logo?: string;
  cover?: string;
  images?: string[];
  thumbs?: string[];
  videos?: string[];
  repo?: string;
  demo?: string;
  tech?: string[];
  createdAt: number;
  updatedAt: number;
  author: string;
  eventId: string;
  eventCreatedAt: number;
  submittedAt?: string;
};

export type CachedNostrSubmissionsSnapshot = {
  projects: CachedNostrProject[];
  generatedAt: string;
  relays: string[];
};

function parseTeam(raw: unknown): CachedNostrTeamMember[] {
  if (!Array.isArray(raw)) return [];
  const out: CachedNostrTeamMember[] = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") continue;
    const rec = m as Record<string, unknown>;
    const str = (v: unknown) =>
      typeof v === "string" && v.trim() ? v.trim() : undefined;
    const nip05 = str(rec.nip05);
    const pubkey = str(rec.pubkey);
    const name = str(rec.name) ?? (nip05 ? nip05.split("@")[0] : undefined);
    if (!name && !nip05 && !pubkey) continue;
    out.push({
      name: name ?? "",
      role: str(rec.role) ?? "Builder",
      nip05,
      pubkey,
      github: str(rec.github),
      picture: str(rec.picture),
    });
  }
  return out;
}

function parseEvent(ev: IncomingEvent): CachedNostrProject | null {
  const dTag = ev.tags.find((t) => t[0] === "d")?.[1];
  if (!dTag || !dTag.startsWith(PROJECT_D_PREFIX)) return null;
  const hasTag = ev.tags.some((t) => t[0] === "t" && t[1] === PROJECT_TAG);
  if (!hasTag) return null;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(ev.content) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;

  const str = (v: unknown) =>
    typeof v === "string" && v.trim() ? v.trim() : undefined;
  const arr = (v: unknown) =>
    Array.isArray(v)
      ? v.map((x) => String(x)).filter(Boolean)
      : undefined;

  const name = str(parsed.name);
  if (!name) return null;

  const id =
    str(parsed.id) ??
    (dTag.startsWith(PROJECT_D_PREFIX)
      ? dTag.slice(PROJECT_D_PREFIX.length)
      : ev.id);

  const hackathon =
    str(parsed.hackathon) ??
    ev.tags.find((t) => t[0] === "h")?.[1] ??
    null;

  const allowedStatuses: ProjectStatus[] = [
    "idea",
    "building",
    "submitted",
    "finalist",
    "winner",
    "official",
    "archived",
  ];
  const rawStatus = str(parsed.status);
  const status: ProjectStatus = allowedStatuses.includes(
    rawStatus as ProjectStatus,
  )
    ? (rawStatus as ProjectStatus)
    : hackathon
      ? "submitted"
      : "building";

  return {
    id,
    name,
    description: str(parsed.description) ?? "",
    hackathon,
    status,
    team: parseTeam(parsed.team),
    logo: str(parsed.logo) ?? str(parsed.picture),
    cover: str(parsed.cover) ?? str(parsed.banner),
    images: arr(parsed.images) ?? arr(parsed.screenshots),
    thumbs: arr(parsed.thumbs) ?? arr(parsed.thumbnails),
    videos: arr(parsed.videos),
    repo: str(parsed.repo),
    demo: str(parsed.demo) ?? str(parsed.url),
    tech: arr(parsed.tech) ?? arr(parsed.tags),
    createdAt: Number(parsed.createdAt ?? ev.created_at),
    updatedAt: Number(parsed.updatedAt ?? ev.created_at),
    author: ev.pubkey,
    eventId: ev.id,
    eventCreatedAt: ev.created_at,
    submittedAt: str(parsed.submittedAt),
  };
}

async function rawFetchAllProjects(
  timeoutMs = 6000,
): Promise<CachedNostrProject[]> {
  const { SimplePool } = await import("nostr-tools/pool");
  const pool = new SimplePool();
  const events = new Map<string, IncomingEvent>();

  const closer = pool.subscribe(
    TOP10_RELAYS,
    { kinds: [PROJECT_KIND], "#t": [PROJECT_TAG] },
    {
      onevent(ev: IncomingEvent) {
        const dTag = ev.tags.find((t) => t[0] === "d")?.[1];
        if (!dTag) return;
        const key = `${ev.pubkey}|${dTag}`;
        const prev = events.get(key);
        if (!prev || ev.created_at > prev.created_at) events.set(key, ev);
      },
      oneose() {
        /* timeout-driven */
      },
    },
  );

  await new Promise((r) => setTimeout(r, timeoutMs));
  try {
    closer.close();
  } catch {
    /* noop */
  }
  try {
    pool.close(TOP10_RELAYS);
  } catch {
    /* noop */
  }

  return [...events.values()]
    .map(parseEvent)
    .filter(
      (p): p is CachedNostrProject => p !== null && p.status !== "archived",
    )
    .sort((a, b) => b.eventCreatedAt - a.eventCreatedAt);
}

/**
 * Targeted lookup of a single project by its NIP-78 `d` tag, straight from the
 * relays. The broad snapshot ({@link rawFetchAllProjects}) is one 6s scan for
 * *every* `lacrypta-dev-project` event across all relays; a thinly-propagated
 * event (published to only a couple of relays) can miss that window and leave
 * the shared snapshot without it. A `#d` filter is tiny and indexed, so relays
 * answer it near-instantly — this makes resolving a known project id
 * deterministic instead of dependent on the broad scan landing every event.
 *
 * Returns the newest non-archived matching event, or null.
 */
async function rawFetchProjectByDTag(
  projectId: string,
  timeoutMs = 4500,
  // Grace window after the first hit to let a newer replica land on a slower
  // relay before resolving — keeps the found path fast (~1s) while the full
  // timeout only bounds the not-found case.
  settleMs = 900,
): Promise<CachedNostrProject | null> {
  const { SimplePool } = await import("nostr-tools/pool");
  const pool = new SimplePool();
  const dTag = `${PROJECT_D_PREFIX}${projectId}`;
  let best: IncomingEvent | null = null;

  await new Promise<void>((resolve) => {
    let settled = false;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    let closer: { close: () => void } | null = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimer);
      if (settleTimer) clearTimeout(settleTimer);
      try {
        closer?.close();
      } catch {
        /* noop */
      }
      resolve();
    };
    const hardTimer = setTimeout(finish, timeoutMs);

    closer = pool.subscribe(
      TOP10_RELAYS,
      { kinds: [PROJECT_KIND], "#d": [dTag], "#t": [PROJECT_TAG] },
      {
        onevent(ev: IncomingEvent) {
          if (!best || ev.created_at > best.created_at) best = ev;
          if (!settleTimer) settleTimer = setTimeout(finish, settleMs);
        },
        oneose() {
          /* timeout-driven; keep collecting until the deadline */
        },
      },
    );
  });

  try {
    pool.close(TOP10_RELAYS);
  } catch {
    /* noop */
  }

  if (!best) return null;
  const parsed = parseEvent(best);
  return parsed && parsed.status !== "archived" ? parsed : null;
}

/**
 * Cached direct lookup for `resolveProjectParam`'s miss path. Keyed per id (its
 * own `cacheTag`). Uses the short `nostrLookup` profile, not `nostr`: a hit is
 * stable, but a transient not-found must NOT be pinned for the 5-minute `nostr`
 * window — that would re-strand exactly the thinly-propagated project this path
 * exists to rescue. The short revalidate lets the next visit retry, and it also
 * bounds repeated relay fan-out for a hammered bogus id.
 *
 * The queried `#d` tag is the authoritative project id, so the result's `id` is
 * pinned to it: a malformed or poisoned `content.id` must never redirect the
 * canonical URL to a slug that then resolves to nothing.
 */
export async function getNostrProjectByIdDirect(
  projectId: string,
): Promise<CachedNostrProject | null> {
  "use cache";
  cacheLife("nostrLookup");
  cacheTag(NOSTR_PROJECTS_TAG);
  cacheTag(nostrProjectByIdTag(projectId));
  try {
    const project = await rawFetchProjectByDTag(projectId);
    return project ? { ...project, id: projectId } : null;
  } catch {
    return null;
  }
}

/**
 * Single source of truth — every consumer below filters this list.
 * Caching once here means N consumers share a single relay round-trip.
 */
async function getSubmissionsSnapshotCached(): Promise<
  CachedNostrSubmissionsSnapshot
> {
  "use cache";
  cacheLife("nostr");
  cacheTag(NOSTR_PROJECTS_TAG);
  cacheTag(NOSTR_SUBMISSIONS_TAG);
  try {
    return {
      projects: await rawFetchAllProjects(),
      generatedAt: new Date().toISOString(),
      relays: TOP10_RELAYS,
    };
  } catch {
    return {
      projects: [],
      generatedAt: new Date().toISOString(),
      relays: TOP10_RELAYS,
    };
  }
}

export async function getNostrSubmissionsSnapshot(): Promise<
  CachedNostrSubmissionsSnapshot
> {
  return getSubmissionsSnapshotCached();
}

export async function getFreshNostrSubmissionsSnapshot(): Promise<
  CachedNostrSubmissionsSnapshot
> {
  try {
    return {
      projects: await rawFetchAllProjects(),
      generatedAt: new Date().toISOString(),
      relays: TOP10_RELAYS,
    };
  } catch {
    return {
      projects: [],
      generatedAt: new Date().toISOString(),
      relays: TOP10_RELAYS,
    };
  }
}

async function getAllSubmissionsCached(): Promise<CachedNostrProject[]> {
  const snapshot = await getSubmissionsSnapshotCached();
  return snapshot.projects;
}

export async function getNostrHackathonSubmissions(
  hackathonId: string,
): Promise<CachedNostrProject[]> {
  const all = await getAllSubmissionsCached();
  return all.filter((p) => p.hackathon === hackathonId);
}

export async function getNostrProject(
  hackathonId: string,
  projectId: string,
): Promise<CachedNostrProject | null> {
  const all = await getAllSubmissionsCached();
  return (
    all.find(
      (p) => p.hackathon === hackathonId && projectMatchesIdentifier(p, projectId),
    ) ?? null
  );
}

/**
 * Look up a single project by its author pubkey + local id, regardless of
 * hackathon assignment. Backs the standalone `/projects/<pubkey>/<id>` page
 * so it renders from the same cached relay snapshot instead of relying on a
 * fragile browser-side relay fetch.
 */
export async function getNostrProjectByAuthor(
  pubkey: string,
  projectId: string,
): Promise<CachedNostrProject | null> {
  const all = await getAllSubmissionsCached();
  return (
    all.find(
      (p) => p.author === pubkey && projectMatchesIdentifier(p, projectId),
    ) ?? null
  );
}

export async function getAllNostrSubmissionsForSitemap(): Promise<
  CachedNostrProject[]
> {
  return getAllSubmissionsCached();
}
