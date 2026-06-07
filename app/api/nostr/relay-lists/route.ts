import { NextRequest, NextResponse } from "next/server";
import { getCachedRelayList } from "@/lib/nostrRelayListCache";

function pubkeysFromRequest(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("pubkeys") ?? searchParams.get("pubkey") ?? "";
  return raw
    .split(",")
    .map((p) => p.trim())
    .filter((p) => /^[0-9a-f]{64}$/i.test(p))
    .slice(0, 50);
}

export async function GET(req: NextRequest) {
  const pubkeys = pubkeysFromRequest(req);
  if (pubkeys.length === 0) {
    return NextResponse.json({ error: "Falta pubkey." }, { status: 400 });
  }
  const entries = await Promise.all(
    pubkeys.map(async (pubkey) => [pubkey, await getCachedRelayList(pubkey)]),
  );
  return NextResponse.json({
    relayLists: Object.fromEntries(entries),
    generatedAt: new Date().toISOString(),
  });
}
