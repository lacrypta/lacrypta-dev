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

const PROJECT_KIND = 30078;
const PROJECT_TAG = "lacrypta-dev-project";
const PROJECT_D_PREFIX = "lacrypta.dev:project:";

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
  name: string;
  description: string;
  hackathon: string | null;
  status: string;
  team: CachedNostrTeamMember[];
  repo?: string;
  demo?: string;
  tech?: string[];
  author: string;
  eventId: string;
  eventCreatedAt: number;
  submittedAt?: string;
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

  const status = str(parsed.status) ?? (hackathon ? "submitted" : "building");

  return {
    id,
    name,
    description: str(parsed.description) ?? "",
    hackathon,
    status,
    team: parseTeam(parsed.team),
    repo: str(parsed.repo),
    demo: str(parsed.demo) ?? str(parsed.url),
    tech: arr(parsed.tech) ?? arr(parsed.tags),
    author: ev.pubkey,
    eventId: ev.id,
    eventCreatedAt: ev.created_at,
    submittedAt: str(parsed.submittedAt),
  };
}

async function rawFetchAllProjects(timeoutMs = 6000): Promise<CachedNostrProject[]> {
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
 * Single source of truth — every consumer below filters this list.
 * Caching once here means N consumers share a single relay round-trip.
 */
async function getAllSubmissionsCached(): Promise<CachedNostrProject[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("nostr:hackathon-submissions");
  try {
    return await rawFetchAllProjects();
  } catch {
    return [];
  }
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
    all.find((p) => p.hackathon === hackathonId && p.id === projectId) ?? null
  );
}

export async function getAllNostrSubmissionsForSitemap(): Promise<
  CachedNostrProject[]
> {
  return getAllSubmissionsCached();
}
