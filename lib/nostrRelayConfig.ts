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

export const DEFAULT_RELAYS = [...LACRYPTA_DEFAULT_RELAYS];
export const FAST_USER_RELAYS = [...LACRYPTA_FAST_USER_RELAYS];
export const NIP46_LOGIN_RELAYS = [...LACRYPTA_NIP46_LOGIN_RELAYS];
