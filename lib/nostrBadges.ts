"use client";

import { useEffect, useState } from "react";
import type { SignedEvent, UserSigner } from "./nostrSigner";

/* NIP-58 Badges
 *   kind 30009  Badge Definition (parameterized replaceable)
 *   kind 8      Badge Award
 *   kind 30008  Profile Badges (user-curated display list)
 *
 * Flow used here: fetch every award (kind 8) targeting the user
 * (#p:[pubkey]), resolve each award's referenced badge definition
 * (an `a` tag like `30009:<issuer>:<d>`) and surface them all.
 */

export type BadgeDefinition = {
  issuer: string; // pubkey
  d: string;
  name?: string;
  description?: string;
  image?: string;
  thumb?: string;
};

export type AwardedBadge = {
  awardId: string;
  issuer: string;
  /** aTag = `30009:<issuer>:<d>` */
  aTag: string;
  awardedAt: number;
  definition?: BadgeDefinition;
};

export type ProfileBadges = {
  aTags: string[];
  /** event id -> aTag (optional pairing for `e` tags when publishing) */
  eventIdByATag: Record<string, string>;
  eventId?: string;
  eventCreatedAt?: number;
};

const PROFILE_BADGES_CACHE = "labs:profile-badges:";
const PROFILE_BADGES_D = "profile_badges";

const CACHE_PREFIX = "labs:badges:";
const TTL_MS = 6 * 60 * 60 * 1000;

export const DEFAULT_BADGE_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.primal.net",
  "wss://relay.nostr.band",
  "wss://nos.lol",
  "wss://relay.snort.social",
  "wss://nostr.wine",
];

type IncomingEvent = {
  id: string;
  pubkey: string;
  kind: number;
  content: string;
  tags: string[][];
  created_at: number;
};

type Cached = {
  fetchedAt: number;
  badges: AwardedBadge[];
};

function getCache(pubkey: string): Cached | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + pubkey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Cached;
    if (Date.now() - parsed.fetchedAt > TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function setCache(pubkey: string, badges: AwardedBadge[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      CACHE_PREFIX + pubkey,
      JSON.stringify({ fetchedAt: Date.now(), badges } satisfies Cached),
    );
  } catch {
    /* quota */
  }
}

function parseDefinitionEvent(ev: IncomingEvent): BadgeDefinition | null {
  if (ev.kind !== 30009) return null;
  const d = ev.tags.find((t) => t[0] === "d")?.[1];
  if (!d) return null;
  const tagVal = (name: string) =>
    ev.tags.find((t) => t[0] === name)?.[1] ?? undefined;
  return {
    issuer: ev.pubkey,
    d,
    name: tagVal("name"),
    description: tagVal("description"),
    image: tagVal("image"),
    thumb: tagVal("thumb") ?? tagVal("image"),
  };
}

export async function fetchUserBadges(
  pubkey: string,
  relays: string[] = DEFAULT_BADGE_RELAYS,
  timeoutMs = 5000,
): Promise<AwardedBadge[]> {
  const { SimplePool } = await import("nostr-tools/pool");
  const pool = new SimplePool();

  // 1) Gather all award events addressed to the user.
  const awards: IncomingEvent[] = [];
  const awardCloser = pool.subscribe(
    relays,
    { kinds: [8], "#p": [pubkey] },
    {
      onevent(ev: IncomingEvent) {
        awards.push(ev);
      },
      oneose() {
        awardCloser.close();
      },
    },
  );
  await new Promise((r) => setTimeout(r, timeoutMs));
  awardCloser.close();

  if (awards.length === 0) {
    try {
      pool.close(relays);
    } catch {
      /* noop */
    }
    setCache(pubkey, []);
    return [];
  }

  // 2) Extract unique (issuer, d) pairs from the awards' `a` tags.
  type Key = { issuer: string; d: string };
  const needed = new Map<string, Key>();
  const awardMeta: {
    event: IncomingEvent;
    aTag: string;
    key: Key;
  }[] = [];
  for (const ev of awards) {
    const aTag = ev.tags.find((t) => t[0] === "a")?.[1];
    if (!aTag) continue;
    const parts = aTag.split(":");
    if (parts.length < 3 || parts[0] !== "30009") continue;
    const key: Key = { issuer: parts[1], d: parts.slice(2).join(":") };
    needed.set(`${key.issuer}|${key.d}`, key);
    awardMeta.push({ event: ev, aTag, key });
  }

  if (needed.size === 0) {
    try {
      pool.close(relays);
    } catch {
      /* noop */
    }
    setCache(pubkey, []);
    return [];
  }

  // 3) Fetch all referenced badge definitions.
  const issuers = [...new Set([...needed.values()].map((k) => k.issuer))];
  const ds = [...new Set([...needed.values()].map((k) => k.d))];
  const defs = new Map<string, BadgeDefinition>();
  const defCloser = pool.subscribe(
    relays,
    { kinds: [30009], authors: issuers, "#d": ds },
    {
      onevent(ev: IncomingEvent) {
        const def = parseDefinitionEvent(ev);
        if (def) {
          const k = `${def.issuer}|${def.d}`;
          const prev = defs.get(k);
          // keep newest if multiple copies come in
          if (!prev) defs.set(k, def);
        }
      },
      oneose() {
        defCloser.close();
      },
    },
  );
  await new Promise((r) => setTimeout(r, timeoutMs));
  defCloser.close();
  try {
    pool.close(relays);
  } catch {
    /* noop */
  }

  // 4) Merge + dedupe (only keep the latest award per (issuer, d)).
  const byBadge = new Map<string, AwardedBadge>();
  for (const { event, aTag, key } of awardMeta) {
    const mapKey = `${key.issuer}|${key.d}`;
    const existing = byBadge.get(mapKey);
    if (existing && existing.awardedAt >= event.created_at) continue;
    byBadge.set(mapKey, {
      awardId: event.id,
      issuer: key.issuer,
      aTag,
      awardedAt: event.created_at,
      definition: defs.get(mapKey),
    });
  }

  const result = [...byBadge.values()]
    // Only return badges whose definition we could resolve (the rest are broken refs).
    .filter((b) => b.definition)
    .sort((a, b) => b.awardedAt - a.awardedAt);

  setCache(pubkey, result);
  return result;
}

/* ────────────────────── profile_badges (kind 30008) ───────────────────── */

function parseProfileBadgesEvent(ev: IncomingEvent): ProfileBadges | null {
  if (ev.kind !== 30008) return null;
  const d = ev.tags.find((t) => t[0] === "d")?.[1];
  if (d !== PROFILE_BADGES_D) return null;

  const aTags: string[] = [];
  const eventIdByATag: Record<string, string> = {};

  // NIP-58 profile_badges tags come as ordered (a, e) pairs.
  for (let i = 0; i < ev.tags.length; i++) {
    const tag = ev.tags[i];
    if (tag[0] !== "a") continue;
    const aVal = tag[1];
    if (!aVal) continue;
    aTags.push(aVal);
    // Look ahead for matching `e` tag
    const next = ev.tags[i + 1];
    if (next && next[0] === "e" && next[1]) {
      eventIdByATag[aVal] = next[1];
    }
  }

  return {
    aTags,
    eventIdByATag,
    eventId: ev.id,
    eventCreatedAt: ev.created_at,
  };
}

export function getCachedProfileBadges(pubkey: string): ProfileBadges | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PROFILE_BADGES_CACHE + pubkey);
    if (!raw) return null;
    return JSON.parse(raw) as ProfileBadges;
  } catch {
    return null;
  }
}

function setCachedProfileBadges(pubkey: string, pb: ProfileBadges) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      PROFILE_BADGES_CACHE + pubkey,
      JSON.stringify(pb),
    );
  } catch {
    /* quota */
  }
}

export async function fetchProfileBadges(
  pubkey: string,
  relays: string[] = DEFAULT_BADGE_RELAYS,
  timeoutMs = 4000,
): Promise<ProfileBadges> {
  const { SimplePool } = await import("nostr-tools/pool");
  const pool = new SimplePool();
  const events: IncomingEvent[] = [];
  const closer = pool.subscribe(
    relays,
    { kinds: [30008], authors: [pubkey], "#d": [PROFILE_BADGES_D] },
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

  events.sort((a, b) => b.created_at - a.created_at);
  const latest = events[0];
  if (!latest) {
    // Fall back to cache so we don't flash an empty state on hiccups.
    return (
      getCachedProfileBadges(pubkey) ?? {
        aTags: [],
        eventIdByATag: {},
      }
    );
  }
  const parsed = parseProfileBadgesEvent(latest) ?? {
    aTags: [],
    eventIdByATag: {},
    eventId: latest.id,
    eventCreatedAt: latest.created_at,
  };
  setCachedProfileBadges(pubkey, parsed);
  return parsed;
}

/** Publishes a kind 30008 event wearing the given badges, in the given order. */
export async function publishProfileBadges(
  signer: UserSigner,
  worn: AwardedBadge[],
  relays: string[] = DEFAULT_BADGE_RELAYS,
  opts?: { signTimeoutMs?: number; publishTimeoutMs?: number },
): Promise<{
  signed: SignedEvent;
  relays: { relay: string; ok: boolean; error?: string }[];
}> {
  const { signTimeoutMs = 30_000, publishTimeoutMs = 8_000 } = opts ?? {};
  const tags: string[][] = [["d", PROFILE_BADGES_D]];
  for (const b of worn) {
    tags.push(["a", b.aTag]);
    tags.push(["e", b.awardId]);
  }

  const unsigned = {
    kind: 30008,
    pubkey: signer.pubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: "",
  };

  const signed = (await Promise.race([
    signer.signEvent(unsigned),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`Timeout: esperando firma (${signTimeoutMs}ms)`)),
        signTimeoutMs,
      ),
    ),
  ])) as SignedEvent;

  const { SimplePool } = await import("nostr-tools/pool");
  const pool = new SimplePool();
  const promises = pool.publish(relays, signed);
  const results = await Promise.all(
    promises.map(async (p, i) => {
      const relay = relays[i];
      try {
        await Promise.race([
          p,
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error(`Timeout: ${relay} (${publishTimeoutMs}ms)`)),
              publishTimeoutMs,
            ),
          ),
        ]);
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
  const ok = results.some((r) => r.ok);
  if (!ok) {
    throw new Error(
      `Ningún relay aceptó el evento.\n${results
        .map((r) => `${r.relay}: ${r.error ?? "sin respuesta"}`)
        .join("\n")}`,
    );
  }

  // Update cache so the UI reflects the new state immediately.
  const pb: ProfileBadges = {
    aTags: worn.map((b) => b.aTag),
    eventIdByATag: Object.fromEntries(worn.map((b) => [b.aTag, b.awardId])),
    eventId: signed.id,
    eventCreatedAt: signed.created_at,
  };
  setCachedProfileBadges(signer.pubkey, pb);

  return { signed, relays: results };
}

export function useProfileBadges(
  pubkey: string | null | undefined,
  relays?: string[],
) {
  const [data, setData] = useState<ProfileBadges | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!pubkey) {
      setData(null);
      return;
    }
    const cached = getCachedProfileBadges(pubkey);
    if (cached) setData(cached);
    let cancelled = false;
    setLoading(true);
    fetchProfileBadges(pubkey, relays)
      .then((fresh) => {
        if (cancelled) return;
        setData(fresh);
      })
      .catch(() => {
        /* background */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pubkey, relays?.join(",")]);

  function override(pb: ProfileBadges) {
    if (pubkey) setCachedProfileBadges(pubkey, pb);
    setData(pb);
  }

  return { profileBadges: data, loading, override };
}

export function useUserBadges(
  pubkey: string | null | undefined,
  relays?: string[],
) {
  const [badges, setBadges] = useState<AwardedBadge[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasCache, setHasCache] = useState(false);

  useEffect(() => {
    if (!pubkey) {
      setBadges([]);
      setHasCache(false);
      return;
    }
    const cached = getCache(pubkey);
    if (cached) {
      setBadges(cached.badges);
      setHasCache(true);
    } else {
      setBadges([]);
      setHasCache(false);
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchUserBadges(pubkey, relays)
      .then((fresh) => {
        if (cancelled) return;
        setBadges(fresh);
        setHasCache(true);
      })
      .catch((e) => {
        if (cancelled) return;
        console.warn("[labs:badges] fetch failed", e);
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pubkey, relays?.join(",")]);

  return { badges, loading, error, hasCache };
}
