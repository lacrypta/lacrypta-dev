import type { AppNotification, StaticNotificationSource } from "../types";
import { HACKATHONS, hackathonStatus } from "../../hackathons";
import { hackathonHref } from "../hrefs";

const WINDOW_DAYS = 30;
const DAY = 86_400;

/** Interpret a `YYYY-MM-DD` schedule date as Argentina local midnight (UTC-3). */
function argentinaTs(date: string): number {
  return Math.floor(new Date(`${date}T00:00:00-03:00`).getTime() / 1000);
}

function firstAperturaDate(dates: { type: string; date: string }[]): string | null {
  return (
    dates
      .filter((e) => e.type === "apertura")
      .map((e) => e.date)
      .sort()[0] ?? null
  );
}

/** "Nueva hackatón" for upcoming editions opening within the next 30 days. */
export const newHackathonSource: StaticNotificationSource = {
  key: "new-hackathon",
  kind: "static",
  enabled: true,
  compute: (ctx) => {
    const out: AppNotification[] = [];
    const nowDate = new Date(ctx.now * 1000);
    for (const h of HACKATHONS) {
      if (hackathonStatus(h, nowDate) !== "upcoming") continue;
      const apertura = firstAperturaDate(h.dates);
      if (!apertura) continue;
      const startTs = argentinaTs(apertura);
      const windowStart = startTs - WINDOW_DAYS * DAY;
      if (ctx.now < windowStart || ctx.now > startTs) continue;
      out.push({
        id: `new-hackathon:${h.id}`,
        type: "new-hackathon",
        createdAt: windowStart, // stable "announced at" — drives unread vs lastReadAt
        title: `Nueva hackatón: ${h.name}`,
        body: h.focus,
        href: hackathonHref(h.id),
        trusted: true,
        meta: { hackathonId: h.id, aperturaDate: apertura },
      });
    }
    return out;
  },
};
