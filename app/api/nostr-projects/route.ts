import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import {
  getNostrSubmissionsSnapshot,
  NOSTR_SUBMISSIONS_TAG,
} from "@/lib/nostrCache";

export async function GET() {
  const snapshot = await getNostrSubmissionsSnapshot();
  return NextResponse.json(snapshot);
}

export async function POST() {
  revalidateTag(NOSTR_SUBMISSIONS_TAG, "max");
  return NextResponse.json({ ok: true, revalidated: NOSTR_SUBMISSIONS_TAG });
}
