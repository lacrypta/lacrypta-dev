/**
 * Admin broadcast notifications — "from La Crypta to every user".
 *
 * Isomorphic (no `"use client"`, no top-level client imports) so the server
 * route can import the constants/builders safely. The client send helper
 * lazy-imports the publish transport, and is only ever called client-side.
 *
 * A broadcast is a regular kind-1616 event authored by La Crypta's publisher key
 * (signed server-side with LACRYPTA_NSEC) with a `lacrypta-dev-broadcast` `t`
 * tag and NO `#p` recipient — so every user's engine picks it up via
 * `authors:[publisher]`, and the trust model trusts it (author === publisher).
 */
import type { SignedEvent, UnsignedEvent, UserSigner } from "../nostrSigner";

export const BROADCAST_KIND = 1616;
export const BROADCAST_TAG = "lacrypta-dev-broadcast";

export type BroadcastInput = {
  title: string;
  body?: string;
  /** Optional INTERNAL path (must start with "/"), e.g. "/hackathons". */
  href?: string;
};

/** Accept only same-origin internal paths — never external URLs in a trusted broadcast. */
export function normalizeBroadcastHref(href: unknown): string | undefined {
  if (typeof href !== "string") return undefined;
  const trimmed = href.trim();
  if (!trimmed) return undefined;
  // Single leading slash, not "//" (protocol-relative) — internal route only.
  if (!/^\/(?!\/)/.test(trimmed)) return undefined;
  return trimmed.slice(0, 300);
}

export function buildBroadcastTags(): string[][] {
  return [
    ["t", BROADCAST_TAG],
    ["client", "La Crypta Dev"],
  ];
}

export function serializeBroadcastContent(input: BroadcastInput): string {
  return JSON.stringify({
    title: input.title.trim().slice(0, 120),
    body: input.body?.trim().slice(0, 500) || "",
    href: normalizeBroadcastHref(input.href),
  });
}

export function parseBroadcastContent(content: string): BroadcastInput | null {
  try {
    const p = JSON.parse(content) as {
      title?: unknown;
      body?: unknown;
      href?: unknown;
    };
    if (typeof p.title !== "string" || !p.title.trim()) return null;
    return {
      title: p.title.trim(),
      body:
        typeof p.body === "string" && p.body.trim() ? p.body.trim() : undefined,
      href: normalizeBroadcastHref(p.href),
    };
  } catch {
    return null;
  }
}

/**
 * Admin flow: sign a NIP-27235 request, have the server sign the broadcast with
 * LACRYPTA_NSEC, then publish it. Throws if no relay accepted it.
 */
export async function requestBroadcastNotification(
  signer: UserSigner,
  input: BroadcastInput,
): Promise<{ event: SignedEvent; relays: { relay: string; ok: boolean; error?: string }[] }> {
  const request: UnsignedEvent = {
    kind: 27235,
    pubkey: signer.pubkey,
    created_at: Math.floor(Date.now() / 1000),
    content: `Broadcast: ${input.title.trim()}`,
    tags: [
      ["u", "/api/notifications/broadcast"],
      ["method", "POST"],
      ["action", "broadcast-notification"],
    ],
  };
  const signedRequest = await signer.signEvent(request);

  const res = await fetch("/api/notifications/broadcast", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      request: signedRequest,
      title: input.title,
      body: input.body,
      href: input.href,
    }),
  });
  const data = (await res.json()) as { event?: SignedEvent; error?: string };
  if (!res.ok) throw new Error(data.error || "No se pudo crear la notificación.");
  if (!data.event) throw new Error("El backend no devolvió el evento firmado.");

  const { publishSignedEventsToRelays } = await import("../hackathonBadgeClient");
  const results = await publishSignedEventsToRelays([data.event]);
  if (!results.some((r) => r.ok)) {
    throw new Error("Ningún relay aceptó la notificación.");
  }
  return { event: data.event, relays: results };
}
