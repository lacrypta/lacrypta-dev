"use client";

/**
 * Client side of the voting system: publish the user's ballot and live-stream
 * ballots / period flips from the relays. Server reads live in
 * `lib/votingCache.ts` — never import this module from server code.
 */

import { FAST_USER_RELAYS, DEFAULT_RELAYS } from "./nostrRelayConfig";
import type { SignedEvent, UserSigner } from "./nostrSigner";
import {
  VOTE_T_TAG,
  VOTING_KIND,
  VOTING_SCHEMA_VERSION,
  parseVotingPeriod,
  voteDTag,
  votingPeriodDTag,
  type BallotContent,
  type VotingPeriod,
} from "./voting";

async function publishToRelays(
  signed: SignedEvent,
  relays: string[],
  perRelayTimeoutMs = 8000,
): Promise<{ relay: string; ok: boolean }[]> {
  const { SimplePool } = await import("nostr-tools/pool");
  const pool = new SimplePool();
  const promises = pool.publish(relays, signed);
  const results = await Promise.all(
    relays.map(async (relay, i) => {
      try {
        await Promise.race([
          promises[i],
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), perRelayTimeoutMs),
          ),
        ]);
        return { relay, ok: true };
      } catch {
        return { relay, ok: false };
      }
    }),
  );
  try {
    pool.close(relays);
  } catch {
    /* noop */
  }
  return results;
}

/**
 * Signs and publishes the user's (replaceable) ballot. `createdAtFloor` should
 * be the created_at of the user's previous ballot, if any — NIP-01 keeps the
 * LOWEST id on created_at ties, so we bump past it to guarantee replacement.
 */
export async function publishBallot(
  signer: UserSigner,
  hackathonId: string,
  allocations: Record<string, number>,
  createdAtFloor = 0,
): Promise<SignedEvent> {
  const content: BallotContent = {
    version: VOTING_SCHEMA_VERSION,
    hackathonId,
    allocations,
  };
  const createdAt = Math.max(
    Math.floor(Date.now() / 1000),
    createdAtFloor + 1,
  );
  const signed = await signer.signEvent({
    kind: VOTING_KIND,
    pubkey: signer.pubkey,
    created_at: createdAt,
    content: JSON.stringify(content),
    tags: [
      ["d", voteDTag(hackathonId)],
      ["t", VOTE_T_TAG],
      ["h", hackathonId],
      ["client", "La Crypta Dev"],
    ],
  });

  const results = await publishToRelays(signed, [...DEFAULT_RELAYS]);
  if (!results.some((r) => r.ok)) {
    throw new Error("Ningún relay aceptó tu voto. Probá de nuevo.");
  }
  return signed;
}

/**
 * Live-subscribe to ballot events for a hackathon (historical + new), keeping
 * the relay subscription open until the returned cleanup function runs.
 * Eligibility/validity is NOT enforced here — callers run `tallyBallots`.
 */
export function subscribeToBallots(
  hackathonId: string,
  onEvent: (ev: SignedEvent) => void,
): () => void {
  let closed = false;
  let teardown: (() => void) | null = null;
  const dTag = voteDTag(hackathonId);
  const relays = [...FAST_USER_RELAYS];

  void (async () => {
    const { SimplePool } = await import("nostr-tools/pool");
    if (closed) return;
    const pool = new SimplePool();
    const closer = pool.subscribe(
      relays,
      {
        kinds: [VOTING_KIND],
        "#d": [dTag],
        limit: 500,
      },
      {
        onevent(ev) {
          const event = ev as SignedEvent;
          // Relay-side `#d` filtering is not universal — re-check the tag.
          const d = event.tags.find((t) => t[0] === "d")?.[1];
          if (d !== dTag) return;
          onEvent(event);
        },
        oneose() {
          // Keep the subscription open for live ballots — do not close here.
        },
      },
    );
    teardown = () => {
      closer.close();
      try {
        pool.close(relays);
      } catch {
        /* noop */
      }
    };
    if (closed) teardown();
  })();

  return () => {
    closed = true;
    teardown?.();
  };
}

/**
 * Live-subscribe to the voting period event published by La Crypta. Calls
 * `onPeriod` with the freshest valid period whenever one arrives, so open and
 * close flips reach every viewer without a page reload.
 */
export function subscribeToVotingPeriod(
  hackathonId: string,
  publisherPubkey: string,
  onPeriod: (period: VotingPeriod, eventCreatedAt: number) => void,
): () => void {
  let closed = false;
  let teardown: (() => void) | null = null;
  let freshest = 0;
  const dTag = votingPeriodDTag(hackathonId);
  const relays = [...FAST_USER_RELAYS];

  void (async () => {
    const { SimplePool } = await import("nostr-tools/pool");
    if (closed) return;
    const pool = new SimplePool();
    const closer = pool.subscribe(
      relays,
      {
        kinds: [VOTING_KIND],
        authors: [publisherPubkey],
        "#d": [dTag],
      },
      {
        onevent(ev) {
          const event = ev as SignedEvent;
          const d = event.tags.find((t) => t[0] === "d")?.[1];
          if (d !== dTag) return;
          if (event.pubkey !== publisherPubkey) return;
          if (event.created_at <= freshest) return;
          const period = parseVotingPeriod(event.content);
          if (!period || period.hackathonId !== hackathonId) return;
          freshest = event.created_at;
          onPeriod(period, event.created_at);
        },
        oneose() {
          // Keep open for live open/close flips.
        },
      },
    );
    teardown = () => {
      closer.close();
      try {
        pool.close(relays);
      } catch {
        /* noop */
      }
    };
    if (closed) teardown();
  })();

  return () => {
    closed = true;
    teardown?.();
  };
}
