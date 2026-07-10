import { type NextRequest, NextResponse } from "next/server";
import { getFreshNostrSubmissionsSnapshot } from "@/lib/nostrCache";
import { isUpstashEnabled } from "@/lib/upstashCache";

/**
 * Cache warming endpoint. Rescans the relays and writes the snapshot through to
 * Upstash so the ~6s scan happens here, on a schedule, instead of inside the
 * first user or crawler request that finds the cache cold.
 *
 * Deliberately does NOT expire any Next cache tag: pages stay on their own
 * stale-while-revalidate cycle, and when one does regenerate it reads a warm
 * Upstash key. Expiring tags here would force a re-render every five minutes
 * for no freshness gain.
 *
 * Scheduled from `vercel.json`. Vercel Cron sends `Authorization: Bearer
 * $CRON_SECRET` automatically once CRON_SECRET is set on the project. Hobby
 * projects only get daily crons — on that plan, drive this from an Upstash
 * QStash schedule (same URL, same header) instead.
 */
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET no configurado." },
      { status: 503 },
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  if (!isUpstashEnabled()) {
    // Without the shared cache there is nothing to warm — a scan here would
    // only heat this one instance's memory and be discarded.
    return NextResponse.json({
      ok: true,
      warmed: false,
      reason: "upstash-disabled",
    });
  }

  const startedAt = Date.now();
  const snapshot = await getFreshNostrSubmissionsSnapshot();
  return NextResponse.json({
    ok: true,
    warmed: snapshot.projects.length > 0,
    projects: snapshot.projects.length,
    generatedAt: snapshot.generatedAt,
    elapsedMs: Date.now() - startedAt,
  });
}
