import { cacheLife, cacheTag } from "next/cache";
import { FAST_USER_RELAYS } from "./nostrRelayConfig";
import { nostrRelayListTag } from "./nostrCacheTags";

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
  eventCreatedAt: number;
};

type IncomingEvent = {
  pubkey: string;
  tags: string[][];
  created_at: number;
};

function normalizeRelayUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^wss?:\/\//i.test(trimmed) ? trimmed : `wss://${trimmed}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "ws:" && u.protocol !== "wss:") return null;
    const path = u.pathname === "/" ? "" : u.pathname;
    return `${u.protocol}//${u.host}${path}${u.search}`;
  } catch {
    return null;
  }
}

function parseRelayEntries(tags: string[][]): RelayEntry[] {
  const seen = new Set<string>();
  const out: RelayEntry[] = [];
  for (const tag of tags) {
    if (tag[0] !== "r" || !tag[1]) continue;
    const url = normalizeRelayUrl(tag[1]);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const hint = (tag[2] ?? "").toLowerCase();
    const marker: RelayMarker =
      hint === "read" ? "read" : hint === "write" ? "write" : "both";
    out.push({ url, marker });
  }
  return out;
}

async function rawFetchRelayList(
  pubkey: string,
  timeoutMs = 3500,
): Promise<CachedRelayList | null> {
  const { SimplePool } = await import("nostr-tools/pool");
  const pool = new SimplePool();
  let latest: IncomingEvent | null = null;

  const closer = pool.subscribe(
    FAST_USER_RELAYS,
    { kinds: [RELAY_LIST_KIND], authors: [pubkey] },
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
    pool.close(FAST_USER_RELAYS);
  } catch {
    /* noop */
  }

  if (!latest) return null;
  const ev = latest as IncomingEvent;
  return {
    pubkey,
    entries: parseRelayEntries(ev.tags),
    fetchedAt: Date.now(),
    eventCreatedAt: ev.created_at,
  };
}

export async function getCachedRelayList(
  pubkey: string,
): Promise<CachedRelayList | null> {
  "use cache";
  cacheLife("days");
  cacheTag(nostrRelayListTag(pubkey));
  try {
    return await rawFetchRelayList(pubkey);
  } catch {
    return null;
  }
}
