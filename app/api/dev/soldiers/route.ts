import { NextResponse } from "next/server";
import { isDevMode } from "@/lib/devMode";
import { getSoldiers } from "@/lib/soldiers";
import { buildEligibleVoters } from "@/lib/voting";
import { HACKATHONS } from "@/lib/hackathons";

/**
 * Dev-only roster of impersonatable users (soldiers with a linked Nostr pubkey)
 * for the DEV MODE bar's account switcher. Returns the same set + vote budget
 * the voting eligibility builder produces. 404s unless NEXT_PUBLIC_DEV_MODE.
 */
export async function GET() {
  if (!isDevMode()) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const soldiers = await getSoldiers().catch(() => []);
  // maxVotes (distinct hackathons participated) is hackathon-independent, so
  // any id reuses the canonical budget logic. Only voters with a pubkey appear.
  const eligible = buildEligibleVoters(soldiers, HACKATHONS[0]?.id ?? "");
  const list = eligible
    .map((v) => ({ pubkey: v.pubkey, name: v.name, maxVotes: v.maxVotes }))
    .sort((a, b) => b.maxVotes - a.maxVotes || a.name.localeCompare(b.name));
  return NextResponse.json({ soldiers: list });
}
