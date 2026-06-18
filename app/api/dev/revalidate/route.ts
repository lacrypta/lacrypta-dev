import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { isDevMode } from "@/lib/devMode";
import {
  NOSTR_PROJECTS_TAG,
  NOSTR_LEGACY_SUBMISSIONS_TAG,
  NOSTR_SOLDIERS_RANKING_TAG,
} from "@/lib/nostrCacheTags";

/**
 * Dev-only cache flush. After seeding dummy users/projects to the local relay,
 * the client calls this so the soldiers roster + voting eligibility (which read
 * cached relay snapshots) pick up the new data immediately — no production
 * REVALIDATE_SECRET needed. 404s unless NEXT_PUBLIC_DEV_MODE.
 */
export async function POST() {
  if (!isDevMode()) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  revalidateTag(NOSTR_PROJECTS_TAG, { expire: 0 });
  revalidateTag(NOSTR_LEGACY_SUBMISSIONS_TAG, { expire: 0 });
  revalidateTag(NOSTR_SOLDIERS_RANKING_TAG, { expire: 0 });
  return NextResponse.json({ ok: true });
}
