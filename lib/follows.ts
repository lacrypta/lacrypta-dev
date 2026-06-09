import type { Auth } from "@/lib/auth";
import { getSigner } from "@/lib/nostrSigner";
import type { SignedEvent, UnsignedEvent } from "@/lib/nostrSigner";
import { DEFAULT_RELAYS, mergeDataRelays } from "@/lib/nostrRelayConfig";

/**
 * NIP-02 contact lists (kind 3) — follow / unfollow and mutual-follow status.
 *
 * IMPORTANT: a kind-3 event is *replaceable* and carries the user's ENTIRE
 * follow list in its `p` tags. To follow someone we must fetch the latest
 * existing list, add the new pubkey, and re-publish the whole thing — never
 * publish a list containing only the new contact, or we wipe every existing
 * follow. `setFollow` always re-fetches the freshest list before mutating.
 */

export const CONTACT_KIND = 3;

const CACHE_PREFIX = "labs:contacts:";
const CHANGED_EVENT = "labs:contacts:changed";

export type ContactList = {
  pubkey: string;
  /** Hex pubkeys this user follows (lowercase, deduped). */
  follows: string[];
  /** Preserved kind-3 `content` (legacy relay map JSON on some clients). */
  content: string;
  eventCreatedAt: number;
  fetchedAt: number;
};

export type FollowStatus = {
  /** The logged-in user follows the target. */
  iFollow: boolean;
  /** The target follows the logged-in user back. */
  followsMe: boolean;
};

function isHexPubkey(value: string): boolean {
  return /^[0-9a-f]{64}$/iu.test(value);
}

/** Extract deduped, validated follow pubkeys + content from a kind-3 event. */
function contactListFromEvent(event: SignedEvent): ContactList {
  const seen = new Set<string>();
  for (const tag of event.tags) {
    if (tag[0] !== "p") continue;
    const pk = tag[1]?.trim().toLowerCase();
    if (pk && isHexPubkey(pk)) seen.add(pk);
  }
  return {
    pubkey: event.pubkey,
    follows: [...seen],
    content: typeof event.content === "string" ? event.content : "",
    eventCreatedAt: event.created_at,
    fetchedAt: Date.now(),
  };
}

// ─── localStorage cache ──────────────────────────────────────────────────────

export function getCachedContactList(pubkey: string): ContactList | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + pubkey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ContactList;
    if (!Array.isArray(parsed.follows)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function setCachedContactList(list: ContactList): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_PREFIX + list.pubkey, JSON.stringify(list));
  } catch {
    /* quota / serialization — non-fatal */
  }
}

/** Notify subscribers (other components, tabs) that a list changed. */
function notifyContactsChanged(pubkey: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CHANGED_EVENT, { detail: { pubkey } }));
}

export function onContactsChanged(
  listener: (pubkey: string) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => {
    const pk = (e as CustomEvent<{ pubkey: string }>).detail?.pubkey;
    if (pk) listener(pk);
  };
  window.addEventListener(CHANGED_EVENT, handler);
  return () => window.removeEventListener(CHANGED_EVENT, handler);
}

// ─── Relay reads ─────────────────────────────────────────────────────────────

/**
 * Fetch the latest kind-3 list for each author in one subscription. Returns a
 * map keyed by author pubkey; authors with no contact list are absent.
 */
export async function fetchContactLists(
  authors: string[],
  opts: { timeoutMs?: number; relays?: string[] } = {},
): Promise<Map<string, ContactList>> {
  const result = new Map<string, ContactList>();
  const unique = [...new Set(authors.filter(isHexPubkey))];
  if (unique.length === 0) return result;

  const relays = mergeDataRelays(DEFAULT_RELAYS, opts.relays ?? []);
  const { SimplePool } = await import("nostr-tools/pool");
  const pool = new SimplePool();
  const latest = new Map<string, SignedEvent>();

  const closer = pool.subscribe(
    relays,
    { kinds: [CONTACT_KIND], authors: unique },
    {
      onevent(ev) {
        const prev = latest.get(ev.pubkey);
        if (!prev || ev.created_at > prev.created_at) {
          latest.set(ev.pubkey, ev as SignedEvent);
        }
      },
      oneose() {
        /* keep open until timeout to gather from slower relays */
      },
    },
  );

  await new Promise((r) => setTimeout(r, opts.timeoutMs ?? 4000));
  closer.close();
  try {
    pool.close(relays);
  } catch {
    /* noop */
  }

  for (const [pubkey, ev] of latest) {
    const list = contactListFromEvent(ev);
    setCachedContactList(list);
    result.set(pubkey, list);
  }
  return result;
}

export async function fetchContactList(
  pubkey: string,
  opts: { timeoutMs?: number; relays?: string[] } = {},
): Promise<ContactList | null> {
  const map = await fetchContactLists([pubkey], opts);
  return map.get(pubkey) ?? null;
}

/**
 * Resolve the follow relationship between the logged-in user and a target:
 * whether the user follows the target, and whether the target follows back.
 */
export async function fetchFollowStatus(
  myPubkey: string,
  targetPubkey: string,
  opts: { timeoutMs?: number } = {},
): Promise<FollowStatus> {
  const lists = await fetchContactLists([myPubkey, targetPubkey], opts);
  const mine = lists.get(myPubkey) ?? getCachedContactList(myPubkey);
  const theirs = lists.get(targetPubkey);
  return {
    iFollow: !!mine?.follows.includes(targetPubkey),
    followsMe: !!theirs?.follows.includes(myPubkey),
  };
}

// ─── Relay writes ────────────────────────────────────────────────────────────

async function publishEvent(
  signed: SignedEvent,
  relays: string[],
  perRelayTimeoutMs = 7000,
): Promise<{ relay: string; ok: boolean; error?: string }[]> {
  const { SimplePool } = await import("nostr-tools/pool");
  const pool = new SimplePool();
  const promises = pool.publish(relays, signed);
  const results = await Promise.all(
    relays.map(async (relay, i) => {
      try {
        await Promise.race([
          promises[i],
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Timeout publicando")), perRelayTimeoutMs),
          ),
        ]);
        return { relay, ok: true };
      } catch (error) {
        return {
          relay,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
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
 * Follow or unfollow `targetPubkey`. Re-fetches the freshest existing contact
 * list first (falling back to the local cache) so the re-published kind-3 keeps
 * every other follow intact, then signs and publishes the full list.
 *
 * Throws if the list could not be persisted to at least one relay.
 */
export async function setFollow(
  auth: Auth,
  targetPubkey: string,
  shouldFollow: boolean,
): Promise<{ event: SignedEvent; list: ContactList }> {
  const myPubkey = auth.pubkey;
  const target = targetPubkey.trim().toLowerCase();
  if (!isHexPubkey(target)) throw new Error("Pubkey invalida.");
  if (target === myPubkey) throw new Error("No podés seguirte a vos mismo.");

  // Freshest list wins; the cache is a safety net so flaky relays never make us
  // clobber a known-good list down to a single entry.
  const fetched = await fetchContactList(myPubkey, { timeoutMs: 4500 });
  const base = fetched ?? getCachedContactList(myPubkey);

  const follows = new Set(base?.follows ?? []);
  if (shouldFollow) follows.add(target);
  else follows.delete(target);
  const nextFollows = [...follows];
  const content = base?.content ?? "";

  const unsigned: UnsignedEvent = {
    kind: CONTACT_KIND,
    pubkey: myPubkey,
    created_at: Math.floor(Date.now() / 1000),
    content,
    tags: [
      ...nextFollows.map((pk) => ["p", pk]),
      ["client", "La Crypta Dev"],
    ],
  };

  const signer = await getSigner(auth);
  let signed: SignedEvent;
  try {
    signed = await signer.signEvent(unsigned);
  } finally {
    await signer.close?.();
  }

  const relays = mergeDataRelays(DEFAULT_RELAYS);
  const results = await publishEvent(signed, relays);
  if (!results.some((r) => r.ok)) {
    const reason = results.find((r) => r.error)?.error;
    throw new Error(reason || "Ningún relay aceptó la actualización.");
  }

  const list: ContactList = {
    pubkey: myPubkey,
    follows: nextFollows,
    content,
    eventCreatedAt: signed.created_at,
    fetchedAt: Date.now(),
  };
  setCachedContactList(list);
  notifyContactsChanged(myPubkey);
  return { event: signed, list };
}
