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
export const LACRYPTA_LOGIN_ONLY_RELAYS = ["wss://relay.nsec.app"] as const;

export const LACRYPTA_NIP46_LOGIN_RELAYS = [
  "wss://relay.masize.com",
  ...LACRYPTA_LOGIN_ONLY_RELAYS,
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

/**
 * Dev-only relay override. Set NEXT_PUBLIC_NOSTR_RELAYS (comma-separated) to
 * route ALL publish/read traffic through a different relay set — typically a
 * local relay (ws://localhost:7777) for fully-isolated testing. When unset,
 * the hardcoded La Crypta defaults are used. Single chokepoint: every importer
 * of DEFAULT_RELAYS / FAST_USER_RELAYS / NIP46_LOGIN_RELAYS inherits it.
 */
function parseEnvRelays(): string[] | null {
  const raw = process.env.NEXT_PUBLIC_NOSTR_RELAYS;
  if (!raw) return null;
  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? list : null;
}

const ENV_RELAYS = parseEnvRelays();

export const DEFAULT_RELAYS = ENV_RELAYS ?? [...LACRYPTA_DEFAULT_RELAYS];
export const FAST_USER_RELAYS = ENV_RELAYS ?? [...LACRYPTA_FAST_USER_RELAYS];
export const NIP46_LOGIN_RELAYS = ENV_RELAYS ?? [...LACRYPTA_NIP46_LOGIN_RELAYS];

function normalizeRelayForPolicy(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^wss?:\/\//i.test(trimmed) ? trimmed : `wss://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "ws:" && url.protocol !== "wss:") return null;
    const path = url.pathname === "/" ? "" : url.pathname;
    return `${url.protocol}//${url.host}${path}${url.search}`.toLowerCase();
  } catch {
    return null;
  }
}

const LOGIN_ONLY_RELAY_SET = new Set(
  LACRYPTA_LOGIN_ONLY_RELAYS.map((relay) => normalizeRelayForPolicy(relay)),
);

export function isLoginOnlyRelay(raw: string): boolean {
  const normalized = normalizeRelayForPolicy(raw);
  return normalized ? LOGIN_ONLY_RELAY_SET.has(normalized) : false;
}

export function mergeDataRelays(
  ...groups: Array<readonly string[] | null | undefined>
): string[] {
  const relays = new Map<string, string>();
  for (const group of groups) {
    for (const relay of group ?? []) {
      const normalized = normalizeRelayForPolicy(relay);
      if (!normalized || LOGIN_ONLY_RELAY_SET.has(normalized)) continue;
      relays.set(normalized, normalized);
    }
  }
  return [...relays.values()];
}
