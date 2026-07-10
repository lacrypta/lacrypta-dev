import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import {
  getFreshNostrSubmissionsSnapshot,
  getNostrSubmissionsSnapshot,
} from "@/lib/nostrCache";
import { getProjectRegistryState, syncProjectRegistry } from "@/lib/projectRegistry";
import { attachProjectSlugs } from "@/lib/projectResolver";
import { expireNostrTag } from "@/lib/nostrRevalidate";
import {
  NOSTR_LEGACY_SUBMISSIONS_TAG,
  NOSTR_PROJECTS_TAG,
  nostrHackathonBadgeDefinitionTag,
  nostrHackathonBadgeOwnersTag,
  nostrHackathonBadgesTag,
  nostrBadgesTag,
  nostrProfileTag,
  nostrRelayListTag,
  nostrReportsTag,
} from "@/lib/nostrCacheTags";
import {
  getCachedHackathonBadgeCatalogSnapshot,
  getCachedHackathonBadgeDefinitionsSnapshot,
  getCachedHackathonBadgeOwnersSnapshot,
} from "@/lib/hackathonBadgeCache";
import { projectMatchesIdentifier } from "@/lib/projectIdentity";

type RefreshScope =
  | "projects"
  | "profile"
  | "relay-list"
  | "badges"
  | "hackathon-badges"
  | "hackathon-badge-definitions"
  | "hackathon-badge-owners"
  | "reports"
  | "results";

type RefreshBody = {
  scopes?: RefreshScope[];
  hackathonId?: string;
  projectId?: string;
  author?: string;
  pubkey?: string;
  issuerPubkey?: string;
  aTags?: string[];
  candidateEventId?: string;
  candidateCreatedAt?: number;
  blocking?: boolean;
};

const MAX_REFRESH_ATAGS = 50;

// Throttles: this endpoint is unauthenticated and its expensive paths run a
// ~6s multi-relay scan. Best-effort per-instance guards (serverless instances
// each keep their own) so anonymous callers can't hammer the relays or keep
// the shared snapshot permanently cold. Within a window, callers still get
// the cached snapshot.
let lastProjectsInvalidation = 0;
const PROJECTS_INVALIDATION_WINDOW_MS = 30_000;
// Blocking relay scans (candidate read-your-writes + blocking:false bypass).
let lastFreshScan = 0;
const FRESH_SCAN_MIN_INTERVAL_MS = 5_000;
// Each published event gets ONE read-your-writes expiry; retries serve cache.
const seenCandidates = new Map<string, number>();
const CANDIDATE_WINDOW_MS = 60_000;

function candidateAlreadyServed(eventId: string, now: number): boolean {
  for (const [id, ts] of seenCandidates) {
    if (now - ts > CANDIDATE_WINDOW_MS) seenCandidates.delete(id);
  }
  if (seenCandidates.has(eventId)) return true;
  seenCandidates.set(eventId, now);
  return false;
}

function parseRefreshATags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0 && tag.length <= 220),
    ),
  ].slice(0, MAX_REFRESH_ATAGS);
}

export async function POST(req: NextRequest) {
  let body: RefreshBody;
  try {
    body = (await req.json()) as RefreshBody;
  } catch {
    return NextResponse.json({ error: "JSON invalido." }, { status: 400 });
  }

  const scopes = Array.isArray(body.scopes) && body.scopes.length > 0
    ? body.scopes
    : (["projects"] satisfies RefreshScope[]);
  const refreshed: Record<string, unknown> = {};
  const expiredTags: string[] = [];

  // Two flavours of hard expiry, and the difference matters now that an Upstash
  // read-through tier sits under `"use cache"`:
  //
  //  - `expire` drops the Upstash key as well. The default: with no fresh value
  //    in hand, the next reader must re-scan rather than resurrect the entry we
  //    just invalidated.
  //  - `expireNextOnly` leaves Upstash untouched. Only for the caller that just
  //    wrote a fresh snapshot through to Upstash — deleting it there would buy
  //    nothing but a redundant ~6s rescan of data we already hold.
  const pendingExpiries: Promise<void>[] = [];
  const expire = (tag: string) => {
    pendingExpiries.push(expireNostrTag(tag));
    expiredTags.push(tag);
  };
  const expireNextOnly = (tag: string) => {
    revalidateTag(tag, { expire: 0 });
    expiredTags.push(tag);
  };

  if (scopes.includes("projects")) {
    const now = Date.now();
    const scanAllowed = now - lastFreshScan > FRESH_SCAN_MIN_INTERVAL_MS;
    let snapshot;
    if (body.blocking === false && scanAllowed) {
      // Explicit bypass: fetch straight from relays, mark the cache stale.
      lastFreshScan = now;
      snapshot = await getFreshNostrSubmissionsSnapshot();
      revalidateTag(NOSTR_PROJECTS_TAG, "max");
      revalidateTag(NOSTR_LEGACY_SUBMISSIONS_TAG, "max");
      expiredTags.push(NOSTR_PROJECTS_TAG, NOSTR_LEGACY_SUBMISSIONS_TAG);
    } else if (
      body.blocking !== false &&
      body.candidateEventId &&
      scanAllowed &&
      !candidateAlreadyServed(body.candidateEventId, now)
    ) {
      // Read-your-writes: the caller just published an event and needs the
      // snapshot to contain it. Scan the relays FIRST — that call writes the
      // fresh snapshot through to Upstash — and only then drop the Next cache
      // entry. The reverse order would let the regeneration read the *stale*
      // Upstash entry back and silently undo the refresh. Note we expire the
      // tag rather than `expireNostrTag`: the Upstash key is already fresh, so
      // dropping it would only buy a redundant ~6s rescan. One blocking refetch
      // per candidate event; repeats serve the cache (the client shows
      // "sincronizando" and retries via router.refresh).
      lastFreshScan = now;
      snapshot = await getFreshNostrSubmissionsSnapshot();
      expireNextOnly(NOSTR_PROJECTS_TAG);
      expireNextOnly(NOSTR_LEGACY_SUBMISSIONS_TAG);
    } else {
      // Stale-while-revalidate: serve the cached snapshot NOW, then mark the
      // tags stale so the next visit regenerates in the background. Reading
      // BEFORE revalidateTag is what keeps this request non-blocking — the
      // pending tag would otherwise discard the entry and re-run the ~6s
      // relay scan inline. The background regeneration reads Upstash rather
      // than the relays, so relay freshness on this path is bounded by the
      // Upstash TTL (and by the warming cron that refreshes it).
      snapshot = await getNostrSubmissionsSnapshot();
      if (now - lastProjectsInvalidation > PROJECTS_INVALIDATION_WINDOW_MS) {
        lastProjectsInvalidation = now;
        revalidateTag(NOSTR_PROJECTS_TAG, "max");
        revalidateTag(NOSTR_LEGACY_SUBMISSIONS_TAG, "max");
        expiredTags.push(NOSTR_PROJECTS_TAG, NOSTR_LEGACY_SUBMISSIONS_TAG);
      }
    }

    const registry = await getProjectRegistryState();
    refreshed.projects = {
      ...snapshot,
      projects: attachProjectSlugs(
        snapshot.projects.filter((project) => {
          if (body.hackathonId && project.hackathon !== body.hackathonId) {
            return false;
          }
          if (body.author && project.author !== body.author) return false;
          if (
            body.projectId &&
            !projectMatchesIdentifier(project, body.projectId)
          ) {
            return false;
          }
          return true;
        }),
        registry,
      ),
    };

    // Register any new projects in the La Crypta-signed slug registry.
    // after() keeps the work (and its revalidateTag) alive past the response.
    after(() => syncProjectRegistry());
  }

  if (body.pubkey) {
    if (scopes.includes("profile")) expire(nostrProfileTag(body.pubkey));
    if (scopes.includes("relay-list")) expire(nostrRelayListTag(body.pubkey));
    if (scopes.includes("badges")) expire(nostrBadgesTag(body.pubkey));
  }

  if (body.hackathonId) {
    if (scopes.includes("hackathon-badges")) {
      expire(nostrHackathonBadgesTag(body.hackathonId));
      if (body.blocking !== false) {
        refreshed.hackathonBadges =
          await getCachedHackathonBadgeCatalogSnapshot(body.hackathonId);
      }
    }
    if (scopes.includes("reports") || scopes.includes("results")) {
      expire(nostrReportsTag(body.hackathonId));
    }
  }

  const aTags = parseRefreshATags(body.aTags);
  if (aTags.length > 0) {
    if (scopes.includes("hackathon-badge-definitions")) {
      for (const aTag of aTags) expire(nostrHackathonBadgeDefinitionTag(aTag));
      if (body.blocking !== false) {
        refreshed.hackathonBadgeDefinitions =
          await getCachedHackathonBadgeDefinitionsSnapshot(aTags);
      }
    }
    if (scopes.includes("hackathon-badge-owners")) {
      for (const aTag of aTags) expire(nostrHackathonBadgeOwnersTag(aTag));
      if (body.blocking !== false) {
        refreshed.hackathonBadgeOwners = Object.fromEntries(
          await Promise.all(
            aTags.map(async (aTag) => [
              aTag,
              await getCachedHackathonBadgeOwnersSnapshot(
                aTag,
                body.issuerPubkey,
              ),
            ]),
          ),
        );
      }
    }
  }

  // Upstash deletions are fire-and-forget per call; settle them before
  // responding so a caller that immediately re-reads cannot race a key we
  // reported as expired.
  await Promise.all(pendingExpiries);

  return NextResponse.json({
    ok: true,
    expiredTags,
    refreshed,
    candidate: {
      eventId: body.candidateEventId ?? null,
      createdAt: body.candidateCreatedAt ?? null,
    },
  });
}
