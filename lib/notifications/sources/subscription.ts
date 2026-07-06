import type { StaticNotificationSource } from "../types";

/**
 * Scaffold for subscription-related notifications (new followers, opportunity
 * matches, etc). Registered so the type + rendering pipeline exist; wire real
 * emitters later. Muting/subscribing is already handled via
 * `ReadState.mutedTypes` across all types.
 */
export const subscriptionSource: StaticNotificationSource = {
  key: "subscription",
  kind: "static",
  enabled: false,
  compute: () => [],
};
