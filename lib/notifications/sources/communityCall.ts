import type {
  AppNotification,
  StaticNotificationSource,
} from "../types";
import {
  HACKATHONS,
  type HackathonEventType,
} from "../../hackathons";
import { hackathonHref } from "../hrefs";

const REMINDER_DAYS = 7;
const DAY = 86_400;

/** Live community-call event types worth a reminder. */
const CALL_TYPES: HackathonEventType[] = [
  "apertura",
  "pitch",
  "pitch-final",
  "premios",
];

const CALL_LABEL: Record<string, string> = {
  apertura: "Apertura",
  pitch: "Pitch",
  "pitch-final": "Pitch final",
  premios: "Premiación",
};

function argentinaTs(date: string): number {
  return Math.floor(new Date(`${date}T00:00:00-03:00`).getTime() / 1000);
}

/** Reminders for upcoming community calls within the next 7 days. */
export const communityCallSource: StaticNotificationSource = {
  key: "community-call",
  kind: "static",
  enabled: true,
  compute: (ctx) => {
    const out: AppNotification[] = [];
    for (const h of HACKATHONS) {
      for (const ev of h.dates) {
        if (!CALL_TYPES.includes(ev.type)) continue;
        const startTs = argentinaTs(ev.date);
        const windowStart = startTs - REMINDER_DAYS * DAY;
        // Show from a week before up to the end of the event day.
        if (ctx.now < windowStart || ctx.now > startTs + DAY) continue;
        out.push({
          id: `community-call:${h.id}:${ev.date}:${ev.type}`,
          type: "community-call",
          createdAt: windowStart,
          title: `${CALL_LABEL[ev.type] ?? "Community call"} · ${h.name}`,
          body: ev.title || ev.description || undefined,
          href: ev.youtube || hackathonHref(h.id),
          trusted: true,
          meta: {
            hackathonId: h.id,
            date: ev.date,
            eventType: ev.type,
            youtube: ev.youtube,
          },
        });
      }
    }
    return out;
  },
};
