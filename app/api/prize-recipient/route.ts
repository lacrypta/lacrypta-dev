import { NextResponse, type NextRequest } from "next/server";
import { getCachedNostrProfile } from "@/lib/nostrProfileCache";

/**
 * Resolves a prize recipient's Lightning payment destination from their pubkey,
 * for the podium "Pagar premio" flow (components/voting/PrizeZapButton).
 *
 * ONLY the recipient's kind-0 profile `lud16` counts — that's the actual
 * Lightning address. `nip05` is an identity/verification handle, NOT a payment
 * address (even when it looks similar), so it must never be used as a payout
 * destination. If there's no `lud16`, we resolve nothing and the prize simply
 * isn't payable until the winner publishes one.
 *
 * Read-only, no secrets; reuses the shared cached profile round-trip.
 */

function lightningAddressToLnurlpEndpoint(address: string): string | null {
  const [name, domain] = address.split("@");
  if (!name || !domain) return null;
  return `https://${domain}/.well-known/lnurlp/${encodeURIComponent(name)}`;
}

export async function GET(req: NextRequest) {
  const pubkey = (req.nextUrl.searchParams.get("pubkey") || "")
    .toLowerCase()
    .trim();
  if (!/^[0-9a-f]{64}$/.test(pubkey)) {
    return NextResponse.json({ error: "pubkey invalido." }, { status: 400 });
  }

  let lightningAddress: string | null = null;
  let source: "lud16" | "none" = "none";

  try {
    const profile = await getCachedNostrProfile(pubkey);
    const lud16 = profile?.lud16?.trim();
    if (lud16 && lud16.includes("@")) {
      lightningAddress = lud16;
      source = "lud16";
    }
  } catch {
    /* leave unresolved */
  }

  const zapEndpoint = lightningAddress
    ? lightningAddressToLnurlpEndpoint(lightningAddress)
    : null;

  return NextResponse.json({ lightningAddress, zapEndpoint, source });
}
