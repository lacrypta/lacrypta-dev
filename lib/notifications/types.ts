/**
 * Core notification types + the source-registry contract.
 *
 * Pure and dependency-free (no `"use client"`, no heavy imports) so it can be
 * imported from server, client, and node tests alike. IO lives in the source
 * files, `readState.ts`, and the `useNotifications` hook.
 */

export type NotificationType =
  // real, relay-backed
  | "badge-award"
  | "zap"
  | "project-report"
  // real, derived from static hackathon schedule (no relay)
  | "new-hackathon"
  | "community-call"
  // real, La Crypta broadcast to every user (kind 1616, authored by publisher)
  | "announcement"
  // real via the app-notification event (kind 1616)
  | "game-invite"
  | "pitch-request"
  | "user-message"
  // scaffold (registered, source returns [])
  | "subscription";

/** Types that come from the static hackathon schedule — exempt from the join floor. */
export const STATIC_NOTIFICATION_TYPES: ReadonlySet<NotificationType> = new Set([
  "new-hackathon",
  "community-call",
]);

export type AppNotification = {
  /** Stable dedupe key, e.g. `badge-award:<eventId>` or `new-hackathon:<id>`. */
  id: string;
  type: NotificationType;
  /** unix seconds; clamped to `min(created_at, firstSeenLocal)` by the engine. */
  createdAt: number;
  /** Spanish (es_AR). */
  title: string;
  body?: string;
  /** Who triggered it (hex) — drives avatar/name. Absent for broadcasts. */
  actorPubkey?: string;
  /** Internal deep-link on click. Omitted for untrusted senders. */
  href?: string;
  /** false → rendered in the collapsed "Solicitudes" bucket, never counts as unread. */
  trusted: boolean;
  meta?: Record<string, unknown>;
  /** Originating Nostr event id, when applicable. */
  eventId?: string;
};

/** Minimal Nostr event shape — avoids a nostr-tools type dependency in pure code. */
export type NostrEventLike = {
  id: string;
  pubkey: string;
  kind: number;
  content: string;
  tags: string[][];
  created_at: number;
};

export type NostrFilterLike = {
  kinds?: number[];
  authors?: string[];
  since?: number;
  limit?: number;
} & { [tag: `#${string}`]: string[] | undefined };

export type NotificationSourceCtx = {
  /** Logged-in user (hex). */
  pubkey: string;
  /** La Crypta official publisher pubkey (hex), or null if unresolved. */
  publisherPubkey: string | null;
  /** Hex pubkeys the user follows — the trust set for user→user notifications. */
  follows: ReadonlySet<string>;
  /** unix seconds — events with effective ts below this are pre-join history. */
  installedAt: number;
  /** unix seconds — injected clock for testability. */
  now: number;
};

/** A source backed by relay events; contributes to the single batched subscription. */
export type RelayNotificationSource = {
  key: NotificationType;
  kind: "relay";
  enabled: boolean;
  /** Nostr kinds this source consumes (used to route incoming events). */
  matchKinds: number[];
  filters: (ctx: NotificationSourceCtx) => NostrFilterLike[];
  /** Map one event → a notification, or null to drop (self/unknown/untrusted-ntype). */
  normalize: (ev: NostrEventLike, ctx: NotificationSourceCtx) => AppNotification | null;
};

/** A source computed synchronously from static data (no relays). */
export type StaticNotificationSource = {
  key: NotificationType;
  kind: "static";
  enabled: boolean;
  compute: (ctx: NotificationSourceCtx) => AppNotification[];
};

export type NotificationSource =
  | RelayNotificationSource
  | StaticNotificationSource;

/** Persisted read/seen state — mirrored to localStorage and a kind-30078 event. */
export type ReadState = {
  version: 1;
  /** unix seconds; the join floor (earliest install wins on merge). */
  installedAt: number;
  /** unix seconds; coarse "everything up to here is read" marker. */
  lastReadAt: number;
  /** explicit per-id read marks (bounded). */
  readIds: string[];
  /** hidden ids (bounded). */
  dismissedIds: string[];
  /** muted types — doubles as subscription preferences. */
  mutedTypes: NotificationType[];
};
