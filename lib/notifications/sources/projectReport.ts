import type { RelayNotificationSource } from "../types";
import { hackathonHref, projectHref } from "../hrefs";

/**
 * La Crypta project reports / hackathon results (kind 30078 by the publisher).
 * Both already tag `["p", <recipientPubkey>]`, so a plain `#p` filter surfaces
 * the ones about the user — no dependency on cached project ids.
 */
export const projectReportSource: RelayNotificationSource = {
  key: "project-report",
  kind: "relay",
  enabled: true,
  matchKinds: [30078],
  filters: (ctx) =>
    ctx.publisherPubkey
      ? [{ kinds: [30078], authors: [ctx.publisherPubkey], "#p": [ctx.pubkey] }]
      : [],
  normalize: (ev, ctx) => {
    if (ctx.publisherPubkey && ev.pubkey !== ctx.publisherPubkey) return null;
    const t = ev.tags.find((x) => x[0] === "t")?.[1];
    const hackathon = ev.tags.find((x) => x[0] === "h")?.[1];

    if (t === "lacrypta-dev-results") {
      return {
        id: `hackathon-results:${ev.id}`,
        type: "project-report",
        createdAt: ev.created_at,
        title: "Se publicaron los resultados de la hackatón",
        body: hackathon ? `Hackatón ${hackathon}` : undefined,
        actorPubkey: ev.pubkey,
        href: hackathon ? hackathonHref(hackathon) : "/hackathons",
        trusted: true,
        meta: { hackathon },
        eventId: ev.id,
      };
    }

    if (t === "lacrypta-dev-report") {
      // d = lacrypta.dev:hackathon:<id>:report:<projectId>
      const d = ev.tags.find((x) => x[0] === "d")?.[1] ?? "";
      const projectId = d.includes(":report:")
        ? d.slice(d.indexOf(":report:") + ":report:".length)
        : undefined;
      return {
        id: `project-report:${ev.id}`,
        type: "project-report",
        createdAt: ev.created_at,
        title: "Tu proyecto tiene un nuevo reporte",
        actorPubkey: ev.pubkey,
        href: projectId
          ? projectHref(projectId)
          : hackathon
            ? hackathonHref(hackathon)
            : "/projects",
        trusted: true,
        meta: { hackathon, projectId },
        eventId: ev.id,
      };
    }

    return null;
  },
};
