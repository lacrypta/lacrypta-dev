"use client";

/**
 * Read/seen state persisted in a NIP-78 (kind 30078) replaceable event, mirrored
 * to localStorage for instant paint. The local mirror is authoritative for the
 * current device; the Nostr event is the cross-device sync layer.
 *
 * Content is NIP-44 self-encrypted best-effort (`nip44Encrypt(self, json)`), with
 * a plaintext fallback when the signer can't NIP-44. On read we try to decrypt,
 * then fall back to `JSON.parse` so a signer mismatch never blocks the bell.
 */
import {
  emptyReadState,
  mergeReadState,
  nowSec,
  pruneReadState,
} from "./logic";
import type { NotificationType, ReadState } from "./types";
import { DEFAULT_RELAYS, mergeDataRelays } from "../nostrRelayConfig";
import { publishSignedEventsToRelays } from "../hackathonBadgeClient";
import type { SignedEvent, UserSigner } from "../nostrSigner";

export const READ_STATE_KIND = 30078;
export const READ_STATE_D = "lacrypta.dev:notifications:state";
export const READ_STATE_TAG = "lacrypta-dev-notifications-state";

const CACHE_PREFIX = "labs:notifications:state:v1:";
const CHANGED_EVENT = "labs:notifications:changed";

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

/** Validate + normalize an untrusted object into a ReadState, or null. */
export function coerceReadState(raw: unknown): ReadState | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const installedAt = Number(r.installedAt);
  const lastReadAt = Number(r.lastReadAt);
  if (!Number.isFinite(installedAt) || !Number.isFinite(lastReadAt)) return null;
  return {
    version: 1,
    installedAt: Math.max(0, Math.floor(installedAt)),
    lastReadAt: Math.max(0, Math.floor(lastReadAt)),
    readIds: stringArray(r.readIds),
    dismissedIds: stringArray(r.dismissedIds),
    mutedTypes: stringArray(r.mutedTypes) as NotificationType[],
  };
}

export function getCachedReadState(pubkey: string): ReadState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + pubkey);
    return raw ? coerceReadState(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function setCachedReadState(pubkey: string, state: ReadState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_PREFIX + pubkey, JSON.stringify(state));
    window.dispatchEvent(
      new CustomEvent(CHANGED_EVENT, { detail: { pubkey } }),
    );
  } catch {
    /* quota — non-fatal */
  }
}

/** Get the device's read-state, creating (and persisting) a fresh floor if none. */
export function getOrCreateReadState(pubkey: string): ReadState {
  const existing = getCachedReadState(pubkey);
  if (existing) return existing;
  const fresh = emptyReadState(nowSec());
  setCachedReadState(pubkey, fresh);
  return fresh;
}

export function onReadStateChanged(
  listener: (pubkey: string) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => {
    const pk = (e as CustomEvent<{ pubkey?: string }>).detail?.pubkey;
    if (pk) listener(pk);
  };
  window.addEventListener(CHANGED_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(CHANGED_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

/**
 * Read the newest read-state event from relays. `decrypt` (when provided) is
 * tried first; content that isn't ciphertext falls back to plain JSON.
 */
export async function fetchRemoteReadState(
  pubkey: string,
  decrypt?: (ciphertext: string) => Promise<string>,
  relays: string[] = mergeDataRelays(DEFAULT_RELAYS),
  timeoutMs = 4000,
): Promise<ReadState | null> {
  const { SimplePool } = await import("nostr-tools/pool");
  const pool = new SimplePool();
  const events: SignedEvent[] = [];
  const closer = pool.subscribe(
    relays,
    { kinds: [READ_STATE_KIND], authors: [pubkey], "#d": [READ_STATE_D] },
    {
      onevent(ev) {
        events.push(ev as SignedEvent);
      },
      oneose() {},
    },
  );
  await new Promise((r) => setTimeout(r, timeoutMs));
  closer.close();
  try {
    pool.close(relays);
  } catch {
    /* noop */
  }

  const latest = events.sort((a, b) => b.created_at - a.created_at)[0];
  if (!latest?.content) return null;

  let text = latest.content;
  if (decrypt) {
    try {
      text = await decrypt(latest.content);
    } catch {
      text = latest.content; // fall back to plaintext parse
    }
  }
  try {
    return coerceReadState(JSON.parse(text));
  } catch {
    return null;
  }
}

/**
 * Merge the local state with whatever is on relays, prune, self-encrypt
 * best-effort, sign and publish. Returns the merged state so the caller updates
 * the local mirror. Never throws on publish failure (the local cache is truth).
 */
export async function publishReadState(
  signer: UserSigner,
  localState: ReadState,
  relays: string[] = mergeDataRelays(DEFAULT_RELAYS),
): Promise<ReadState> {
  const remote = await fetchRemoteReadState(signer.pubkey, (c) =>
    signer.nip44Decrypt(signer.pubkey, c),
  ).catch(() => null);
  const merged = pruneReadState(
    remote ? mergeReadState(localState, remote) : localState,
  );

  const json = JSON.stringify(merged);
  let content = json;
  try {
    content = await signer.nip44Encrypt(signer.pubkey, json);
  } catch {
    content = json; // plaintext fallback
  }

  const signed = await signer.signEvent({
    kind: READ_STATE_KIND,
    pubkey: signer.pubkey,
    created_at: nowSec(),
    tags: [
      ["d", READ_STATE_D],
      ["t", READ_STATE_TAG],
      ["client", "La Crypta Dev"],
    ],
    content,
  });
  await publishSignedEventsToRelays([signed], relays).catch(() => {});
  return merged;
}
