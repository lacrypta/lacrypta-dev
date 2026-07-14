import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import {
  getFreshNostrSubmissionsSnapshot,
  getNostrSubmissionsSnapshot,
  getProjectWithDurableFallback,
  rawFetchProjectByDTag,
  type CachedNostrProject,
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
  nostrProjectByIdTag,
  nostrRelayListTag,
  nostrReportsTag,
} from "@/lib/nostrCacheTags";
import {
  UPSTASH_KEYS,
  UPSTASH_TTL,
  upstashSet,
} from "@/lib/upstashCache";
import {
  getCachedHackathonBadgeCatalogSnapshot,
  getCachedHackathonBadgeDefinitionsSnapshot,
  getCachedHackathonBadgeOwnersSnapshot,
} from "@/lib/hackathonBadgeCache";

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
    const registry = await getProjectRegistryState();

    if (body.projectId) {
      // Targeted per-project refetch+recache. The frontend detected a newer
      // event (or just wants this project warm): fetch ONLY this project by its
      // `#d` (~4.5s) instead of the ~6s broad snapshot scan, write its durable +
      // short KV copies so it always resolves, and return the cached snapshot
      // with the fresh project merged in (never shrink the client's community
      // cache to a single item).
      // Lowercase so the KV keys we write match the lowercased ids the resolver
      // reads back (getProjectWithDurableFallback / getNostrProjectByIdDirect).
      const pid = body.projectId.toLowerCase();
      // This endpoint is UNAUTHENTICATED, so it must never persist an
      // attacker-chosen event as a project's authoritative copy. The durable
      // key is only for REGISTERED projects, and only their registry-recorded
      // author's event: filter the fetch by that author, and write the durable
      // key only when the project is registered. Unregistered ids get at most a
      // short-lived lookup copy (30s), never the 1-year durable one.
      const registeredAuthor = registry.byIdLc.get(pid)?.author;
      const scanAllowed = now - lastFreshScan > FRESH_SCAN_MIN_INTERVAL_MS;
      const wantsFresh =
        body.blocking !== false &&
        !!body.candidateEventId &&
        scanAllowed &&
        !candidateAlreadyServed(body.candidateEventId, now);

      let project: CachedNostrProject | null = null;
      if (wantsFresh) {
        lastFreshScan = now;
        const fetched = await rawFetchProjectByDTag(
          pid,
          4500,
          registeredAuthor,
        );
        if (fetched) {
          project = { ...fetched, id: pid };
          if (registeredAuthor) {
            await upstashSet(
              UPSTASH_KEYS.projectDurable(pid),
              project,
              UPSTASH_TTL.durable,
            );
          }
          await upstashSet(
            UPSTASH_KEYS.projectById(pid),
            project,
            UPSTASH_TTL.lookup,
          );
          // Refresh the per-id Next entry ONLY — the Upstash keys we just wrote
          // must survive (expireNostrTag would delete them).
          expireNextOnly(nostrProjectByIdTag(pid));
        }
      }
      if (!project) {
        // Throttled, no candidate, or a relay miss → serve the durable/cached
        // copy so a registered project never regresses to "not found". Guard by
        // the registered author so a poisoned copy is never served.
        project = await getProjectWithDurableFallback(pid, registeredAuthor);
      }

      const cached = await getNostrSubmissionsSnapshot();
      let list: CachedNostrProject[];
      if (project) {
        const fresh = project;
        list = [
          fresh,
          ...cached.projects.filter(
            (p) =>
              !(
                p.author === fresh.author &&
                p.id.toLowerCase() === fresh.id.toLowerCase()
              ),
          ),
        ];
      } else {
        list = cached.projects;
      }
      refreshed.projects = {
        projects: attachProjectSlugs(list, registry),
        generatedAt: new Date().toISOString(),
        relays: cached.relays,
      };
    } else {
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
        // dropping it would only buy a redundant ~6s rescan. One blocking
        // refetch per candidate event; repeats serve the cache (the client
        // shows "sincronizando" and retries via router.refresh).
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

      refreshed.projects = {
        ...snapshot,
        projects: attachProjectSlugs(
          snapshot.projects.filter((project) => {
            if (body.hackathonId && project.hackathon !== body.hackathonId) {
              return false;
            }
            if (body.author && project.author !== body.author) return false;
            return true;
          }),
          registry,
        ),
      };
    }

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
