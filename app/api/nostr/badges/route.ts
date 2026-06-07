import { NextRequest, NextResponse } from "next/server";
import { getCachedBadgesSnapshot } from "@/lib/nostrBadgesCache";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const pubkey = (searchParams.get("pubkey") ?? "").trim();
  if (!/^[0-9a-f]{64}$/i.test(pubkey)) {
    return NextResponse.json({ error: "Falta pubkey." }, { status: 400 });
  }
  return NextResponse.json(await getCachedBadgesSnapshot(pubkey));
}
