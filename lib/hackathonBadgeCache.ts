import { cacheLife, cacheTag } from "next/cache";
import { DEFAULT_RELAYS } from "./nostrRelayConfig";
import {
  fetchHackathonBadgeAwardOwnersFromRelays,
  fetchHackathonBadgeCatalogFromRelays,
  fetchHackathonBadgeDefinitionsFromRelays,
  type BadgeAwardOwner,
  type BadgeDefinitionEvent,
} from "./hackathonBadgeRelay";
import type { HackathonBadgeCatalogEvent } from "./hackathonBadges";
import {
  nostrHackathonBadgeDefinitionTag,
  nostrHackathonBadgeOwnersTag,
  nostrHackathonBadgesTag,
} from "./nostrCacheTags";
import type { SignedEvent } from "./nostrSigner";

export type CachedHackathonBadgeCatalogSnapshot = {
  hackathonId: string;
  publisherPubkey: string;
  catalogEvent: HackathonBadgeCatalogEvent | null;
  generatedAt: string;
  relays: string[];
};

export type CachedHackathonBadgeDefinitionsSnapshot = {
  definitions: Record<string, BadgeDefinitionEvent>;
  generatedAt: string;
  relays: string[];
};

export type CachedHackathonBadgeOwnersSnapshot = {
  aTag: string;
  issuerPubkey?: string;
  owners: BadgeAwardOwner[];
  generatedAt: string;
  relays: string[];
};

async function publisherPubkeyFromNsec(): Promise<string> {
  const nsec = process.env.LACRYPTA_NSEC;
  if (!nsec) throw new Error("Falta LACRYPTA_NSEC.");
  const { decode } = await import("nostr-tools/nip19");
  const { getPublicKey } = await import("nostr-tools/pure");
  const decoded = decode(nsec);
  if (decoded.type !== "nsec") throw new Error("LACRYPTA_NSEC invalido.");
  return getPublicKey(decoded.data as Uint8Array);
}

function plainEvent(event: SignedEvent): SignedEvent {
  return {
    id: event.id,
    pubkey: event.pubkey,
    created_at: event.created_at,
    kind: event.kind,
    tags: event.tags.map((tag) => [...tag]),
    content: event.content,
    sig: event.sig,
  };
}

function plainCatalogEvent(
  catalogEvent: HackathonBadgeCatalogEvent | null,
): HackathonBadgeCatalogEvent | null {
  if (!catalogEvent) return null;
  return {
    event: plainEvent(catalogEvent.event),
    catalog: catalogEvent.catalog,
  };
}

function plainDefinitionEvent(
  definition: BadgeDefinitionEvent,
): BadgeDefinitionEvent {
  return {
    ...plainEvent(definition),
    parsed: { ...definition.parsed },
  };
}

function plainDefinitionEvents(
  definitions: Record<string, BadgeDefinitionEvent>,
): Record<string, BadgeDefinitionEvent> {
  return Object.fromEntries(
    Object.entries(definitions).map(([aTag, definition]) => [
      aTag,
      plainDefinitionEvent(definition),
    ]),
  );
}

function plainAwardOwner(owner: BadgeAwardOwner): BadgeAwardOwner {
  return {
    ...owner,
    awardEvent: plainEvent(owner.awardEvent),
  };
}

export async function getCachedHackathonBadgeCatalogSnapshot(
  hackathonId: string,
): Promise<CachedHackathonBadgeCatalogSnapshot> {
  "use cache";
  cacheLife("hours");
  cacheTag(nostrHackathonBadgesTag(hackathonId));

  const publisherPubkey = await publisherPubkeyFromNsec();
  try {
    return {
      hackathonId,
      publisherPubkey,
      catalogEvent: plainCatalogEvent(
        await fetchHackathonBadgeCatalogFromRelays({
          hackathonId,
          issuerPubkey: publisherPubkey,
        }),
      ),
      generatedAt: new Date().toISOString(),
      relays: DEFAULT_RELAYS,
    };
  } catch {
    return {
      hackathonId,
      publisherPubkey,
      catalogEvent: null,
      generatedAt: new Date().toISOString(),
      relays: DEFAULT_RELAYS,
    };
  }
}

export async function getCachedHackathonBadgeDefinitionsSnapshot(
  aTags: string[],
): Promise<CachedHackathonBadgeDefinitionsSnapshot> {
  "use cache";
  cacheLife("hours");
  const cleanATags = [...new Set(aTags.map((tag) => tag.trim()).filter(Boolean))];
  if (cleanATags.length > 0) {
    cacheTag(...cleanATags.map(nostrHackathonBadgeDefinitionTag));
  }

  try {
    return {
      definitions: plainDefinitionEvents(
        await fetchHackathonBadgeDefinitionsFromRelays(cleanATags),
      ),
      generatedAt: new Date().toISOString(),
      relays: DEFAULT_RELAYS,
    };
  } catch {
    return {
      definitions: {},
      generatedAt: new Date().toISOString(),
      relays: DEFAULT_RELAYS,
    };
  }
}

export async function getCachedHackathonBadgeOwnersSnapshot(
  aTag: string,
  issuerPubkey?: string,
): Promise<CachedHackathonBadgeOwnersSnapshot> {
  "use cache";
  cacheLife("hours");
  cacheTag(nostrHackathonBadgeOwnersTag(aTag));

  try {
    return {
      aTag,
      issuerPubkey,
      owners: (
        await fetchHackathonBadgeAwardOwnersFromRelays(aTag, issuerPubkey)
      ).map(plainAwardOwner),
      generatedAt: new Date().toISOString(),
      relays: DEFAULT_RELAYS,
    };
  } catch {
    return {
      aTag,
      issuerPubkey,
      owners: [],
      generatedAt: new Date().toISOString(),
      relays: DEFAULT_RELAYS,
    };
  }
}
