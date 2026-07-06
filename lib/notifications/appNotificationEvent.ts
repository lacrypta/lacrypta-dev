"use client";

/**
 * The user→user / future app-notification event — the backbone for
 * recommendations, invitations, pitch requests, and game invites.
 *
 * A **regular** (non-replaceable) event so each notification persists distinctly
 * and is queryable by `#p`. Kind 1616 is app-scoped and collision-free against
 * the kinds this app already uses (0, 3, 4, 8, 9734/9735, 10002, 27235, 30008/9,
 * 30078). Purpose is carried by the `ntype` tag, never the kind, so one relay
 * filter surfaces every app notification.
 *
 * Trust is enforced on the READ side (`sources/appNotification.ts`): only events
 * from La Crypta's publisher or someone you follow render fully; the rest land in
 * a contentless "Solicitudes" bucket.
 */
import { FAST_USER_RELAYS, mergeDataRelays } from "../nostrRelayConfig";
import { publishSignedEventsToRelays } from "../hackathonBadgeClient";
import type { SignedEvent, UnsignedEvent, UserSigner } from "../nostrSigner";

export const APP_NOTIFICATION_KIND = 1616;
export const APP_NOTIFICATION_TAG = "lacrypta-dev-notification";

export type AppNtype =
  | "game-invite"
  | "pitch-request"
  | "recommendation"
  | "invitation"
  | "message";

export const APP_NTYPES: readonly AppNtype[] = [
  "game-invite",
  "pitch-request",
  "recommendation",
  "invitation",
  "message",
] as const;

export function isAppNtype(value: string | undefined): value is AppNtype {
  return !!value && (APP_NTYPES as readonly string[]).includes(value);
}

export type SendAppNotificationInput = {
  recipientPubkey: string;
  ntype: AppNtype;
  title: string;
  body?: string;
  meta?: Record<string, unknown>;
};

export function buildAppNotificationEvent(
  senderPubkey: string,
  input: SendAppNotificationInput,
): UnsignedEvent {
  return {
    kind: APP_NOTIFICATION_KIND,
    pubkey: senderPubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["p", input.recipientPubkey],
      ["t", APP_NOTIFICATION_TAG],
      ["ntype", input.ntype],
      ["client", "La Crypta Dev"],
    ],
    content: JSON.stringify({
      title: input.title.trim(),
      body: input.body?.trim() || "",
      meta: input.meta ?? {},
    }),
  };
}

/**
 * Sign + publish a user→user notification. Throws if no relay accepted it.
 */
export async function sendAppNotification(
  signer: UserSigner,
  input: SendAppNotificationInput,
  relays: string[] = mergeDataRelays(FAST_USER_RELAYS),
): Promise<{ signed: SignedEvent; relays: { relay: string; ok: boolean; error?: string }[] }> {
  const unsigned = buildAppNotificationEvent(signer.pubkey, input);
  const signed = await signer.signEvent(unsigned);
  const results = await publishSignedEventsToRelays([signed], relays);
  if (!results.some((r) => r.ok)) {
    throw new Error(
      results.find((r) => r.error)?.error ||
        "Ningún relay aceptó la notificación.",
    );
  }
  return { signed, relays: results };
}
