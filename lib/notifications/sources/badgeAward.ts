import type { RelayNotificationSource } from "../types";

/** NIP-58 badge awards (kind 8) addressed to the user. */
export const badgeAwardSource: RelayNotificationSource = {
  key: "badge-award",
  kind: "relay",
  enabled: true,
  matchKinds: [8],
  filters: (ctx) => [{ kinds: [8], "#p": [ctx.pubkey] }],
  normalize: (ev, ctx) => {
    // Don't notify about a badge you awarded to yourself (admins).
    if (ev.pubkey === ctx.pubkey) return null;
    const badge = ev.tags.find((t) => t[0] === "badge")?.[1];
    const hackathon = ev.tags.find((t) => t[0] === "hackathon")?.[1];
    return {
      id: `badge-award:${ev.id}`,
      type: "badge-award",
      createdAt: ev.created_at,
      title: "Recibiste una insignia",
      body: ev.content?.trim() || undefined,
      actorPubkey: ev.pubkey,
      href: "/badges",
      trusted: true,
      meta: { badge, hackathon },
      eventId: ev.id,
    };
  },
};
