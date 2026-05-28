/**
 * Central Nostr relay configuration for La Crypta Labs.
 *
 * Keep publish/read defaults here so client, server, profile, badge,
 * project and login flows do not drift.
 */

export const LACRYPTA_DEFAULT_RELAYS = [
  "wss://relay.masize.com",
  "wss://relay.damus.io",
  "wss://relay.primal.net",
  "wss://nos.lol",
  "wss://nostr-pub.wellorder.net",
  "wss://offchain.pub",
] as const;

export const LACRYPTA_FAST_USER_RELAYS = [
  "wss://relay.masize.com",
  "wss://relay.damus.io",
  "wss://relay.primal.net",
  "wss://nos.lol",
] as const;

/** NIP-46 login needs relay.nsec.app even though it does not accept kind 1. */
export const LACRYPTA_NIP46_LOGIN_RELAYS = [
  "wss://relay.masize.com",
  "wss://relay.nsec.app",
  "wss://nos.lol",
] as const;

export const AUTH_ONLY_RELAYS = ["wss://relay.nsec.app"] as const;

export function isAuthOnlyRelay(relay: string): boolean {
  const normalized = relay.trim().replace(/\/+$/, "").toLowerCase();
  return AUTH_ONLY_RELAYS.some((authRelay) => authRelay === normalized);
}

export function withoutAuthOnlyRelays(relays: Iterable<string>): string[] {
  const out = new Set<string>();
  for (const relay of relays) {
    const normalized = relay.trim().replace(/\/+$/, "");
    if (!normalized || isAuthOnlyRelay(normalized)) continue;
    out.add(normalized);
  }
  return [...out];
}

export function mergeNonAuthRelays(
  baseRelays: Iterable<string>,
  extraRelays?: Iterable<string>,
): string[] {
  return withoutAuthOnlyRelays([...(baseRelays ?? []), ...(extraRelays ?? [])]);
}

export const DEFAULT_RELAYS = [...LACRYPTA_DEFAULT_RELAYS];
export const FAST_USER_RELAYS = [...LACRYPTA_FAST_USER_RELAYS];
export const NIP46_LOGIN_RELAYS = [...LACRYPTA_NIP46_LOGIN_RELAYS];
