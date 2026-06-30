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
