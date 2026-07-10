import { NextResponse } from "next/server";
import { isDevMode } from "@/lib/devMode";
import {
  NOSTR_PROJECTS_TAG,
  NOSTR_LEGACY_SUBMISSIONS_TAG,
  NOSTR_PROJECT_REGISTRY_TAG,
  NOSTR_SOLDIERS_RANKING_TAG,
} from "@/lib/nostrCacheTags";
import { expireNostrTags } from "@/lib/nostrRevalidate";

/**
 * Dev-only cache flush. After seeding dummy users/projects to the local relay,
 * the client calls this so the soldiers roster + voting eligibility (which read
 * cached relay snapshots) pick up the new data immediately — no production
 * REVALIDATE_SECRET needed. 404s unless NEXT_PUBLIC_DEV_MODE.
 *
 * Clears the Upstash tier too (under the `dev:` namespace), otherwise a freshly
 * seeded relay would keep serving the pre-seed snapshot.
 */
export async function POST() {
  if (!isDevMode()) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  await expireNostrTags(
    NOSTR_PROJECTS_TAG,
    NOSTR_LEGACY_SUBMISSIONS_TAG,
    NOSTR_SOLDIERS_RANKING_TAG,
    NOSTR_PROJECT_REGISTRY_TAG,
  );
  return NextResponse.json({ ok: true });
}
