import { connection, NextResponse } from "next/server";

async function decodeNpub(npub: string): Promise<string> {
  const { decode } = await import("nostr-tools/nip19");
  const decoded = decode(npub);
  if (decoded.type !== "npub") throw new Error("npub invalido.");
  return decoded.data as string;
}

async function publisherPubkeyFromNsec(): Promise<string> {
  const nsec = process.env.LACRYPTA_NSEC;
  if (!nsec) throw new Error("Falta LACRYPTA_NSEC.");
  const { decode } = await import("nostr-tools/nip19");
  const { getPublicKey } = await import("nostr-tools/pure");
  const decoded = decode(nsec);
  if (decoded.type !== "nsec") throw new Error("LACRYPTA_NSEC invalido.");
  return getPublicKey(decoded.data as Uint8Array);
}

function getAdminNpub(): string {
  const adminNpub =
    process.env.NEXT_PUBLIC_LACRYPTA_ADMIN_NPUB ||
    process.env.NEXT_PUBLIC_LACRYPTA_NPUB;
  if (!adminNpub) {
    throw new Error("Falta NEXT_PUBLIC_LACRYPTA_ADMIN_NPUB.");
  }
  return adminNpub;
}

/**
 * Config-INFO endpoint: report La Crypta's admin + publisher pubkeys.
 *
 * ALWAYS returns 200 — a missing/invalid key yields a null field + a reason,
 * never a 500. Callers (`Navbar`, `resolveLacryptaPubkey`, voting/badge helpers)
 * already treat an absent pubkey as "no admin features / can't verify". A hard
 * 500 here is a failure signal that cascades badly when the (Vercel-Sensitive)
 * npub env vars are absent — e.g. blanking every page in a dev reload loop.
 */
export async function GET() {
  let adminPubkey: string | null = null;
  let adminError: string | undefined;
  try {
    await connection();
    adminPubkey = await decodeNpub(getAdminNpub());
  } catch (error) {
    adminError = error instanceof Error ? error.message : "Config invalida.";
  }

  let publisherPubkey: string | undefined;
  let publisherError: string | undefined;
  try {
    publisherPubkey = await publisherPubkeyFromNsec();
  } catch (error) {
    publisherError =
      error instanceof Error ? error.message : "No se pudo resolver publisher.";
  }

  return NextResponse.json({
    adminPubkey,
    ...(publisherPubkey ? { publisherPubkey } : {}),
    ...(publisherError ? { publisherError } : {}),
    ...(adminError ? { adminError } : {}),
  });
}
