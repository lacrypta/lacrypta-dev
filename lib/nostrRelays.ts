"use client";

/**
 * NIP-65 — Relay List Metadata (kind:10002).
 *
 * The user's canonical list of preferred read/write relays. Tags look like:
 *   ["r", "wss://relay.example.com"]         — read + write (both)
 *   ["r", "wss://relay.example.com", "read"] — read only
 *   ["r", "wss://relay.example.com", "write"]— write only
 *
 * This module mirrors the shape of `nostrProfile.ts`: sync-cache read,
 * background relay refresh, publish helper that updates the cache and
 * broadcasts a custom event so subscribed hooks re-render instantly.
 */

import { useEffect, useMemo, useState } from "react";
import type { UnsignedEvent, UserSigner } from "./nostrSigner";

export const RELAY_LIST_KIND = 10002;

export type RelayMarker = "read" | "write" | "both";

export type RelayEntry = {
  url: string;
  marker: RelayMarker;
};

export type CachedRelayList = {
  pubkey: string;
  entries: RelayEntry[];
  fetchedAt: number;
  /** Unix seconds from the event `created_at`. 0 if the user has no
   *  published kind:10002 and we're just returning empty. */
  eventCreatedAt: number;
};

const CACHE_PREFIX = "labs:relay-list:";
const HARD_TTL_MS = 24 * 60 * 60 * 1000;
const STALE_MS = 30 * 60 * 1000;
const EVENT = "labs:relay-list:changed";

/** Bootstrap relays used to discover a user's NIP-65 when we don't know one
 *  yet. Overlaps with profile relays; diversity matters more than size. */
export const DEFAULT_RELAY_LIST_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.primal.net",
  "wss://relay.nostr.band",
  "wss://nos.lol",
  "wss://purplepag.es",
];

/** A reasonable starter set for users who haven't published a NIP-65 yet. */
export const SUGGESTED_RELAYS: string[] = [
  "wss://relay.damus.io",
  "wss://relay.primal.net",
  "wss://relay.nostr.band",
  "wss://nos.lol",
  "wss://relay.snort.social",
  "wss://nostr.wine",
  "wss://purplepag.es",
  "wss://offchain.pub",
  "wss://relay.nsec.app",
];

export function getCachedRelayList(pubkey: string): CachedRelayList | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + pubkey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedRelayList;
    if (Date.now() - parsed.fetchedAt > HARD_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function setCachedRelayList(cached: CachedRelayList) {
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

/** Normalises a URL — ensures wss:// prefix, trims trailing slash, lowercases
 *  the protocol/host. Does NOT throw on malformed input; returns null. */
export function normalizeRelayUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^wss?:\/\//i.test(trimmed) ? trimmed : `wss://${trimmed}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "ws:" && u.protocol !== "wss:") return null;
    // Strip trailing slash on root path
    const path = u.pathname === "/" ? "" : u.pathname;
    const search = u.search;
    return `${u.protocol}//${u.host}${path}${search}`;
  } catch {
    return null;
  }
}

/** Parses the `r` tags out of a kind:10002 event into {url, marker}. */
export function parseRelayEntries(tags: string[][]): RelayEntry[] {
  const seen = new Set<string>();
  const out: RelayEntry[] = [];
  for (const t of tags) {
    if (t[0] !== "r" || !t[1]) continue;
    const url = normalizeRelayUrl(t[1]);
    if (!url) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    const hint = (t[2] ?? "").toLowerCase();
    const marker: RelayMarker =
      hint === "read" ? "read" : hint === "write" ? "write" : "both";
    out.push({ url, marker });
  }
  return out;
}

type IncomingEvent = {
  id: string;
  pubkey: string;
  content: string;
  tags: string[][];
  created_at: number;
};

export async function fetchRelayList(
  pubkey: string,
  relays: string[] = DEFAULT_RELAY_LIST_RELAYS,
  timeoutMs = 4000,
): Promise<CachedRelayList | null> {
  const { SimplePool } = await import("nostr-tools/pool");
  const pool = new SimplePool();
  const events: IncomingEvent[] = [];

  const closer = pool.subscribe(
    relays,
    { kinds: [RELAY_LIST_KIND], authors: [pubkey] },
    {
      onevent(ev: IncomingEvent) {
        events.push(ev);
      },
      oneose() {
        closer.close();
      },
    },
  );

  await new Promise((r) => setTimeout(r, timeoutMs));
  closer.close();
  try {
    pool.close(relays);
  } catch {
    /* noop */
  }

  if (events.length === 0) return null;
  events.sort((a, b) => b.created_at - a.created_at);
  const latest = events[0];
  const entries = parseRelayEntries(latest.tags);
  const cached: CachedRelayList = {
    pubkey,
    entries,
    fetchedAt: Date.now(),
    eventCreatedAt: latest.created_at,
  };
  setCachedRelayList(cached);
  return cached;
}

/* ─────────────────────────── publish (kind:10002) ──────────────────────── */

export type PublishRelayListRelayResult = {
  relay: string;
  ok: boolean;
  error?: string;
};

export type PublishRelayListResult = {
  relays: PublishRelayListRelayResult[];
  eventCreatedAt: number;
};

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout ${ms}ms — ${label}`)), ms),
    ),
  ]);
}

function buildRelayListTags(entries: RelayEntry[]): string[][] {
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const e of entries) {
    const url = normalizeRelayUrl(e.url);
    if (!url) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    if (e.marker === "both") {
      out.push(["r", url]);
    } else {
      out.push(["r", url, e.marker]);
    }
  }
  return out;
}

/**
 * Publishes a kind:10002 relay list. `publishRelays` is the set the event is
 * broadcast to (usually the user's current write-capable relays plus a few
 * discovery relays so other clients can find the update). The event's own
 * tags describe the *new* relay set — they don't have to overlap.
 */
export async function publishRelayList(
  signer: UserSigner,
  entries: RelayEntry[],
  publishRelays: string[],
  opts?: { signTimeoutMs?: number; publishTimeoutMs?: number },
): Promise<PublishRelayListResult> {
  const { signTimeoutMs = 30_000, publishTimeoutMs = 8_000 } = opts ?? {};
  const tags = buildRelayListTags(entries);
  const now = Math.floor(Date.now() / 1000);
  const unsigned: UnsignedEvent = {
    kind: RELAY_LIST_KIND,
    pubkey: signer.pubkey,
    created_at: now,
    tags,
    content: "",
  };

  const signed = await withTimeout(
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
  const results: PublishRelayListRelayResult[] = await Promise.all(
    pool.publish(publishRelays, signed).map(async (p, i) => {
      const relay = publishRelays[i];
      try {
        await withTimeout(p, publishTimeoutMs, relay);
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
    pool.close(publishRelays);
  } catch {
    /* noop */
  }

  const okCount = results.filter((r) => r.ok).length;
  if (okCount === 0) {
    const err = new Error(
      `Ningún relay aceptó la lista.\n${results
        .map((r) => `${r.relay}: ${r.error ?? "sin respuesta"}`)
        .join("\n")}`,
    );
    (err as Error & {
      relayResults: PublishRelayListRelayResult[];
    }).relayResults = results;
    throw err;
  }

  // Snapshot the new list into cache so subscribers update immediately
  setCachedRelayList({
    pubkey: signer.pubkey,
    entries: parseRelayEntries(tags),
    fetchedAt: Date.now(),
    eventCreatedAt: signed.created_at,
  });

  return { relays: results, eventCreatedAt: signed.created_at };
}

/* ─────────────────────────────── hook ─────────────────────────────────── */

export function useRelayList(pubkey: string | null | undefined) {
  const [cached, setCached] = useState<CachedRelayList | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!pubkey) {
      setCached(null);
      return;
    }
    setCached(getCachedRelayList(pubkey));
  }, [pubkey]);

  useEffect(() => {
    if (!pubkey) return;
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<{ pubkey?: string }>).detail;
      if (!detail || detail.pubkey === pubkey) {
        setCached(getCachedRelayList(pubkey));
      }
    };
    window.addEventListener(EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [pubkey]);

  useEffect(() => {
    if (!pubkey) return;
    const existing = getCachedRelayList(pubkey);
    const isFresh = existing && Date.now() - existing.fetchedAt < STALE_MS;
    if (isFresh) return;

    let cancelled = false;
    setLoading(true);
    fetchRelayList(pubkey)
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
  }, [pubkey]);

  // Keep `entries` reference stable when `cached` is null/unchanged — a
  // fresh `?? []` on every render would make downstream `[entries]` effects
  // fire forever.
  const entries = useMemo<RelayEntry[]>(
    () => cached?.entries ?? [],
    [cached],
  );

  return {
    entries,
    cached,
    loading,
    /** True if the user has a published kind:10002; false means we only have
     *  a best-effort fallback. */
    hasPublished: !!cached && cached.eventCreatedAt > 0,
  };
}
