"use client";

/**
 * Client side of the voting system: publish the user's ballot and live-stream
 * ballots / period flips from the relays. Server reads live in
 * `lib/votingCache.ts` — never import this module from server code.
 */

import { FAST_USER_RELAYS, DEFAULT_RELAYS } from "./nostrRelayConfig";
import type { SignedEvent, UserSigner } from "./nostrSigner";
import {
  VOTE_ENC,
  VOTE_T_TAG,
  VOTING_KIND,
  VOTING_SCHEMA_VERSION,
  dedupeBallots,
  parseBallotContent,
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
 * Signs and publishes the user's (replaceable) ballot, ENCRYPTED to La Crypta's
 * key (NIP-44) so the relay reveals nothing. `lacryptaPubkey` is the publisher
 * hex from /api/lacrypta-pubkeys. A plaintext `["votes", N]` tag carries the
 * declared total for the live "who voted + count" display — it is NOT trusted
 * for the result (the backend re-derives the count by decrypting at close).
 * `createdAtFloor` should be the previous ballot's created_at (NIP-01 keeps the
 * LOWEST id on ties, so we bump past it to guarantee replacement).
 */
export async function publishBallot(
  signer: UserSigner,
  hackathonId: string,
  allocations: Record<string, number>,
  lacryptaPubkey: string,
  createdAtFloor = 0,
): Promise<SignedEvent> {
  if (!lacryptaPubkey) {
    throw new Error("Falta la clave de La Crypta para cifrar el voto.");
  }
  const content: BallotContent = {
    version: VOTING_SCHEMA_VERSION,
    hackathonId,
    allocations,
  };
  const ciphertext = await signer.nip44Encrypt(
    lacryptaPubkey,
    JSON.stringify(content),
  );
  const totalAllocated = Object.values(allocations).reduce((s, n) => s + n, 0);
  const createdAt = Math.max(
    Math.floor(Date.now() / 1000),
    createdAtFloor + 1,
  );
  const signed = await signer.signEvent({
    kind: VOTING_KIND,
    pubkey: signer.pubkey,
    created_at: createdAt,
    content: ciphertext,
    tags: [
      ["d", voteDTag(hackathonId)],
      ["t", VOTE_T_TAG],
      ["h", hackathonId],
      ["enc", VOTE_ENC],
      ["votes", String(totalAllocated)],
      ["client", "La Crypta Dev"],
    ],
  });

  const results = await publishToRelays(signed, [...DEFAULT_RELAYS]);
  if (!results.some((r) => r.ok)) {
    throw new Error("Ningún relay aceptó tu voto. Probá de nuevo.");
  }
  return signed;
}

/** Declared vote total from a ballot's plaintext `["votes"]` tag (display only;
 *  untrusted — the authoritative count comes from decryption at close). */
export function claimedVotes(ev: SignedEvent): number {
  const raw = ev.tags.find((t) => t[0] === "votes")?.[1];
  const n = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * Decrypts the voter's OWN ballot so the editor can pre-fill it. The NIP-44
 * conversation key is symmetric (voterSecret↔lacryptaPubkey), so the voter
 * reads their own ballot without La Crypta's secret. v1 plaintext falls back.
 */
export async function decryptOwnBallot(
  signer: UserSigner,
  lacryptaPubkey: string,
  ballot: SignedEvent,
): Promise<Record<string, number> | null> {
  try {
    const enc = ballot.tags.find((t) => t[0] === "enc")?.[1];
    const plaintext =
      enc === VOTE_ENC
        ? await signer.nip44Decrypt(lacryptaPubkey, ballot.content)
        : ballot.content;
    return parseBallotContent(plaintext)?.allocations ?? null;
  } catch {
    return null;
  }
}

/**
 * One-shot fetch of every ballot for a hackathon, deduped latest-per-author —
 * the frozen set the admin posts to the backend for close-preview/confirm.
 */
export async function fetchAllBallotEvents(
  hackathonId: string,
  timeoutMs = 6000,
): Promise<SignedEvent[]> {
  const { SimplePool } = await import("nostr-tools/pool");
  const pool = new SimplePool();
  const dTag = voteDTag(hackathonId);
  const relays = [...DEFAULT_RELAYS];
  const events: SignedEvent[] = [];
  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    const closer = pool.subscribe(
      relays,
      { kinds: [VOTING_KIND], "#d": [dTag], limit: 1000 },
      {
        onevent(ev) {
          const event = ev as SignedEvent;
          if (event.tags.find((t) => t[0] === "d")?.[1] === dTag) {
            events.push(event);
          }
        },
        oneose() {
          finish();
        },
      },
    );
    setTimeout(() => {
      closer.close();
      finish();
    }, timeoutMs);
  });
  try {
    pool.close(relays);
  } catch {
    /* noop */
  }
  return dedupeBallots(events) as SignedEvent[];
}

/**
 * Live-subscribe to ballot events for a hackathon (historical + new), keeping
 * the relay subscription open until the returned cleanup function runs.
 * Eligibility/validity is NOT enforced here — callers run `tallyBallots`.
 */
export function subscribeToBallots(
  hackathonId: string,
  onEvent: (ev: SignedEvent) => void,
  onEose?: () => void,
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
          // Signal that the historical backlog has been delivered so callers
          // can tell "still loading" from "loaded, zero ballots".
          onEose?.();
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
