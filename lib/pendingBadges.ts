/**
 * Shared shapes for the admin "pending badge awards" scan.
 *
 * Isomorphic and dependency-free: it only pulls a *type* from `hackathonBadges`
 * (itself type-only), so both the server route (`app/api/hackathon-badges/
 * pending/route.ts`) and the client panel (`app/badges/AdminPendingAwardsPanel
 * .tsx`) can import it without dragging server-only code (`lib/soldiers.ts`,
 * `lib/badgeCriteria.ts`) into the browser bundle.
 */
import type { HackathonBadgeCatalogBadge } from "./hackathonBadges";

/** Structurally compatible with `BadgeAwardRecipient` in `hackathonBadgeClient`. */
export type PendingBadgeRecipient = {
  pubkey: string;
  name?: string;
  nip05?: string;
};

/** A qualifier that meets a badge's criteria but has no resolvable Nostr pubkey. */
export type UnresolvedQualifier = {
  name: string;
  slug: string;
};

export type PendingBadgeGroup = {
  hackathonId: string;
  hackathonName: string;
  /** Carries `.definition` (a-tag) + `.criteria`; passed straight to `requestBadgeAward`. */
  badge: HackathonBadgeCatalogBadge;
  /** false → manual/juror badge: recipients are hand-picked in the UI. */
  autoEvaluable: boolean;
  /** Computed, awardable recipients (have a pubkey, not yet owners). */
  recipients: PendingBadgeRecipient[];
  /** Qualifiers shown greyed/disabled — they meet criteria but can't be awarded. */
  unresolvedQualifiers: UnresolvedQualifier[];
  /** Current owners' pubkeys — used to exclude already-awarded from the manual picker. */
  ownerPubkeys: string[];
  alreadyAwarded: number;
};
