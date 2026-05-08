/**
 * Server-only cached fetcher for kind:0 Nostr profile metadata.
 *
 * Mirrors `lib/nostrProfile.ts` (which is "use client") but runs in server
 * components and uses Next 16's `"use cache"` so each pubkey's metadata is
 * fetched once per cache window. Per-pubkey cacheTag means a future
 * revalidate endpoint can bust a single profile.
 */

import { cacheLife, cacheTag } from "next/cache";
import { DEFAULT_RELAYS } from "./nostrRelayConfig";

export type CachedNostrProfile = {
  pubkey: string;
  name?: string;
  display_name?: string;
  picture?: string;
  banner?: string;
  about?: string;
  nip05?: string;
  lud16?: string;
  website?: string;
  eventCreatedAt: number;
};

type IncomingEvent = {
  content: string;
  created_at: number;
};

async function rawFetchProfile(
  pubkey: string,
  timeoutMs = 3500,
): Promise<CachedNostrProfile | null> {
  const { SimplePool } = await import("nostr-tools/pool");
  const pool = new SimplePool();
  let latest: IncomingEvent | null = null;

  const closer = pool.subscribe(
    DEFAULT_RELAYS,
    { kinds: [0], authors: [pubkey] },
    {
      onevent(ev: IncomingEvent) {
        if (!latest || ev.created_at > latest.created_at) latest = ev;
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
    pool.close(DEFAULT_RELAYS);
  } catch {
    /* noop */
  }

  if (!latest) return null;
  const ev = latest as IncomingEvent;
  try {
    const parsed = JSON.parse(ev.content) as Record<string, unknown>;
    const str = (v: unknown) =>
      typeof v === "string" && v.trim() ? v.trim() : undefined;
    return {
      pubkey,
      name: str(parsed.name),
      display_name:
        str(parsed.display_name) ?? str(parsed.displayName),
      picture: str(parsed.picture),
      banner: str(parsed.banner),
      about: str(parsed.about),
      nip05: str(parsed.nip05),
      lud16: str(parsed.lud16),
      website: str(parsed.website),
      eventCreatedAt: ev.created_at,
    };
  } catch {
    return null;
  }
}

export async function getCachedNostrProfile(
  pubkey: string,
): Promise<CachedNostrProfile | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(`nostr:profile:${pubkey}`);
  try {
    return await rawFetchProfile(pubkey);
  } catch {
    return null;
  }
}
