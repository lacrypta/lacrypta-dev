/**
 * Dev-only impersonation of real users by their PUBLIC key.
 *
 * We never have real users' (soldiers') secret keys, and a vote is only valid
 * when signed by an eligible pubkey. So dev impersonation derives a
 * deterministic throwaway keypair from the real pubkey. The voting route
 * derives the SAME stand-in key when building eligibility (dev mode only), so
 * an impersonated stand-in is recognised as a valid voter. The input is public
 * and the salt is known — anyone can recompute these keys, which is fine for a
 * local dev relay and is NEVER enabled in production.
 *
 * Isomorphic: uses the global Web Crypto (`crypto.subtle`), available in both
 * the Node server runtime and the browser, so server and client agree.
 */
const DEV_IMPERSONATION_SALT = "lacrypta-dev-impersonation:v1:";

/** 32-byte stand-in secret for a given real pubkey (hex). */
export async function devSecretForPubkey(
  realPubkeyHex: string,
): Promise<Uint8Array> {
  const data = new TextEncoder().encode(
    DEV_IMPERSONATION_SALT + realPubkeyHex.trim().toLowerCase(),
  );
  const digest = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(digest);
}

/** Stand-in PUBLIC key (hex) that a given real pubkey maps to in dev. */
export async function devPubkeyForPubkey(
  realPubkeyHex: string,
): Promise<string> {
  const { getPublicKey } = await import("nostr-tools/pure");
  return getPublicKey(await devSecretForPubkey(realPubkeyHex));
}
