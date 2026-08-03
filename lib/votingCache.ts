/**
 * Server-only read of the voting period event — the kind-30078 replaceable
 * event published by La Crypta (see `app/api/hackathons/[id]/voting`).
 * Mirrors `lib/nostrSoldiersCache.ts`: one cached relay round-trip, freshest
 * event wins, `null` on any miss. The `authors` filter (publisher pubkey
 * derived from LACRYPTA_NSEC) is the trust anchor.
 */

import { cacheLife, cacheTag } from "next/cache";
import { DEFAULT_RELAYS } from "./nostrRelayConfig";
import { nostrVotingTag } from "./nostrCacheTags";
import { HACKATHONS, hackathonStatus, type Hackathon } from "./hackathons";
import {
  JUDGES_KIND,
  VOTING_KIND,
  judgesDTag,
  parseVotingPeriod,
  votingPeriodDTag,
  type VotingPeriod,
} from "./voting";

type IncomingEvent = {
  id: string;
  pubkey: string;
  content: string;
  tags: string[][];
  created_at: number;
};

async function publisherPubkeyFromNsec(): Promise<string> {
  const nsec = process.env.LACRYPTA_NSEC;
  if (!nsec) return "";
  const { decode } = await import("nostr-tools/nip19");
  const { getPublicKey } = await import("nostr-tools/pure");
  const decoded = decode(nsec);
  if (decoded.type !== "nsec") return "";
  return getPublicKey(decoded.data as Uint8Array);
}

/** Uncached relay fetch — used by the admin POST route to read current state. */
export async function fetchVotingPeriodFromRelays(
  hackathonId: string,
  timeoutMs = 4500,
): Promise<{ period: VotingPeriod; eventCreatedAt: number } | null> {
  const publisherPubkey = await publisherPubkeyFromNsec();
  if (!publisherPubkey) return null;

  const relays = DEFAULT_RELAYS;
  const { SimplePool } = await import("nostr-tools/pool");
  const pool = new SimplePool();
  const events: IncomingEvent[] = [];

  const closer = pool.subscribe(
    relays,
    {
      kinds: [VOTING_KIND],
      authors: [publisherPubkey],
      "#d": [votingPeriodDTag(hackathonId)],
    },
    {
      onevent(ev: IncomingEvent) {
        events.push(ev);
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
    pool.close(relays);
  } catch {
    /* noop */
  }

  events.sort(
    (a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id),
  );
  for (const ev of events) {
    // Some relays match `#d` loosely — re-check the exact tag.
    const d = ev.tags.find((t) => t[0] === "d")?.[1];
    if (d !== votingPeriodDTag(hackathonId)) continue;
    const period = parseVotingPeriod(ev.content);
    if (period) return { period, eventCreatedAt: ev.created_at };
  }
  return null;
}

/**
 * Uncached relay fetch of the judges' scores event (raw, still NIP-44
 * encrypted). The caller decrypts it server-side with LACRYPTA_NSEC (the event
 * is self-encrypted: author == La Crypta, encrypted to its own pubkey).
 */
export async function fetchJudgesEventFromRelays(
  hackathonId: string,
  timeoutMs = 4500,
): Promise<{ content: string; pubkey: string; created_at: number } | null> {
  const publisherPubkey = await publisherPubkeyFromNsec();
  if (!publisherPubkey) return null;

  const relays = DEFAULT_RELAYS;
  const { SimplePool } = await import("nostr-tools/pool");
  const pool = new SimplePool();
  const events: IncomingEvent[] = [];

  const closer = pool.subscribe(
    relays,
    {
      kinds: [JUDGES_KIND],
      authors: [publisherPubkey],
      "#d": [judgesDTag(hackathonId)],
    },
    {
      onevent(ev: IncomingEvent) {
        events.push(ev);
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
    pool.close(relays);
  } catch {
    /* noop */
  }

  events.sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id));
  for (const ev of events) {
    const d = ev.tags.find((t) => t[0] === "d")?.[1];
    if (d !== judgesDTag(hackathonId)) continue;
    return { content: ev.content, pubkey: ev.pubkey, created_at: ev.created_at };
  }
  return null;
}

export async function getCachedVotingPeriod(
  hackathonId: string,
): Promise<VotingPeriod | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(nostrVotingTag(hackathonId));
  try {
    const found = await fetchVotingPeriodFromRelays(hackathonId);
    return found?.period ?? null;
  } catch {
    return null;
  }
}

/** How many of the most recent hackathons `getFeaturedVotingRound()` scans.
 *  A round only ever belongs to the hackathon in play (or the one that just
 *  ended), so this bounds the relay work as the back catalogue grows. */
const FEATURED_VOTING_LOOKBACK = 3;

/**
 * Hackathons that could plausibly have a voting round right now: the most
 * recent ones that already opened (a round is published after the apertura),
 * newest first. Reading the clock here is intentional — the caller is a
 * `"use cache"` scope, so the list is frozen with the cache entry and only
 * matters on the day a hackathon starts.
 */
function featuredVotingCandidates(now: Date = new Date()): Hackathon[] {
  return HACKATHONS.filter((h) => hackathonStatus(h, now) !== "upcoming")
    .sort((a, b) => b.number - a.number)
    .slice(0, FEATURED_VOTING_LOOKBACK);
}

export type FeaturedVotingRound = {
  hackathon: Hackathon;
  period: VotingPeriod;
};

/**
 * Resolves the community voting round the home page should feature: the open
 * one (freshest `openedAt` if several somehow overlap), else the most recently
 * closed one. Returns null when no hackathon has a published round.
 *
 * MUST be called from inside a `"use cache"` scope: it registers the voting
 * cache tag of EVERY hackathon on the caller — inner `"use cache"` tags don't
 * bubble in Next 16, and tagging only the scanned candidates would let a round
 * that opens for a brand-new hackathon miss the home revalidation.
 */
export async function getFeaturedVotingRound(): Promise<FeaturedVotingRound | null> {
  for (const h of HACKATHONS) cacheTag(nostrVotingTag(h.id));

  const rounds = await Promise.all(
    featuredVotingCandidates().map(async (hackathon) => ({
      hackathon,
      period: await getCachedVotingPeriod(hackathon.id),
    })),
  );
  const found = rounds.filter(
    (r): r is FeaturedVotingRound => r.period !== null,
  );
  if (found.length === 0) return null;

  const open = found
    .filter((r) => r.period.status === "open")
    .sort((a, b) => b.period.openedAt - a.period.openedAt);
  if (open.length > 0) return open[0];

  return found.sort(
    (a, b) =>
      (b.period.closedAt ?? b.period.openedAt) -
      (a.period.closedAt ?? a.period.openedAt),
  )[0];
}
