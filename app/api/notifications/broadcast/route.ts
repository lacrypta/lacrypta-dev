import { NextResponse } from "next/server";
import type { SignedEvent } from "@/lib/nostrSigner";
import {
  BROADCAST_KIND,
  buildBroadcastTags,
  normalizeBroadcastHref,
  serializeBroadcastContent,
} from "@/lib/notifications/broadcast";

/**
 * Admin-only: sign a broadcast notification with LACRYPTA_NSEC so it reaches
 * every user (author === publisher → trusted by all). Gated by a NIP-27235
 * request whose signer must equal NEXT_PUBLIC_LACRYPTA_ADMIN_NPUB — same pattern
 * as the soldiers-ranking / badge-award official routes.
 */

type BroadcastBody = {
  request?: SignedEvent;
  title?: string;
  body?: string;
  href?: string;
};

const ACTION = "broadcast-notification";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

async function getBackendSecret(): Promise<Uint8Array> {
  const nsec = process.env.LACRYPTA_NSEC;
  if (!nsec) throw new Error("Falta LACRYPTA_NSEC.");
  const { decode } = await import("nostr-tools/nip19");
  const decoded = decode(nsec);
  if (decoded.type !== "nsec") throw new Error("LACRYPTA_NSEC invalido.");
  return decoded.data as Uint8Array;
}

async function getAdminPubkey(): Promise<string> {
  const npub =
    process.env.NEXT_PUBLIC_LACRYPTA_ADMIN_NPUB ||
    process.env.NEXT_PUBLIC_LACRYPTA_NPUB;
  if (!npub) throw new Error("Falta NEXT_PUBLIC_LACRYPTA_ADMIN_NPUB.");
  const { decode } = await import("nostr-tools/nip19");
  const decoded = decode(npub);
  if (decoded.type !== "npub") {
    throw new Error("NEXT_PUBLIC_LACRYPTA_ADMIN_NPUB invalido.");
  }
  return decoded.data as string;
}

function requestHasTag(request: SignedEvent, name: string, value: string): boolean {
  return request.tags.some((tag) => tag[0] === name && tag[1] === value);
}

export async function POST(req: Request) {
  let body: BroadcastBody;
  try {
    body = (await req.json()) as BroadcastBody;
  } catch {
    return jsonError("Body JSON invalido.");
  }

  const request = body.request;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const message = typeof body.body === "string" ? body.body.trim() : "";
  const href = normalizeBroadcastHref(body.href);

  if (!request) return jsonError("Falta request firmado.");
  if (!title) return jsonError("Falta el título.");
  if (typeof body.href === "string" && body.href.trim() && !href) {
    return jsonError("El link debe ser una ruta interna (empieza con /).");
  }

  try {
    const { finalizeEvent, getPublicKey, verifyEvent } = await import(
      "nostr-tools/pure"
    );
    const secret = await getBackendSecret();
    const issuerPubkey = getPublicKey(secret);
    const adminPubkey = await getAdminPubkey();

    if (!verifyEvent(request)) return jsonError("Request Nostr invalido.", 401);
    if (request.pubkey !== adminPubkey) {
      return jsonError(
        "El usuario logueado debe coincidir con NEXT_PUBLIC_LACRYPTA_ADMIN_NPUB.",
        403,
      );
    }
    if (Math.abs(Math.floor(Date.now() / 1000) - request.created_at) > 10 * 60) {
      return jsonError("Request expirado.", 401);
    }
    if (!requestHasTag(request, "action", ACTION)) {
      return jsonError("Request no autorizado para enviar la notificación.", 401);
    }

    const signed = finalizeEvent(
      {
        kind: BROADCAST_KIND,
        created_at: Math.floor(Date.now() / 1000),
        content: serializeBroadcastContent({ title, body: message, href }),
        tags: buildBroadcastTags(),
      },
      secret,
    );

    return NextResponse.json({ issuerPubkey, event: signed });
  } catch (error) {
    console.error("[api/notifications/broadcast] failed", error);
    return jsonError("No se pudo crear la notificación.", 500);
  }
}
