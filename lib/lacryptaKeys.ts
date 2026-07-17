/**
 * Server-only resolution of La Crypta's official **publisher** pubkey.
 *
 * Single source of truth shared by `lib/projectRegistry.ts` (which verifies the
 * registry event's author) and `app/api/lacrypta-pubkeys/route.ts` (which
 * reports the pubkey to the client), so the two can't drift.
 *
 * Prefers deriving from `LACRYPTA_NSEC`; falls back to the configured PUBLIC key
 * `NEXT_PUBLIC_LACRYPTA_NPUB` when the nsec is absent/invalid (e.g. Vercel
 * Sensitive `LACRYPTA_NSEC` pulls empty locally, but the npub is set). Returns
 * `""` when neither is resolvable.
 */
export async function resolvePublisherPubkey(): Promise<string> {
  const { decode } = await import("nostr-tools/nip19");

  const nsec = process.env.LACRYPTA_NSEC;
  if (nsec) {
    try {
      const decoded = decode(nsec);
      if (decoded.type === "nsec") {
        const { getPublicKey } = await import("nostr-tools/pure");
        return getPublicKey(decoded.data as Uint8Array);
      }
    } catch {
      /* fall through to the public npub */
    }
  }

  const npub = process.env.NEXT_PUBLIC_LACRYPTA_NPUB;
  if (npub) {
    try {
      const decoded = decode(npub);
      if (decoded.type === "npub") return decoded.data as string;
    } catch {
      /* no publisher key available */
    }
  }

  return "";
}
