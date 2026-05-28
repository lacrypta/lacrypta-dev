"use client";

import { DEFAULT_RELAYS } from "./nostrRelayConfig";
import type { SignedEvent, UnsignedEvent, UserSigner } from "./nostrSigner";

export type PrizeZapTarget = {
  hackathonId: string;
  projectId: string;
  projectName: string;
  position: number;
  recipientPubkey: string;
  recipientLightningAddress?: string | null;
  recipientZapEndpoint?: string | null;
  sats: number;
};

export type PrizeZapRecord = PrizeZapTarget & {
  adminPubkey: string;
  paidAt: number;
  invoice: string;
  preimage?: string;
  zapRequestId: string;
};

export type PrizeZapReceiptRecord = PrizeZapTarget & {
  adminPubkey: string;
  checkedAt: number;
  receipt: SignedEvent;
};

export type PrizeZapProgressStep =
  | "checking"
  | "webln"
  | "endpoint"
  | "signing"
  | "invoice"
  | "paying"
  | "recording"
  | "done";

export type PrizeZapProgressStatus = "active" | "done" | "error";

export type PrizeZapProgress = {
  step: PrizeZapProgressStep;
  status: PrizeZapProgressStatus;
  detail?: string;
  invoice?: string;
  zapEndpoint?: string;
};

export type PrizeZapProgressHandler = (
  progress: PrizeZapProgress,
) => void;

function isUserCancelledPayment(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /cancel|reject|denied|declin|abort|user/i.test(message);
}

export type PrizeZapRecipientPaymentInfo = {
  lightningAddress: string | null;
  zapEndpoint: string | null;
  source?: "lud16" | "zap-endpoint" | "none";
};

const STORAGE_PREFIX = "labs:prize-zap:";
const RECEIPT_STORAGE_PREFIX = "labs:prize-zap-receipt:";
const ZAP_KIND = 9735;
const ZAP_REQUEST_KIND = 9734;

declare global {
  interface Window {
    webln?: {
      enable?: () => Promise<void>;
      sendPayment?: (invoice: string) => Promise<{ preimage?: string }>;
    };
  }
}

function storageKey(target: PrizeZapTarget, adminPubkey: string): string {
  return `${STORAGE_PREFIX}${target.hackathonId}:${target.projectId}:${target.recipientPubkey}:${target.sats}:${adminPubkey}`;
}

function receiptStorageKey(target: PrizeZapTarget, adminPubkey: string): string {
  return `${RECEIPT_STORAGE_PREFIX}${target.hackathonId}:${target.projectId}:${target.recipientPubkey}:${target.sats}:${adminPubkey}`;
}

export function getLocalPrizeZap(
  target: PrizeZapTarget,
  adminPubkey: string,
): PrizeZapRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(target, adminPubkey));
    return raw ? (JSON.parse(raw) as PrizeZapRecord) : null;
  } catch {
    return null;
  }
}

function setLocalPrizeZap(record: PrizeZapRecord) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    storageKey(record, record.adminPubkey),
    JSON.stringify(record),
  );
}

export function getLocalPrizeZapReceipt(
  target: PrizeZapTarget,
  adminPubkey: string,
): SignedEvent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(receiptStorageKey(target, adminPubkey));
    if (!raw) return null;
    return (JSON.parse(raw) as PrizeZapReceiptRecord).receipt;
  } catch {
    return null;
  }
}

export function setLocalPrizeZapReceipt(
  target: PrizeZapTarget,
  adminPubkey: string,
  receipt: SignedEvent,
) {
  if (typeof window === "undefined") return;
  const record: PrizeZapReceiptRecord = {
    ...target,
    adminPubkey,
    checkedAt: Math.floor(Date.now() / 1000),
    receipt,
  };
  window.localStorage.setItem(
    receiptStorageKey(target, adminPubkey),
    JSON.stringify(record),
  );
}

function trackingTag(target: PrizeZapTarget): string {
  return `lacrypta-prize:${target.hackathonId}:${target.projectId}`;
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

async function findZapEndpoint(recipientPubkey: string): Promise<string> {
  const profileEvent = await fetchLatestProfileEvent(recipientPubkey);
  if (!profileEvent) {
    throw new Error("No encontré el perfil Nostr del ganador.");
  }
  const { getZapEndpoint } = await import("nostr-tools/nip57");
  const endpoint = await getZapEndpoint(profileEvent);
  if (!endpoint) {
    throw new Error("El perfil del ganador no tiene zaps NIP-57 habilitados.");
  }
  return endpoint;
}

export async function getPrizeZapRecipientPaymentInfo(
  recipientPubkey: string,
): Promise<PrizeZapRecipientPaymentInfo> {
  const profileEvent = await fetchLatestProfileEvent(recipientPubkey);
  if (!profileEvent) {
    return { lightningAddress: null, zapEndpoint: null, source: "none" };
  }

  let lightningAddress: string | null = null;
  let source: PrizeZapRecipientPaymentInfo["source"] = "none";
  try {
    const profile = JSON.parse(profileEvent.content) as {
      lud16?: string;
      lud06?: string;
    };
    const lud16 = profile.lud16?.trim();
    lightningAddress = lud16 && lud16.includes("@") ? lud16 : null;
    if (lightningAddress) source = "lud16";
  } catch {
    /* ignore malformed profile */
  }

  const { getZapEndpoint } = await import("nostr-tools/nip57");
  const zapEndpoint = await getZapEndpoint(profileEvent);
  if (!lightningAddress) {
    lightningAddress = lightningAddressFromZapEndpoint(zapEndpoint);
    if (lightningAddress) source = "zap-endpoint";
  }
  return { lightningAddress, zapEndpoint, source };
}

function buildPrizeZapRequest(
  target: PrizeZapTarget,
  adminPubkey: string,
): UnsignedEvent {
  return {
    kind: ZAP_REQUEST_KIND,
    pubkey: adminPubkey,
    created_at: Math.floor(Date.now() / 1000),
    content: `Premio La Crypta Commerce: #${target.position} ${target.projectName}`,
    tags: [
      ["p", target.recipientPubkey],
      ["amount", String(target.sats * 1000)],
      ["relays", ...DEFAULT_RELAYS],
      ["t", "lacrypta-prize"],
      ["h", target.hackathonId],
      ["project", target.projectId],
      ["position", String(target.position)],
      ["tracking", trackingTag(target)],
    ],
  };
}

function isPrizeReceipt(
  ev: SignedEvent,
  target: PrizeZapTarget,
  adminPubkey: string,
): boolean {
  const bolt11 = ev.tags.find((t) => t[0] === "bolt11")?.[1];
  const description = ev.tags.find((t) => t[0] === "description")?.[1];
  if (!bolt11 || !description) return false;
  try {
    const zapRequest = JSON.parse(description) as SignedEvent;
    if (zapRequest.pubkey !== adminPubkey) return false;
    const amount = zapRequest.tags.find((t) => t[0] === "amount")?.[1];
    const p = zapRequest.tags.find((t) => t[0] === "p")?.[1];
    const position = zapRequest.tags.find((t) => t[0] === "position")?.[1];
    const tracking = zapRequest.tags.find((t) => t[0] === "tracking")?.[1];
    return (
      amount === String(target.sats * 1000) &&
      p === target.recipientPubkey &&
      (!position || position === String(target.position)) &&
      tracking === trackingTag(target)
    );
  } catch {
    return false;
  }
}

export async function findPrizeZapReceipt(
  target: PrizeZapTarget,
  adminPubkey: string,
): Promise<SignedEvent | null> {
  const { SimplePool } = await import("nostr-tools/pool");
  const pool = new SimplePool();
  const events: SignedEvent[] = [];
  const closer = pool.subscribe(
    DEFAULT_RELAYS,
    {
      kinds: [ZAP_KIND],
      "#p": [target.recipientPubkey],
      "#P": [adminPubkey],
      since: Math.floor(new Date("2026-05-26T00:00:00Z").getTime() / 1000),
      limit: 25,
    },
    {
      onevent(ev) {
        events.push(ev as SignedEvent);
      },
      oneose() {
        closer.close();
      },
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
  const receipt = events.find((ev) => isPrizeReceipt(ev, target, adminPubkey)) ?? null;
  if (receipt) setLocalPrizeZapReceipt(target, adminPubkey, receipt);
  return receipt;
}

export async function payPrizeZap(
  target: PrizeZapTarget,
  signer: UserSigner,
  onProgress?: PrizeZapProgressHandler,
): Promise<PrizeZapRecord> {
  const progress = (
    step: PrizeZapProgressStep,
    status: PrizeZapProgressStatus,
    detail?: string,
    invoice?: string,
    zapEndpoint?: string,
  ) => onProgress?.({ step, status, detail, invoice, zapEndpoint });

  progress("checking", "active", "Buscando pago existente");
  const local = getLocalPrizeZap(target, signer.pubkey);
  if (local) {
    progress("checking", "done", "Registro local encontrado");
    progress("done", "done", "Pago registrado");
    return local;
  }

  const receipt = await findPrizeZapReceipt(target, signer.pubkey);
  if (receipt) {
    progress("checking", "done", "Recibo NIP-57 encontrado");
    const record: PrizeZapRecord = {
      ...target,
      adminPubkey: signer.pubkey,
      paidAt: receipt.created_at,
      invoice: receipt.tags.find((t) => t[0] === "bolt11")?.[1] ?? "",
      zapRequestId: JSON.parse(
        receipt.tags.find((t) => t[0] === "description")?.[1] ?? "{}",
      ).id,
    };
    setLocalPrizeZap(record);
    progress("done", "done", "Pago confirmado");
    return record;
  }
  progress("checking", "done", "No hay pago previo");

  progress("endpoint", "active", "Buscando endpoint NIP-57");
  const endpoint =
    target.recipientZapEndpoint || (await findZapEndpoint(target.recipientPubkey));
  progress("endpoint", "done", "Endpoint encontrado", undefined, endpoint);

  progress("signing", "active", "Firmando zap request");
  const zapRequest = await signer.signEvent(
    buildPrizeZapRequest(target, signer.pubkey),
  );
  progress("signing", "done", `Zap request ${zapRequest.id.slice(0, 12)}…`);

  progress(
    "invoice",
    "active",
    `Solicitando invoice a ${target.recipientLightningAddress || "la lightning address"}`,
  );
  const invoiceRes = await fetch("/api/lnurl-invoice", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      endpoint,
      amount: String(target.sats * 1000),
      nostr: JSON.stringify(zapRequest),
    }),
  });
  const invoiceBody = (await invoiceRes.json().catch(() => ({}))) as {
    pr?: string;
    reason?: string;
  };
  if (!invoiceRes.ok) {
    progress("invoice", "error", invoiceBody.reason || "Invoice rechazada");
    throw new Error(
      invoiceBody.reason || "El servicio de zaps rechazó la invoice.",
    );
  }
  if (!invoiceBody.pr) {
    progress("invoice", "error", invoiceBody.reason || "Sin invoice");
    throw new Error(
      invoiceBody.reason || "El servicio de zaps no devolvió invoice.",
    );
  }
  progress("invoice", "done", "Invoice recibida", invoiceBody.pr, endpoint);

  if (!window.webln?.sendPayment) {
    progress("webln", "error", "No se detectó WebLN", invoiceBody.pr, endpoint);
    throw new Error(
      "No detecté WebLN. Pagá la invoice con una wallet compatible.",
    );
  }
  progress("webln", "active", "Habilitando wallet WebLN", invoiceBody.pr, endpoint);
  try {
    await window.webln.enable?.();
  } catch (error) {
    const detail = isUserCancelledPayment(error)
      ? "Cancelado"
      : "No se pudo habilitar WebLN";
    progress("webln", "error", detail, invoiceBody.pr, endpoint);
    throw error;
  }
  progress("webln", "done", "Wallet lista", invoiceBody.pr, endpoint);

  progress("paying", "active", "Esperando pago en la wallet", invoiceBody.pr, endpoint);
  let payment: { preimage?: string };
  try {
    payment = await window.webln.sendPayment(invoiceBody.pr);
  } catch (error) {
    const detail = isUserCancelledPayment(error)
      ? "Cancelado"
      : "La wallet no completó el pago";
    progress("paying", "error", detail, invoiceBody.pr, endpoint);
    throw error;
  }
  progress("paying", "done", "Invoice pagada", invoiceBody.pr, endpoint);

  progress("recording", "active", "Guardando registro local");
  const record: PrizeZapRecord = {
    ...target,
    adminPubkey: signer.pubkey,
    paidAt: Math.floor(Date.now() / 1000),
    invoice: invoiceBody.pr,
    preimage: payment.preimage,
    zapRequestId: zapRequest.id,
  };
  setLocalPrizeZap(record);
  progress("recording", "done", "Registro guardado");
  progress("done", "done", "Pago completado");
  return record;
}
