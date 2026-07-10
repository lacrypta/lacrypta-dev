/**
 * Server-only cached read of the official soldiers ranking — the kind-30078
 * replaceable event published by La Crypta (see `app/api/soldiers/ranking`).
 * Mirrors `lib/nostrReportsCache.ts`: one cached relay round-trip, freshest
 * event wins, `null` on any miss so the caller falls back to a live build.
 */

import { cacheLife, cacheTag } from "next/cache";
import { DEFAULT_RELAYS } from "./nostrRelayConfig";
import { NOSTR_SOLDIERS_RANKING_TAG } from "./nostrCacheTags";
import {
  RANKING_D_TAG,
  RANKING_KIND,
  parseRankingSnapshot,
  type SoldiersRankingSnapshot,
} from "./soldiersRanking";
import { UPSTASH_KEYS, UPSTASH_TTL, upstashReadThrough } from "./upstashCache";

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

async function rawFetchRankingSnapshot(
  timeoutMs = 4500,
): Promise<SoldiersRankingSnapshot | null> {
  const publisherPubkey = await publisherPubkeyFromNsec();
  if (!publisherPubkey) return null;

  const relays = DEFAULT_RELAYS;
  const { SimplePool } = await import("nostr-tools/pool");
  const pool = new SimplePool();
  const events: IncomingEvent[] = [];

  const closer = pool.subscribe(
    relays,
    {
      kinds: [RANKING_KIND],
      authors: [publisherPubkey],
      "#d": [RANKING_D_TAG],
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

  events.sort((a, b) => b.created_at - a.created_at);
  for (const ev of events) {
    const snapshot = parseRankingSnapshot(ev.content);
    if (snapshot) return snapshot;
  }
  return null;
}

export async function getCachedSoldiersRankingSnapshot(): Promise<SoldiersRankingSnapshot | null> {
  "use cache";
  cacheLife("days");
  cacheTag(NOSTR_SOLDIERS_RANKING_TAG);
  return upstashReadThrough(
    UPSTASH_KEYS.soldiersRanking,
    UPSTASH_TTL.ranking,
    async () => {
      try {
        return await rawFetchRankingSnapshot();
      } catch {
        return null;
      }
    },
  );
}
