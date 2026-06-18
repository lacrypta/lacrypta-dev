"use client";

import type { SignedEvent } from "./nostrSigner";
import { DEFAULT_BADGE_RELAYS } from "./nostrBadges";
import {
  HACKATHON_BADGE_CATALOG_KIND,
  HACKATHON_BADGE_DEFINITION_KIND,
  hackathonBadgeCatalogDTag,
  normalizeHackathonBadgeTemplate,
  parseHackathonBadgeCatalogEvent,
  type HackathonBadgeCatalog,
  type HackathonBadgeCatalogBadge,
  type HackathonBadgeCategory,
  type HackathonBadgeCatalogEvent,
  type HackathonBadgeTemplate,
} from "./hackathonBadges";
import { mergeDataRelays } from "./nostrRelayConfig";

type BadgeRequestSigner = {
  pubkey: string;
  signEvent: (event: {
    kind: number;
    created_at: number;
    tags: string[][];
    content: string;
    pubkey?: string;
  }) => Promise<SignedEvent>;
};

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

export type BadgeSoldierOption = {
  id: string;
  slug: string;
  name: string;
  github?: string;
  pubkey?: string;
  nip05?: string;
  picture?: string;
  hasNostr: boolean;
  score: number;
};

export type BadgeAwardRecipient = {
  pubkey: string;
  name?: string;
  nip05?: string;
};

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

function eventTag(event: SignedEvent, name: string): string | undefined {
  return event.tags.find((tag) => tag[0] === name)?.[1];
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

export async function fetchLacryptaBadgePubkeys(): Promise<{
  adminPubkey: string;
  publisherPubkey: string;
}> {
  const res = await fetch("/api/lacrypta-pubkeys");
  const data = (await res.json()) as {
    adminPubkey?: string;
    publisherPubkey?: string;
    error?: string;
  };
  if (!res.ok || !data.adminPubkey) {
    throw new Error(data.error || "No se pudo resolver pubkeys de La Crypta.");
  }
  return {
    adminPubkey: data.adminPubkey,
    publisherPubkey: data.publisherPubkey ?? "",
  };
}

export async function fetchHackathonBadgeCatalog(
  hackathonId: string,
  issuerPubkey: string,
  relays: string[] = DEFAULT_BADGE_RELAYS,
  timeoutMs = 5000,
): Promise<HackathonBadgeCatalogEvent | null> {
  if (!issuerPubkey) return null;
  if (typeof window !== "undefined") {
    const params = new URLSearchParams({ hackathonId });
    const res = await fetch(`/api/hackathon-badges/catalog?${params}`, {
      cache: "no-store",
    });
    const data = (await res.json()) as {
      catalogEvent?: HackathonBadgeCatalogEvent | null;
      error?: string;
    };
    if (!res.ok) {
      throw new Error(data.error || "No se pudo buscar catalogo de badges.");
    }
    return data.catalogEvent ?? null;
  }

  const { SimplePool } = await import("nostr-tools/pool");
  const pool = new SimplePool();
  const events: SignedEvent[] = [];
  const dTag = hackathonBadgeCatalogDTag(hackathonId);
  const readRelays = mergeDataRelays(relays);

  const closer = pool.subscribe(
    readRelays,
    {
      kinds: [HACKATHON_BADGE_CATALOG_KIND],
      authors: [issuerPubkey],
      "#d": [dTag],
    },
    {
      onevent(ev: SignedEvent) {
        events.push(ev);
      },
      oneose() {
        closer.close();
      },
    },
  );

  await new Promise((resolve) => setTimeout(resolve, timeoutMs));
  closer.close();
  try {
    pool.close(readRelays);
  } catch {
    /* noop */
  }

  const parsed = events
    .sort((a, b) => b.created_at - a.created_at)
    .map((event) => parseHackathonBadgeCatalogEvent(event))
    .find((event): event is HackathonBadgeCatalogEvent => Boolean(event));

  return parsed ?? null;
}

export async function fetchHackathonBadgeDefinition(
  aTag: string,
  relays: string[] = DEFAULT_BADGE_RELAYS,
  timeoutMs = 4500,
): Promise<BadgeDefinitionEvent | null> {
  if (typeof window !== "undefined") {
    const definitions = await fetchHackathonBadgeDefinitions([aTag]);
    return definitions[aTag] ?? null;
  }

  const parsed = parseBadgeDefinitionATag(aTag);
  if (!parsed) return null;
  const { SimplePool } = await import("nostr-tools/pool");
  const pool = new SimplePool();
  const events: SignedEvent[] = [];
  const readRelays = mergeDataRelays(relays);

  const closer = pool.subscribe(
    readRelays,
    {
      kinds: [HACKATHON_BADGE_DEFINITION_KIND],
      authors: [parsed.issuer],
      "#d": [parsed.d],
    },
    {
      onevent(ev: SignedEvent) {
        events.push(ev);
      },
      oneose() {
        closer.close();
      },
    },
  );

  await new Promise((resolve) => setTimeout(resolve, timeoutMs));
  closer.close();
  try {
    pool.close(readRelays);
  } catch {
    /* noop */
  }

  return (
    events
      .sort((a, b) => b.created_at - a.created_at)
      .map(parseDefinitionEvent)
      .find((event): event is BadgeDefinitionEvent => Boolean(event)) ?? null
  );
}

export async function fetchHackathonBadgeDefinitions(
  aTags: string[],
  relays: string[] = DEFAULT_BADGE_RELAYS,
  timeoutMs = 4500,
): Promise<Record<string, BadgeDefinitionEvent>> {
  if (typeof window !== "undefined") {
    const res = await fetch("/api/hackathon-badges/definitions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ aTags }),
    });
    const data = (await res.json()) as {
      definitions?: Record<string, BadgeDefinitionEvent>;
      error?: string;
    };
    if (!res.ok) {
      throw new Error(data.error || "No se pudieron buscar definiciones.");
    }
    return data.definitions ?? {};
  }

  const wanted = new Map<string, { issuer: string; d: string }>();
  for (const aTag of aTags) {
    const parsed = parseBadgeDefinitionATag(aTag);
    if (!parsed) continue;
    wanted.set(aTag, parsed);
  }
  if (wanted.size === 0) return {};

  const authors = [...new Set([...wanted.values()].map((item) => item.issuer))];
  const dTags = [...new Set([...wanted.values()].map((item) => item.d))];
  const { SimplePool } = await import("nostr-tools/pool");
  const pool = new SimplePool();
  const events: SignedEvent[] = [];
  const readRelays = mergeDataRelays(relays);

  const closer = pool.subscribe(
    readRelays,
    {
      kinds: [HACKATHON_BADGE_DEFINITION_KIND],
      authors,
      "#d": dTags,
    },
    {
      onevent(ev: SignedEvent) {
        events.push(ev);
      },
      oneose() {
        closer.close();
      },
    },
  );

  await new Promise((resolve) => setTimeout(resolve, timeoutMs));
  closer.close();
  try {
    pool.close(readRelays);
  } catch {
    /* noop */
  }

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

export async function fetchHackathonBadgeAwardOwners(
  aTag: string,
  issuerPubkey?: string,
  relays: string[] = DEFAULT_BADGE_RELAYS,
  timeoutMs = 5000,
): Promise<BadgeAwardOwner[]> {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams({ aTag });
    if (issuerPubkey) params.set("issuer", issuerPubkey);
    const res = await fetch(`/api/hackathon-badges/owners?${params}`, {
      cache: "no-store",
    });
    const data = (await res.json()) as {
      owners?: BadgeAwardOwner[];
      error?: string;
    };
    if (!res.ok) {
      throw new Error(data.error || "No se pudieron buscar owners.");
    }
    return data.owners ?? [];
  }

  const { SimplePool } = await import("nostr-tools/pool");
  const pool = new SimplePool();
  const events: SignedEvent[] = [];
  const readRelays = mergeDataRelays(relays);

  const filter: {
    kinds: number[];
    "#a": string[];
    authors?: string[];
  } = { kinds: [8], "#a": [aTag] };
  if (issuerPubkey) filter.authors = [issuerPubkey];

  const closer = pool.subscribe(readRelays, filter, {
    onevent(ev: SignedEvent) {
      events.push(ev);
    },
    oneose() {
      closer.close();
    },
  });

  await new Promise((resolve) => setTimeout(resolve, timeoutMs));
  closer.close();
  try {
    pool.close(readRelays);
  } catch {
    /* noop */
  }

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

export async function fetchBadgeSoldiers(): Promise<BadgeSoldierOption[]> {
  const res = await fetch("/api/soldiers", { cache: "no-store" });
  const data = (await res.json()) as {
    soldiers?: BadgeSoldierOption[];
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || "No se pudieron cargar soldados.");
  }
  return (data.soldiers ?? []).filter((soldier) => soldier.pubkey);
}

export async function refreshHackathonBadgeCache({
  hackathonId,
  aTags = [],
  issuerPubkey,
  catalog = false,
  definitions = false,
  owners = false,
}: {
  hackathonId?: string;
  aTags?: string[];
  issuerPubkey?: string;
  catalog?: boolean;
  definitions?: boolean;
  owners?: boolean;
}): Promise<void> {
  const scopes: string[] = [];
  if (catalog) scopes.push("hackathon-badges");
  if (definitions) scopes.push("hackathon-badge-definitions");
  if (owners) scopes.push("hackathon-badge-owners");
  if (scopes.length === 0) return;

  const res = await fetch("/api/nostr/refresh", {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      scopes,
      hackathonId,
      issuerPubkey,
      aTags,
      blocking: true,
    }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "No se pudo refrescar cache Nostr.");
  }
}

export async function publishSignedEventsToRelays(
  events: SignedEvent[],
  relays: string[] = DEFAULT_BADGE_RELAYS,
  timeoutMs = 8000,
): Promise<Array<{ relay: string; ok: boolean; error?: string }>> {
  const { SimplePool } = await import("nostr-tools/pool");
  const pool = new SimplePool();
  const publishRelays = mergeDataRelays(relays);
  const byRelay = new Map<string, { relay: string; ok: boolean; error?: string }>();

  await Promise.all(
    publishRelays.map(async (relay) => {
      try {
        for (const event of events) {
          const [published] = pool.publish([relay], event);
          await Promise.race([
            published,
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error(`Timeout publicando en ${relay}`)),
                timeoutMs,
              ),
            ),
          ]);
        }
        byRelay.set(relay, { relay, ok: true });
      } catch (error) {
        byRelay.set(relay, {
          relay,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  );

  try {
    pool.close(publishRelays);
  } catch {
    /* noop */
  }

  return publishRelays.map(
    (relay) => byRelay.get(relay) ?? { relay, ok: false, error: "Sin respuesta" },
  );
}

export async function requestBadgeBootstrap(
  hackathonId: string,
  signer: BadgeRequestSigner,
): Promise<{ events: SignedEvent[]; publisherPubkey: string }> {
  const request = await signer.signEvent({
    kind: 27235,
    pubkey: signer.pubkey,
    created_at: Math.floor(Date.now() / 1000),
    content: `Bootstrap badges for ${hackathonId}`,
    tags: [
      ["u", "/api/hackathon-badges/bootstrap"],
      ["method", "POST"],
      ["action", "bootstrap-hackathon-badges"],
      ["hackathon", hackathonId],
    ],
  });

  const res = await fetch("/api/hackathon-badges/bootstrap", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hackathonId, request }),
  });
  const data = (await res.json()) as {
    events?: SignedEvent[];
    issuerPubkey?: string;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || "No se pudo generar el bootstrap.");
  }
  if (!data.events?.length) {
    throw new Error("El backend no devolvio eventos firmados.");
  }

  return {
    events: data.events,
    publisherPubkey: data.issuerPubkey ?? "",
  };
}

export async function requestBadgeCreate({
  hackathonId,
  signer,
  badges,
  categories,
}: {
  hackathonId: string;
  signer: BadgeRequestSigner;
  badges: HackathonBadgeTemplate[];
  categories?: HackathonBadgeCategory[];
}): Promise<{
  events: SignedEvent[];
  publisherPubkey: string;
  catalog?: HackathonBadgeCatalog;
}> {
  const normalizedBadges = badges.map(normalizeHackathonBadgeTemplate);
  const request = await signer.signEvent({
    kind: 27235,
    pubkey: signer.pubkey,
    created_at: Math.floor(Date.now() / 1000),
    content: `Create ${normalizedBadges.length} badges for ${hackathonId}`,
    tags: [
      ["u", "/api/hackathon-badges/create"],
      ["method", "POST"],
      ["action", "create-hackathon-badges"],
      ["hackathon", hackathonId],
      ...normalizedBadges.flatMap((badge) => [
        ["badge", badge.id],
        ["category", badge.category],
      ]),
    ],
  });

  const res = await fetch("/api/hackathon-badges/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      hackathonId,
      request,
      badges: normalizedBadges,
      categories,
    }),
  });
  const data = (await res.json()) as {
    events?: SignedEvent[];
    issuerPubkey?: string;
    catalog?: HackathonBadgeCatalog;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || "No se pudieron crear los badges.");
  }
  if (!data.events?.length) {
    throw new Error("El backend no devolvio eventos firmados.");
  }

  return {
    events: data.events,
    publisherPubkey: data.issuerPubkey ?? "",
    catalog: data.catalog,
  };
}

export async function requestBadgeAward({
  hackathonId,
  signer,
  badge,
  recipients,
}: {
  hackathonId: string;
  signer: BadgeRequestSigner;
  badge: HackathonBadgeCatalogBadge;
  recipients: BadgeAwardRecipient[];
}): Promise<{ events: SignedEvent[]; publisherPubkey: string }> {
  const uniqueRecipients = [
    ...new Map(
      recipients
        .filter((recipient) => recipient.pubkey)
        .map((recipient) => [
          recipient.pubkey,
          {
            pubkey: recipient.pubkey,
            name: recipient.name?.trim() || undefined,
            nip05: recipient.nip05?.trim().toLowerCase() || undefined,
          },
        ]),
    ).values(),
  ];
  const { adminPubkey } = await fetchLacryptaBadgePubkeys();
  if (signer.pubkey !== adminPubkey) {
    throw new Error("Solo el admin puede entregar badges.");
  }
  const request = await signer.signEvent({
    kind: 27235,
    pubkey: signer.pubkey,
    created_at: Math.floor(Date.now() / 1000),
    content: `Award ${badge.id} to ${uniqueRecipients.length} users`,
    tags: [
      ["u", "/api/hackathon-badges/award"],
      ["method", "POST"],
      ["action", "award-hackathon-badge"],
      ["hackathon", hackathonId],
      ["badge", badge.id],
      ["a", badge.definition],
      ...uniqueRecipients.map((recipient) => ["p", recipient.pubkey]),
    ],
  });

  const res = await fetch("/api/hackathon-badges/award", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      hackathonId,
      request,
      badge,
      recipients: uniqueRecipients,
    }),
  });
  const data = (await res.json()) as {
    events?: SignedEvent[];
    issuerPubkey?: string;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || "No se pudo otorgar el badge.");
  }
  if (!data.events?.length) {
    throw new Error("El backend no devolvio awards firmados.");
  }
  return {
    events: data.events,
    publisherPubkey: data.issuerPubkey ?? "",
  };
}
