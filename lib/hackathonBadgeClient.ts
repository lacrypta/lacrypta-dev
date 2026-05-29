"use client";

import type { SignedEvent } from "./nostrSigner";
import { DEFAULT_BADGE_RELAYS } from "./nostrBadges";
import {
  HACKATHON_BADGE_CATALOG_KIND,
  hackathonBadgeCatalogDTag,
  parseHackathonBadgeCatalogEvent,
  type HackathonBadgeCatalogEvent,
} from "./hackathonBadges";
import { mergeDataRelays } from "./nostrRelayConfig";

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
  if (!res.ok || !data.adminPubkey || !data.publisherPubkey) {
    throw new Error(data.error || "No se pudo resolver pubkeys de La Crypta.");
  }
  return {
    adminPubkey: data.adminPubkey,
    publisherPubkey: data.publisherPubkey,
  };
}

export async function fetchHackathonBadgeCatalog(
  hackathonId: string,
  issuerPubkey: string,
  relays: string[] = DEFAULT_BADGE_RELAYS,
  timeoutMs = 5000,
): Promise<HackathonBadgeCatalogEvent | null> {
  if (!issuerPubkey) return null;
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
  signer: {
    pubkey: string;
    signEvent: (event: {
      kind: number;
      created_at: number;
      tags: string[][];
      content: string;
      pubkey?: string;
    }) => Promise<SignedEvent>;
  },
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
