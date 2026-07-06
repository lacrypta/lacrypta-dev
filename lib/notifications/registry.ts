/**
 * Notification source registry. Adding a new notification type = add one source
 * file and one entry here; the engine (`lib/notifications.ts`) and UI need no
 * other change.
 */
import type {
  NotificationSource,
  RelayNotificationSource,
  StaticNotificationSource,
} from "./types";
import { badgeAwardSource } from "./sources/badgeAward";
import { zapSource } from "./sources/zap";
import { projectReportSource } from "./sources/projectReport";
import { newHackathonSource } from "./sources/newHackathon";
import { communityCallSource } from "./sources/communityCall";
import { appNotificationSource } from "./sources/appNotification";
import { broadcastSource } from "./sources/broadcast";
import { subscriptionSource } from "./sources/subscription";

export const NOTIFICATION_SOURCES: NotificationSource[] = [
  badgeAwardSource,
  zapSource,
  projectReportSource,
  appNotificationSource,
  broadcastSource,
  newHackathonSource,
  communityCallSource,
  subscriptionSource,
];

export const ENABLED_RELAY_SOURCES: RelayNotificationSource[] =
  NOTIFICATION_SOURCES.filter(
    (s): s is RelayNotificationSource => s.kind === "relay" && s.enabled,
  );

export const ENABLED_STATIC_SOURCES: StaticNotificationSource[] =
  NOTIFICATION_SOURCES.filter(
    (s): s is StaticNotificationSource => s.kind === "static" && s.enabled,
  );
