import { connection, NextResponse } from "next/server";
import { getCachedHackathonBadgeOwnersSnapshot } from "@/lib/hackathonBadgeCache";

function cleanPubkey(value: string | null): string {
  return value && /^[0-9a-f]{64}$/iu.test(value.trim())
    ? value.trim().toLowerCase()
    : "";
}

export async function GET(req: Request) {
  await connection();
  const { searchParams } = new URL(req.url);
  const aTag = searchParams.get("aTag")?.trim() || "";
  const issuer = cleanPubkey(searchParams.get("issuer"));
  if (!aTag) {
    return NextResponse.json({ error: "Falta aTag." }, { status: 400 });
  }

  try {
    return NextResponse.json(
      await getCachedHackathonBadgeOwnersSnapshot(aTag, issuer || undefined),
    );
  } catch (error) {
    console.error("[api/hackathon-badges/owners] failed", error);
    return NextResponse.json(
      { error: "No se pudieron buscar owners de badge." },
      { status: 500 },
    );
  }
}
