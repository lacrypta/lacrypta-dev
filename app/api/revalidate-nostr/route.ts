import { revalidateTag } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";
import {
  NOSTR_LEGACY_SUBMISSIONS_TAG,
  NOSTR_PROJECTS_TAG,
} from "@/lib/nostrCacheTags";

/**
 * Secret-gated revalidation hook for Nostr-sourced cached data.
 *
 * Usage:
 *   curl -X POST $URL/api/revalidate-nostr \
 *     -H "x-revalidate-secret: $REVALIDATE_SECRET" \
 *     -d '{"tag":"nostr:hackathon-submissions"}'
 *
 * Defaults to the global projects tag when no body is provided.
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

  revalidateTag(tag, { expire: 0 });
  if (tag === NOSTR_PROJECTS_TAG) {
    revalidateTag(NOSTR_LEGACY_SUBMISSIONS_TAG, { expire: 0 });
  }
  return NextResponse.json({ ok: true, tag });
}
