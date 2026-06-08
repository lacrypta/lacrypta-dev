import { NextResponse } from "next/server";
import { getSoldiers } from "@/lib/soldiers";

export async function GET() {
  const soldiers = await getSoldiers();
  return NextResponse.json({
    soldiers: soldiers.map((soldier) => ({
      id: soldier.id,
      slug: soldier.slug,
      name: soldier.name,
      github: soldier.github,
      pubkey: soldier.pubkey,
      nip05: soldier.nip05,
      picture: soldier.picture,
      hasNostr: soldier.hasNostr,
      score: soldier.score,
    })),
  });
}
