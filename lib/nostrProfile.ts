"use client";

import { useEffect, useState } from "react";
import { DEFAULT_RELAYS } from "./nostrRelayConfig";
import type { UnsignedEvent, UserSigner } from "./nostrSigner";

export type NostrProfile = {
  name?: string;
  display_name?: string;
  picture?: string;
  banner?: string;
  about?: string;
  nip05?: string;
  lud16?: string;
  website?: string;
};

export type CachedProfile = {
  pubkey: string;
  profile: NostrProfile;
  fetchedAt: number;
  eventCreatedAt: number;
  relaysUsed: string[];
};

const CACHE_PREFIX = "labs:profile:";
// Serve from cache up to 24h even if stale
const HARD_TTL_MS = 24 * 60 * 60 * 1000;
// Consider entries older than 30 min as stale and refresh in the background
const STALE_MS = 30 * 60 * 1000;
const EVENT = "labs:profile:changed";

export const DEFAULT_PROFILE_RELAYS = DEFAULT_RELAYS;

export function getCachedProfile(pubkey: string): CachedProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + pubkey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedProfile;
    if (Date.now() - parsed.fetchedAt > HARD_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function setCachedProfile(cached: CachedProfile) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      CACHE_PREFIX + cached.pubkey,
      JSON.stringify(cached),
    );
    window.dispatchEvent(
      new CustomEvent(EVENT, { detail: { pubkey: cached.pubkey } }),
    );
  } catch {
    /* quota */
  }
}

export async function fetchNostrProfile(
  pubkey: string,
  relays: string[] = DEFAULT_PROFILE_RELAYS,
  timeoutMs = 4000,
): Promise<CachedProfile | null> {
  const { SimplePool } = await import("nostr-tools/pool");
  const pool = new SimplePool();
  const events: { content: string; created_at: number }[] = [];

  const closer = pool.subscribe(
    relays,
    { kinds: [0], authors: [pubkey] },
    {
      onevent(ev: { content: string; created_at: number }) {
        events.push(ev);
      },
      oneose() {
        closer.close();
      },
    },
  );

  await new Promise((r) => setTimeout(r, timeoutMs));
  closer.close();

  events.sort((a, b) => b.created_at - a.created_at);
  const latest = events[0];
  if (!latest) return null;

  try {
    const parsed = JSON.parse(latest.content);
    const cached: CachedProfile = {
      pubkey,
      profile: {
        name: parsed.name,
        display_name: parsed.display_name ?? parsed.displayName,
        picture: parsed.picture,
        banner: parsed.banner,
        about: parsed.about,
        nip05: parsed.nip05,
        lud16: parsed.lud16,
        website: parsed.website,
      },
      fetchedAt: Date.now(),
      eventCreatedAt: latest.created_at,
      relaysUsed: relays,
    };
    setCachedProfile(cached);
    return cached;
  } catch {
    return null;
  }
}

/* ─────────────────────────── publish (kind:0) ─────────────────────────── */

export type PublishProfileRelayResult = {
  relay: string;
  ok: boolean;
  error?: string;
};

export type PublishProfileResult = {
  relays: PublishProfileRelayResult[];
  /** Unix seconds — `created_at` of the published event. */
  eventCreatedAt: number;
};

function withPublishTimeout<T>(
  p: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout ${ms}ms — ${label}`)), ms),
    ),
  ]);
}

function cleanProfileContent(profile: NostrProfile): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(profile)) {
    if (typeof v !== "string") continue;
    const trimmed = v.trim();
    if (trimmed.length === 0) continue;
    out[k] = trimmed;
  }
  return out;
}

/**
 * Publishes a kind:0 metadata event (the Nostr profile). Clients that
 * follow NIP-01 replace the previous profile with the freshest one by
 * `created_at`, so publishing is an update.
 *
 * Updates the local cache on success so `useNostrProfile` reflects the
 * change instantly without waiting for the relay round-trip.
 */
export async function publishNostrProfile(
  signer: UserSigner,
  profile: NostrProfile,
  relays: string[] = DEFAULT_PROFILE_RELAYS,
  opts?: { signTimeoutMs?: number; publishTimeoutMs?: number },
): Promise<PublishProfileResult> {
  const { signTimeoutMs = 30_000, publishTimeoutMs = 8_000 } = opts ?? {};
  const content = cleanProfileContent(profile);
  const now = Math.floor(Date.now() / 1000);

  const unsigned: UnsignedEvent = {
    kind: 0,
    pubkey: signer.pubkey,
    created_at: now,
    tags: [["client", "La Crypta Dev"]],
    content: JSON.stringify(content),
  };

  const signed = await withPublishTimeout(
    signer.signEvent(unsigned),
    signTimeoutMs,
    "esperando firma",
  );
  if (signed.pubkey !== signer.pubkey) {
    throw new Error(
      `El firmante devolvió otra pubkey (esperada ${signer.pubkey.slice(0, 10)}…, recibida ${signed.pubkey.slice(0, 10)}…).`,
    );
  }

  const { SimplePool } = await import("nostr-tools/pool");
  const pool = new SimplePool();
  const results: PublishProfileRelayResult[] = await Promise.all(
    pool.publish(relays, signed).map(async (p, i) => {
      const relay = relays[i];
      try {
        await withPublishTimeout(p, publishTimeoutMs, relay);
        return { relay, ok: true };
      } catch (e) {
        return {
          relay,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }),
  );
  try {
    pool.close(relays);
  } catch {
    /* noop */
  }

  const okCount = results.filter((r) => r.ok).length;
  if (okCount === 0) {
    const err = new Error(
      `Ningún relay aceptó el perfil.\n${results
        .map((r) => `${r.relay}: ${r.error ?? "sin respuesta"}`)
        .join("\n")}`,
    );
    (err as Error & { relayResults: PublishProfileRelayResult[] }).relayResults =
      results;
    throw err;
  }

  // Snapshot the new profile into the local cache so listeners update
  // immediately (the background scan would pick it up eventually, but the
  // cache write short-circuits that for a snappier UX).
  setCachedProfile({
    pubkey: signer.pubkey,
    profile: content as NostrProfile,
    fetchedAt: Date.now(),
    eventCreatedAt: signed.created_at,
    relaysUsed: relays,
  });

  return { relays: results, eventCreatedAt: signed.created_at };
}

export function useNostrProfile(
  pubkey: string | null | undefined,
  relays?: string[],
) {
  const [cached, setCached] = useState<CachedProfile | null>(null);
  const [loading, setLoading] = useState(false);

  // Hydrate from cache once on client
  useEffect(() => {
    if (!pubkey) {
      setCached(null);
      return;
    }
    setCached(getCachedProfile(pubkey));
  }, [pubkey]);

  // Subscribe to cache updates from other hook instances
  useEffect(() => {
    if (!pubkey) return;
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<{ pubkey?: string }>).detail;
      if (!detail || detail.pubkey === pubkey) {
        setCached(getCachedProfile(pubkey));
      }
    };
    window.addEventListener(EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [pubkey]);

  // Refresh if stale or missing
  useEffect(() => {
    if (!pubkey) return;
    const existing = getCachedProfile(pubkey);
    const isFresh = existing && Date.now() - existing.fetchedAt < STALE_MS;
    if (isFresh) return;

    let cancelled = false;
    setLoading(true);
    fetchNostrProfile(pubkey, relays)
      .then((fresh) => {
        if (!cancelled && fresh) setCached(fresh);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pubkey, relays?.join(",")]);

  return {
    profile: cached?.profile ?? null,
    cached,
    loading,
    /** true if we have any cached data, even if stale */
    hasCache: !!cached,
  };
}
