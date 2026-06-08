import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import {
  getFreshNostrSubmissionsSnapshot,
  getNostrSubmissionsSnapshot,
} from "@/lib/nostrCache";
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

function expireTag(tag: string) {
  revalidateTag(tag, { expire: 0 });
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

  const expire = (tag: string) => {
    expireTag(tag);
    expiredTags.push(tag);
  };

  if (scopes.includes("projects")) {
    expire(NOSTR_PROJECTS_TAG);
    expire(NOSTR_LEGACY_SUBMISSIONS_TAG);
    const snapshot = body.blocking === false
      ? await getFreshNostrSubmissionsSnapshot()
      : await getNostrSubmissionsSnapshot();
    refreshed.projects = {
      ...snapshot,
      projects: snapshot.projects.filter((project) => {
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
    };
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

  const aTags = Array.isArray(body.aTags)
    ? body.aTags
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => tag.trim())
        .filter(Boolean)
    : [];
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
