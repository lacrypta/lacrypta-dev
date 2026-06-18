#!/usr/bin/env node
/**
 * Generate a throwaway dev keypair for the isolated local dev environment.
 *
 *   pnpm gen:dev-keys
 *
 * Prints ready-to-paste .env.local lines: a dev signing key for La Crypta's
 * official events (LACRYPTA_NSEC + matching admin npub) plus the browser-side
 * dev admin secret used by the DEV MODE bar's "Entrar como La Crypta" button.
 *
 * NEVER use these values in production — they are meant for a local relay only.
 */
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { npubEncode, nsecEncode } from "nostr-tools/nip19";

const sk = generateSecretKey(); // Uint8Array (32 bytes)
const pubkeyHex = getPublicKey(sk);
const nsec = nsecEncode(sk);
const npub = npubEncode(pubkeyHex);

const line = "─".repeat(72);
console.log(`\n${line}`);
console.log("  Dev keypair — paste into .env.local (LOCAL DEV ONLY)");
console.log(line);
console.log(`
# Server-only signing key for La Crypta's official dev events.
LACRYPTA_NSEC=${nsec}

# Admin npub — must match the key above so admin guards recognise you.
NEXT_PUBLIC_LACRYPTA_ADMIN_NPUB=${npub}

# Browser-side admin secret for the DEV MODE bar "Entrar como La Crypta" button.
# Same key as LACRYPTA_NSEC. Dev-only — exposed to the browser on purpose.
NEXT_PUBLIC_DEV_ADMIN_NSEC=${nsec}

# Turn on the DEV MODE bar + impersonation, and route Nostr to the local relay.
NEXT_PUBLIC_DEV_MODE=true
NEXT_PUBLIC_NOSTR_RELAYS=ws://localhost:7777
`);
console.log(`${line}`);
console.log(`  pubkey (hex): ${pubkeyHex}`);
console.log(`${line}\n`);
