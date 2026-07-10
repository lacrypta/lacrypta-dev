import { type NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import {
  NOSTR_LEGACY_SUBMISSIONS_TAG,
  NOSTR_PROJECTS_TAG,
} from "@/lib/nostrCacheTags";
import { expireNostrTag } from "@/lib/nostrRevalidate";
import { getFreshNostrSubmissionsSnapshot } from "@/lib/nostrCache";

/**
 * Secret-gated revalidation hook for Nostr-sourced cached data.
 *
 * Usage:
 *   curl -X POST $URL/api/revalidate-nostr \
 *     -H "x-revalidate-secret: $REVALIDATE_SECRET" \
 *     -d '{"tag":"nostr:hackathon-submissions"}'
 *
 * Defaults to the global projects tag when no body is provided.
 *
 * `expireNostrTag` clears both cache tiers — the Next tag and the Upstash key
 * shadowing it — so the endpoint cannot report a flush while the read-through
 * layer keeps serving the old value.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-revalidate-secret");
  const expected = process.env.REVALIDATE_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let tag = NOSTR_PROJECTS_TAG;
  try {
    const body = (await req.json()) as { tag?: unknown };
    if (typeof body.tag === "string" && body.tag.length > 0) {
      tag = body.tag;
    }
  } catch {
    /* no body, use default */
  }

  await expireNostrTag(tag);
  if (tag === NOSTR_PROJECTS_TAG) {
    await expireNostrTag(NOSTR_LEGACY_SUBMISSIONS_TAG);
    // Both tiers are now cold, so the next visitor would eat the ~6s relay
    // scan. Rebuild the shared snapshot off the response path instead; `after`
    // (not a detached promise) is what keeps the work alive on serverless.
    after(() => getFreshNostrSubmissionsSnapshot());
  }
  return NextResponse.json({ ok: true, tag });
}
