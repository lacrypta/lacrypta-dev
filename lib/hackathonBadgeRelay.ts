import type { Filter } from "nostr-tools";
import type { SignedEvent } from "@/lib/nostrSigner";
import { DEFAULT_RELAYS, mergeDataRelays } from "@/lib/nostrRelayConfig";
import {
  HACKATHON_BADGE_CATALOG_KIND,
  HACKATHON_BADGE_DEFINITION_KIND,
  hackathonBadgeCatalogDTag,
  parseHackathonBadgeCatalogEvent,
  type HackathonBadgeCatalogEvent,
} from "@/lib/hackathonBadges";

export type BadgeDefinitionEvent = SignedEvent & {
  parsed: {
    d: string;
    name?: string;
    description?: string;
    image?: string;
    thumb?: string;
  };
};

export type BadgeAwardOwner = {
  pubkey: string;
  awardEvent: SignedEvent;
  name?: string;
  nip05?: string;
};

function eventTag(event: SignedEvent, name: string): string | undefined {
  return event.tags.find((tag) => tag[0] === name)?.[1];
}

function parseBadgeDefinitionATag(aTag: string): { issuer: string; d: string } | null {
  const parts = aTag.split(":");
  if (parts.length < 3 || parts[0] !== String(HACKATHON_BADGE_DEFINITION_KIND)) {
    return null;
  }
  const issuer = parts[1] ?? "";
  const d = parts.slice(2).join(":");
  if (!issuer || !d) return null;
  return { issuer, d };
}

function parseDefinitionEvent(event: SignedEvent): BadgeDefinitionEvent | null {
  if (event.kind !== HACKATHON_BADGE_DEFINITION_KIND) return null;
  const d = eventTag(event, "d");
  if (!d) return null;
  return {
    ...event,
    parsed: {
      d,
      name: eventTag(event, "name"),
      description: eventTag(event, "description"),
      image: eventTag(event, "image"),
      thumb: eventTag(event, "thumb"),
    },
  };
}

async function collectRelayEvents(
  filter: Filter,
  relays: string[] = DEFAULT_RELAYS,
  timeoutMs = 5000,
): Promise<SignedEvent[]> {
  const { SimplePool } = await import("nostr-tools/pool");
  const { verifyEvent } = await import("nostr-tools/pure");
  const pool = new SimplePool();
  const readRelays = mergeDataRelays(relays);
  const events: SignedEvent[] = [];
  const maxCreatedAt = Math.floor(Date.now() / 1000) + 10 * 60;
  const closer = pool.subscribe(readRelays, filter, {
    onevent(ev: SignedEvent) {
      if (!verifyEvent(ev) || ev.created_at > maxCreatedAt) {
        console.warn("[hackathonBadgeRelay] dropped invalid event", {
          id: ev.id,
          kind: ev.kind,
          pubkey: ev.pubkey,
        });
        return;
      }
      events.push(ev);
    },
  });

  try {
    await new Promise((resolve) => setTimeout(resolve, timeoutMs));
  } finally {
    closer.close();
    try {
      pool.close(readRelays);
    } catch {
      /* noop */
    }
  }

  return events;
}

export async function fetchHackathonBadgeCatalogFromRelays({
  hackathonId,
  issuerPubkey,
  relays = DEFAULT_RELAYS,
  timeoutMs = 5000,
}: {
  hackathonId: string;
  issuerPubkey: string;
  relays?: string[];
  timeoutMs?: number;
}): Promise<HackathonBadgeCatalogEvent | null> {
  if (!issuerPubkey) return null;
  const events = await collectRelayEvents(
    {
      kinds: [HACKATHON_BADGE_CATALOG_KIND],
      authors: [issuerPubkey],
      "#d": [hackathonBadgeCatalogDTag(hackathonId)],
    },
    relays,
    timeoutMs,
  );

  return (
    events
      .sort((a, b) => b.created_at - a.created_at)
      .map((event) => parseHackathonBadgeCatalogEvent(event))
      .find((event): event is HackathonBadgeCatalogEvent => Boolean(event)) ??
    null
  );
}

export async function fetchHackathonBadgeDefinitionsFromRelays(
  aTags: string[],
  relays: string[] = DEFAULT_RELAYS,
  timeoutMs = 4500,
): Promise<Record<string, BadgeDefinitionEvent>> {
  const wanted = new Map<string, { issuer: string; d: string }>();
  for (const aTag of aTags) {
    const parsed = parseBadgeDefinitionATag(aTag);
    if (parsed) wanted.set(aTag, parsed);
  }
  if (wanted.size === 0) return {};

  const authors = [...new Set([...wanted.values()].map((item) => item.issuer))];
  const dTags = [...new Set([...wanted.values()].map((item) => item.d))];
  const events = await collectRelayEvents(
    {
      kinds: [HACKATHON_BADGE_DEFINITION_KIND],
      authors,
      "#d": dTags,
    },
    relays,
    timeoutMs,
  );

  const latestByATag = new Map<string, BadgeDefinitionEvent>();
  const wantedKeys = new Set(wanted.keys());
  for (const event of events.sort((a, b) => b.created_at - a.created_at)) {
    const parsed = parseDefinitionEvent(event);
    if (!parsed) continue;
    const aTag = `${HACKATHON_BADGE_DEFINITION_KIND}:${parsed.pubkey}:${parsed.parsed.d}`;
    if (!wantedKeys.has(aTag) || latestByATag.has(aTag)) continue;
    latestByATag.set(aTag, parsed);
  }

  return Object.fromEntries(latestByATag);
}

export async function fetchHackathonBadgeAwardOwnersFromRelays(
  aTag: string,
  issuerPubkey?: string,
  relays: string[] = DEFAULT_RELAYS,
  timeoutMs = 5000,
): Promise<BadgeAwardOwner[]> {
  const filter: {
    kinds: number[];
    "#a": string[];
    authors?: string[];
  } = { kinds: [8], "#a": [aTag] };
  if (issuerPubkey) filter.authors = [issuerPubkey];

  const events = await collectRelayEvents(filter, relays, timeoutMs);
  const byPubkey = new Map<string, BadgeAwardOwner>();
  for (const event of events.sort((a, b) => b.created_at - a.created_at)) {
    const pubkey = eventTag(event, "p");
    if (!pubkey || byPubkey.has(pubkey)) continue;
    byPubkey.set(pubkey, {
      pubkey,
      awardEvent: event,
      name: eventTag(event, "name"),
      nip05: eventTag(event, "nip05"),
    });
  }
  return [...byPubkey.values()];
}
