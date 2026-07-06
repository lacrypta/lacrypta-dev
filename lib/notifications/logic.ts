/**
 * Pure notification logic — join floor, read/unread, and read-state merge.
 * No IO; unit-tested in `tests/notifications.test.ts`.
 */
import {
  STATIC_NOTIFICATION_TYPES,
  type AppNotification,
  type NotificationType,
  type ReadState,
} from "./types";

const MAX_READ_IDS = 300;
const MAX_DISMISSED_IDS = 400;

export function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

export function emptyReadState(installedAt: number): ReadState {
  return {
    version: 1,
    installedAt,
    lastReadAt: 0,
    readIds: [],
    dismissedIds: [],
    mutedTypes: [],
  };
}

/**
 * Effective timestamp — clamp so a spoofed future `created_at` can neither
 * dominate sort order nor evade the read floor.
 */
export function effectiveCreatedAt(createdAt: number, firstSeen: number): number {
  return Math.min(createdAt, firstSeen);
}

/**
 * A relay notification is eligible only if it happened at/after the user joined.
 * Static (schedule-derived) notifications are exempt — they're always current by
 * construction, so a brand-new user still sees an upcoming hackathon.
 */
export function passesJoinFloor(n: AppNotification, installedAt: number): boolean {
  if (STATIC_NOTIFICATION_TYPES.has(n.type)) return true;
  return n.createdAt >= installedAt;
}

export function isDismissed(n: AppNotification, state: ReadState): boolean {
  return state.dismissedIds.includes(n.id);
}

export function isMuted(n: AppNotification, state: ReadState): boolean {
  return state.mutedTypes.includes(n.type);
}

export function isRead(n: AppNotification, state: ReadState): boolean {
  return state.readIds.includes(n.id) || n.createdAt <= state.lastReadAt;
}

/** Unread = trusted, not dismissed, not muted, and not read. */
export function isUnread(n: AppNotification, state: ReadState): boolean {
  return (
    n.trusted &&
    !isDismissed(n, state) &&
    !isMuted(n, state) &&
    !isRead(n, state)
  );
}

export function countUnread(
  notifications: AppNotification[],
  state: ReadState,
): number {
  let count = 0;
  for (const n of notifications) if (isUnread(n, state)) count += 1;
  return count;
}

function uniq(values: string[]): string[] {
  return [...new Set(values)];
}

/**
 * Commutative merge so concurrent devices converge (last-write-wins would drop
 * dismissals): union the id sets, take the newest read marker and the earliest
 * install floor.
 */
export function mergeReadState(a: ReadState, b: ReadState): ReadState {
  const installs = [a.installedAt, b.installedAt].filter((x) => x > 0);
  const installedAt = installs.length
    ? Math.min(...installs)
    : Math.max(a.installedAt, b.installedAt);
  return {
    version: 1,
    installedAt,
    lastReadAt: Math.max(a.lastReadAt, b.lastReadAt),
    readIds: uniq([...a.readIds, ...b.readIds]),
    dismissedIds: uniq([...a.dismissedIds, ...b.dismissedIds]),
    mutedTypes: uniq([...a.mutedTypes, ...b.mutedTypes]) as NotificationType[],
  };
}

/**
 * Bound growth: `lastReadAt` already covers old items as read, so keep only the
 * most recent ids and hard-cap the arrays.
 */
export function pruneReadState(state: ReadState): ReadState {
  const trimTail = (values: string[], max: number) =>
    values.length > max ? values.slice(values.length - max) : values;
  return {
    ...state,
    readIds: trimTail(uniq(state.readIds), MAX_READ_IDS),
    dismissedIds: trimTail(uniq(state.dismissedIds), MAX_DISMISSED_IDS),
    mutedTypes: uniq(state.mutedTypes) as NotificationType[],
  };
}
