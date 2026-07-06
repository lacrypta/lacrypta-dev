import type {
  AppNotification,
  NotificationType,
  RelayNotificationSource,
} from "../types";
import {
  APP_NOTIFICATION_KIND,
  APP_NOTIFICATION_TAG,
  isAppNtype,
  type AppNtype,
} from "../appNotificationEvent";

/** ntype → notification type (unknown ntypes are dropped). */
const NTYPE_TO_TYPE: Record<AppNtype, NotificationType> = {
  "game-invite": "game-invite",
  "pitch-request": "pitch-request",
  recommendation: "user-message",
  invitation: "user-message",
  message: "user-message",
};

const DEFAULT_TITLE: Record<AppNtype, string> = {
  "game-invite": "Te invitaron a un juego",
  "pitch-request": "Te pidieron un pitch de tu proyecto",
  recommendation: "Te recomendaron algo",
  invitation: "Recibiste una invitación",
  message: "Tenés un mensaje nuevo",
};

/** href only for trusted senders; untrusted notifications are never clickable. */
function trustedHref(ntype: AppNtype): string | undefined {
  switch (ntype) {
    case "pitch-request":
      return "/dashboard/projects";
    default:
      return undefined;
  }
}

/**
 * User→user app notifications (kind 1616). Trust model: fully rendered + counted
 * only when the author is La Crypta's publisher or someone the user follows;
 * everyone else lands in the collapsed "Solicitudes" bucket (trusted:false).
 */
export const appNotificationSource: RelayNotificationSource = {
  key: "user-message",
  kind: "relay",
  enabled: true,
  matchKinds: [APP_NOTIFICATION_KIND],
  filters: (ctx) => [
    {
      kinds: [APP_NOTIFICATION_KIND],
      "#p": [ctx.pubkey],
      "#t": [APP_NOTIFICATION_TAG],
    },
  ],
  normalize: (ev, ctx): AppNotification | null => {
    if (ev.pubkey === ctx.pubkey) return null; // self
    const ntypeTag = ev.tags.find((t) => t[0] === "ntype")?.[1];
    if (!isAppNtype(ntypeTag)) return null; // allowlist unknown ntypes out
    const ntype = ntypeTag;
    const type = NTYPE_TO_TYPE[ntype];

    const trusted =
      (!!ctx.publisherPubkey && ev.pubkey === ctx.publisherPubkey) ||
      ctx.follows.has(ev.pubkey);

    let title = "";
    let body: string | undefined;
    try {
      const parsed = JSON.parse(ev.content) as {
        title?: unknown;
        body?: unknown;
      };
      if (typeof parsed.title === "string") title = parsed.title.trim();
      if (typeof parsed.body === "string" && parsed.body.trim())
        body = parsed.body.trim();
    } catch {
      /* treat as empty; fall back to default title */
    }
    if (!title) title = DEFAULT_TITLE[ntype];

    return {
      id: `appnotif:${ev.id}`,
      type,
      createdAt: ev.created_at,
      title,
      // Untrusted: never render body/links (anti-spam), only actor + type.
      body: trusted ? body : undefined,
      actorPubkey: ev.pubkey,
      href: trusted ? trustedHref(ntype) : undefined,
      trusted,
      meta: { ntype },
      eventId: ev.id,
    };
  },
};
