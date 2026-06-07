import { cacheLife, cacheTag } from "next/cache";
import { DEFAULT_RELAYS } from "./nostrRelayConfig";
import { nostrBadgesTag } from "./nostrCacheTags";

const PROFILE_BADGES_D = "profile_badges";

export type BadgeDefinition = {
  issuer: string;
  d: string;
  name?: string;
  description?: string;
  image?: string;
  thumb?: string;
};

export type AwardedBadge = {
  awardId: string;
  issuer: string;
  aTag: string;
  awardedAt: number;
  definition?: BadgeDefinition;
};

export type ProfileBadges = {
  aTags: string[];
  eventIdByATag: Record<string, string>;
  eventId?: string;
  eventCreatedAt?: number;
};

export type CachedBadgesSnapshot = {
  pubkey: string;
  badges: AwardedBadge[];
  profileBadges: ProfileBadges;
  generatedAt: string;
  relays: string[];
};

type IncomingEvent = {
  id: string;
  pubkey: string;
  kind: number;
  content: string;
  tags: string[][];
  created_at: number;
};

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

function parseProfileBadgesEvent(ev: IncomingEvent): ProfileBadges | null {
  if (ev.kind !== 30008) return null;
  const d = ev.tags.find((t) => t[0] === "d")?.[1];
  if (d !== PROFILE_BADGES_D) return null;
  const aTags: string[] = [];
  const eventIdByATag: Record<string, string> = {};
  for (let i = 0; i < ev.tags.length; i++) {
    const tag = ev.tags[i];
    if (tag[0] !== "a" || !tag[1]) continue;
    const aVal = tag[1];
    aTags.push(aVal);
    const next = ev.tags[i + 1];
    if (next?.[0] === "e" && next[1]) eventIdByATag[aVal] = next[1];
  }
  return {
    aTags,
    eventIdByATag,
    eventId: ev.id,
    eventCreatedAt: ev.created_at,
  };
}

async function rawFetchBadges(
  pubkey: string,
  timeoutMs = 4500,
): Promise<CachedBadgesSnapshot> {
  const { SimplePool } = await import("nostr-tools/pool");
  const pool = new SimplePool();
  const relays = DEFAULT_RELAYS;
  const awards: IncomingEvent[] = [];
  const profileBadgeEvents: IncomingEvent[] = [];

  const awardCloser = pool.subscribe(
    relays,
    { kinds: [8], "#p": [pubkey] },
    {
      onevent(ev: IncomingEvent) {
        awards.push(ev);
      },
      oneose() {
        /* timeout-driven */
      },
    },
  );

  const profileCloser = pool.subscribe(
    relays,
    { kinds: [30008], authors: [pubkey], "#d": [PROFILE_BADGES_D] },
    {
      onevent(ev: IncomingEvent) {
        profileBadgeEvents.push(ev);
      },
      oneose() {
        /* timeout-driven */
      },
    },
  );

  await new Promise((r) => setTimeout(r, timeoutMs));
  try {
    awardCloser.close();
    profileCloser.close();
  } catch {
    /* noop */
  }

  const needed = new Map<string, { issuer: string; d: string }>();
  const awardMeta: {
    event: IncomingEvent;
    aTag: string;
    key: { issuer: string; d: string };
  }[] = [];
  for (const ev of awards) {
    const aTag = ev.tags.find((t) => t[0] === "a")?.[1];
    if (!aTag) continue;
    const parts = aTag.split(":");
    if (parts.length < 3 || parts[0] !== "30009") continue;
    const key = { issuer: parts[1], d: parts.slice(2).join(":") };
    needed.set(`${key.issuer}|${key.d}`, key);
    awardMeta.push({ event: ev, aTag, key });
  }

  const definitions = new Map<string, BadgeDefinition>();
  if (needed.size > 0) {
    const issuers = [...new Set([...needed.values()].map((k) => k.issuer))];
    const ds = [...new Set([...needed.values()].map((k) => k.d))];
    const defCloser = pool.subscribe(
      relays,
      { kinds: [30009], authors: issuers, "#d": ds },
      {
        onevent(ev: IncomingEvent) {
          const def = parseDefinitionEvent(ev);
          if (def) definitions.set(`${def.issuer}|${def.d}`, def);
        },
        oneose() {
          /* timeout-driven */
        },
      },
    );
    await new Promise((r) => setTimeout(r, timeoutMs));
    try {
      defCloser.close();
    } catch {
      /* noop */
    }
  }

  try {
    pool.close(relays);
  } catch {
    /* noop */
  }

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
      definition: definitions.get(mapKey),
    });
  }

  profileBadgeEvents.sort((a, b) => b.created_at - a.created_at);
  const profileBadges =
    (profileBadgeEvents[0] && parseProfileBadgesEvent(profileBadgeEvents[0])) ??
    {
      aTags: [],
      eventIdByATag: {},
    };

  return {
    pubkey,
    badges: [...byBadge.values()]
      .filter((badge) => badge.definition)
      .sort((a, b) => b.awardedAt - a.awardedAt),
    profileBadges,
    generatedAt: new Date().toISOString(),
    relays,
  };
}

export async function getCachedBadgesSnapshot(
  pubkey: string,
): Promise<CachedBadgesSnapshot> {
  "use cache";
  cacheLife("hours");
  cacheTag(nostrBadgesTag(pubkey));
  try {
    return await rawFetchBadges(pubkey);
  } catch {
    return {
      pubkey,
      badges: [],
      profileBadges: { aTags: [], eventIdByATag: {} },
      generatedAt: new Date().toISOString(),
      relays: DEFAULT_RELAYS,
    };
  }
}
