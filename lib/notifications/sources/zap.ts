import type { RelayNotificationSource } from "../types";
import { parseZapReceipt } from "../../zap";
import type { SignedEvent } from "../../nostrSigner";

/** NIP-57 zap receipts (kind 9735) addressed to the user. */
export const zapSource: RelayNotificationSource = {
  key: "zap",
  kind: "relay",
  enabled: true,
  matchKinds: [9735],
  filters: (ctx) => [{ kinds: [9735], "#p": [ctx.pubkey] }],
  normalize: (ev, ctx) => {
    // The receipt's top-level pubkey is the LNURL server; the real sender lives
    // inside the embedded zap request (parsed by parseZapReceipt).
    const zap = parseZapReceipt(ev as SignedEvent);
    if (!zap) return null;
    if (zap.senderPubkey && zap.senderPubkey === ctx.pubkey) return null; // self-zap
    const sats = zap.amountSats;
    return {
      id: `zap:${ev.id}`,
      type: "zap",
      createdAt: zap.createdAt,
      title:
        sats != null
          ? `Te zapearon ${sats.toLocaleString("es-AR")} sats`
          : "Te zapearon",
      body: zap.comment?.trim() || undefined,
      actorPubkey: zap.senderPubkey ?? undefined,
      trusted: true,
      meta: { sats },
      eventId: ev.id,
    };
  },
};
