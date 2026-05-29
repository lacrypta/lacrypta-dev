import { NextResponse } from "next/server";

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

export async function GET() {
  try {
    const adminNpub = process.env.NEXT_PUBLIC_LACRYPTA_NPUB;
    if (!adminNpub) throw new Error("Falta NEXT_PUBLIC_LACRYPTA_NPUB.");
    const [adminPubkey, publisherPubkey] = await Promise.all([
      decodeNpub(adminNpub),
      publisherPubkeyFromNsec(),
    ]);
    return NextResponse.json({ adminPubkey, publisherPubkey });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Config invalida." },
      { status: 500 },
    );
  }
}
