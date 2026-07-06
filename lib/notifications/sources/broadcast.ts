import type { RelayNotificationSource } from "../types";
import { BROADCAST_KIND, BROADCAST_TAG, parseBroadcastContent } from "../broadcast";

/**
 * La Crypta broadcast notifications (kind 1616, `lacrypta-dev-broadcast`, no #p),
 * authored by the publisher key. Delivered to every user via `authors:[publisher]`;
 * always trusted since the author is the official publisher. Not self-filtered —
 * the admin also sees the broadcast they sent (confirmation it went out).
 */
export const broadcastSource: RelayNotificationSource = {
  key: "announcement",
  kind: "relay",
  enabled: true,
  matchKinds: [BROADCAST_KIND],
  filters: (ctx) =>
    ctx.publisherPubkey
      ? [
          {
            kinds: [BROADCAST_KIND],
            authors: [ctx.publisherPubkey],
            "#t": [BROADCAST_TAG],
          },
        ]
      : [],
  normalize: (ev, ctx) => {
    if (ctx.publisherPubkey && ev.pubkey !== ctx.publisherPubkey) return null;
    const content = parseBroadcastContent(ev.content);
    if (!content) return null;
    return {
      id: `announcement:${ev.id}`,
      type: "announcement",
      createdAt: ev.created_at,
      title: content.title,
      body: content.body,
      href: content.href,
      actorPubkey: ev.pubkey,
      trusted: true,
      eventId: ev.id,
    };
  },
};
