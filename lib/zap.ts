"use client";

// Generic NIP-57 (lightning zap) helpers for zapping any Nostr profile.
// Distinct from `lib/prizeZaps.ts`, which is the admin prize-payout flow with
// its own tracking tags and local bookkeeping. This module is the lightweight
// "zap this person" path used on public profile pages (e.g. /soldados/[slug]).

import { DEFAULT_RELAYS } from "./nostrRelayConfig";
import type { SignedEvent, UnsignedEvent, UserSigner } from "./nostrSigner";

const ZAP_REQUEST_KIND = 9734;
const ZAP_RECEIPT_KIND = 9735;

declare global {
  interface Window {
    webln?: {
      enable?: () => Promise<void>;
      sendPayment?: (invoice: string) => Promise<{ preimage?: string }>;
    };
  }
}

export type ZapRecipientInfo = {
  /** Resolved lightning address (lud16 or derived from the zap endpoint). */
  lightningAddress: string | null;
  /** LNURL callback that advertises NIP-57 zap support, or null. */
  zapEndpoint: string | null;
  /**
   * A usable LNURL-pay endpoint even when NIP-57 zaps aren't advertised — lets
   * us fall back to a plain lightning payment (with comment) to any valid
   * lightning address.
   */
  payEndpoint: string | null;
  /** True only when a real NIP-57 zap (with a zap receipt) is possible. */
  supportsNostr: boolean;
};

function lnurlpUrlFromAddress(address: string | null): string | null {
  if (!address || !address.includes("@")) return null;
  const [name, domain] = address.split("@");
  if (!name || !domain) return null;
  return `https://${domain}/.well-known/lnurlp/${encodeURIComponent(name)}`;
}

function lightningAddressFromZapEndpoint(endpoint: string | null): string | null {
  if (!endpoint) return null;
  try {
    const url = new URL(endpoint);
    const parts = url.pathname.split("/").filter(Boolean);
    const lnurlpIndex = parts.findIndex((part) => part.toLowerCase() === "lnurlp");
    const username = lnurlpIndex >= 0 ? parts[lnurlpIndex + 1] : null;
    if (!username) return null;
    return `${decodeURIComponent(username)}@${url.hostname}`;
  } catch {
    return null;
  }
}

async function fetchLatestProfileEvent(pubkey: string) {
  const { SimplePool } = await import("nostr-tools/pool");
  const pool = new SimplePool();
  const events: SignedEvent[] = [];
  const closer = pool.subscribe(
    DEFAULT_RELAYS,
    { kinds: [0], authors: [pubkey], limit: 1 },
    {
      onevent(ev) {
        events.push(ev as SignedEvent);
      },
      oneose() {},
    },
  );
  await new Promise((r) => setTimeout(r, 3500));
  closer.close();
  try {
    pool.close(DEFAULT_RELAYS);
  } catch {
    /* noop */
  }
  events.sort((a, b) => b.created_at - a.created_at);
  return events[0] ?? null;
}

/**
 * Resolve where to send a zap for `recipientPubkey`: prefers the profile's
 * lud16, falling back to whatever NIP-57 zap endpoint is advertised.
 */
export async function getZapRecipientInfo(
  recipientPubkey: string,
): Promise<ZapRecipientInfo> {
  const profileEvent = await fetchLatestProfileEvent(recipientPubkey);
  if (!profileEvent) {
    return {
      lightningAddress: null,
      zapEndpoint: null,
      payEndpoint: null,
      supportsNostr: false,
    };
  }

  let lightningAddress: string | null = null;
  try {
    const profile = JSON.parse(profileEvent.content) as {
      lud16?: string;
      lud06?: string;
    };
    const lud16 = profile.lud16?.trim();
    lightningAddress = lud16 && lud16.includes("@") ? lud16 : null;
  } catch {
    /* ignore malformed profile */
  }

  // getZapEndpoint only returns a callback when the LN service advertises
  // NIP-57 (allowsNostr + nostrPubkey). A plain-but-valid lightning address
  // returns "" here — in that case we still build an LNURL-pay fallback.
  let zapEndpoint: string | null = null;
  try {
    const { getZapEndpoint } = await import("nostr-tools/nip57");
    zapEndpoint = (await getZapEndpoint(profileEvent)) || null;
  } catch {
    zapEndpoint = null;
  }
  if (!lightningAddress) {
    lightningAddress = lightningAddressFromZapEndpoint(zapEndpoint);
  }

  const payEndpoint = zapEndpoint ?? lnurlpUrlFromAddress(lightningAddress);
  return {
    lightningAddress,
    zapEndpoint,
    payEndpoint,
    supportsNostr: !!zapEndpoint,
  };
}

export function isWeblnAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.webln?.sendPayment === "function"
  );
}

export function buildZapRequest(opts: {
  senderPubkey: string;
  recipientPubkey: string;
  sats: number;
  comment: string;
}): UnsignedEvent {
  return {
    kind: ZAP_REQUEST_KIND,
    pubkey: opts.senderPubkey,
    created_at: Math.floor(Date.now() / 1000),
    content: opts.comment,
    tags: [
      ["p", opts.recipientPubkey],
      ["amount", String(opts.sats * 1000)],
      ["relays", ...DEFAULT_RELAYS],
      ["client", "La Crypta Dev"],
    ],
  };
}

/**
 * Ephemeral signer for anonymous zaps — used when no one is logged in so the
 * zap request still carries a valid signature (the sender shows as anonymous).
 */
export async function createAnonymousSigner(): Promise<UserSigner> {
  const { generateSecretKey, getPublicKey, finalizeEvent } = await import(
    "nostr-tools/pure"
  );
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  return {
    pubkey: pk,
    async signEvent(event) {
      return finalizeEvent(
        {
          kind: event.kind,
          tags: event.tags,
          content: event.content,
          created_at: event.created_at,
        },
        sk,
      );
    },
  };
}

/**
 * Ask the recipient's LNURL service for a BOLT11 invoice. Pass `zapRequest`
 * for a real NIP-57 zap, or just a `comment` for a plain LNURL-pay payment to
 * a lightning address that doesn't advertise zaps.
 */
export async function requestZapInvoice(opts: {
  endpoint: string;
  sats: number;
  zapRequest?: SignedEvent | null;
  comment?: string;
}): Promise<string> {
  const res = await fetch("/api/lnurl-invoice", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      endpoint: opts.endpoint,
      amount: String(opts.sats * 1000),
      nostr: opts.zapRequest ? JSON.stringify(opts.zapRequest) : undefined,
      comment: opts.comment?.trim() || undefined,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    pr?: string;
    reason?: string;
  };
  if (!res.ok || !body.pr) {
    throw new Error(body.reason || "El servicio Lightning no devolvió invoice.");
  }
  return body.pr;
}

export async function payInvoiceWithWebln(
  invoice: string,
): Promise<{ preimage?: string }> {
  if (!window.webln?.sendPayment) {
    throw new Error("No detecté WebLN en este navegador.");
  }
  await window.webln.enable?.();
  return window.webln.sendPayment(invoice);
}

/* ─────────────────────────── received zaps wall ─────────────────────────── */

export type ReceivedZap = {
  /** Zap receipt (kind 9735) event id — used for dedup. */
  id: string;
  /** Pubkey of who sent the zap (from the embedded zap request). */
  senderPubkey: string | null;
  /** Amount in sats, or null if it couldn't be determined. */
  amountSats: number | null;
  /** Free-text message the sender attached to the zap. */
  comment: string;
  /** Receipt `created_at` in unix seconds. */
  createdAt: number;
};

/** Best-effort BOLT11 amount parser (`lnbc<amount><multiplier>`) → sats. */
function amountSatsFromBolt11(invoice?: string | null): number | null {
  if (!invoice) return null;
  const match = /^ln(?:bc|tb|bcrt)(\d+)([munp]?)/i.exec(invoice.trim());
  if (!match) return null;
  const amount = parseInt(match[1]!, 10);
  if (!Number.isFinite(amount)) return null;
  const unit = match[2]!.toLowerCase();
  const btc =
    unit === "m"
      ? amount * 1e-3
      : unit === "u"
        ? amount * 1e-6
        : unit === "n"
          ? amount * 1e-9
          : unit === "p"
            ? amount * 1e-12
            : amount; // no multiplier → whole BTC
  return Math.round(btc * 1e8);
}

/**
 * Parse a NIP-57 zap receipt into a displayable record. The sender and the
 * comment live inside the `description` tag (the original kind-9734 request),
 * not on the receipt itself (which the LNURL server signs).
 */
export function parseZapReceipt(receipt: SignedEvent): ReceivedZap | null {
  let senderPubkey: string | null = null;
  let comment = "";
  let amountSats: number | null = null;

  const description = receipt.tags.find((t) => t[0] === "description")?.[1];
  if (description) {
    try {
      const request = JSON.parse(description) as Partial<SignedEvent>;
      if (typeof request.pubkey === "string") senderPubkey = request.pubkey;
      if (typeof request.content === "string") comment = request.content;
      const amountTag = request.tags?.find((t) => t[0] === "amount")?.[1];
      if (amountTag && /^\d+$/.test(amountTag)) {
        amountSats = Math.round(parseInt(amountTag, 10) / 1000);
      }
    } catch {
      /* malformed description — fall through to receipt tags */
    }
  }

  if (amountSats == null) {
    amountSats = amountSatsFromBolt11(
      receipt.tags.find((t) => t[0] === "bolt11")?.[1],
    );
  }
  // `P` (capital) optionally carries the sender pubkey on the receipt itself.
  if (!senderPubkey) {
    senderPubkey = receipt.tags.find((t) => t[0] === "P")?.[1] ?? null;
  }

  return {
    id: receipt.id,
    senderPubkey,
    amountSats,
    comment,
    createdAt: receipt.created_at,
  };
}

/**
 * Live-subscribe to zap receipts addressed to `recipientPubkey`. Calls
 * `onZap` for every receipt (historical + new), keeping the relay
 * subscription open until the returned cleanup function runs.
 */
export function subscribeToReceivedZaps(
  recipientPubkey: string,
  onZap: (zap: ReceivedZap) => void,
  opts: { limit?: number } = {},
): () => void {
  let closed = false;
  let teardown: (() => void) | null = null;

  void (async () => {
    const { SimplePool } = await import("nostr-tools/pool");
    if (closed) return;
    const pool = new SimplePool();
    const closer = pool.subscribe(
      DEFAULT_RELAYS,
      {
        kinds: [ZAP_RECEIPT_KIND],
        "#p": [recipientPubkey],
        limit: opts.limit ?? 100,
      },
      {
        onevent(ev) {
          const parsed = parseZapReceipt(ev as SignedEvent);
          if (parsed) onZap(parsed);
        },
        oneose() {
          // Keep the subscription open for live zaps — do not close here.
        },
      },
    );
    teardown = () => {
      closer.close();
      try {
        pool.close(DEFAULT_RELAYS);
      } catch {
        /* noop */
      }
    };
    if (closed) teardown();
  })();

  return () => {
    closed = true;
    teardown?.();
  };
}
