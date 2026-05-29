import { NextResponse } from "next/server";
import { getHackathon } from "@/lib/hackathons";
import type { SignedEvent } from "@/lib/nostrSigner";
import {
  buildHackathonBadgeCatalogEvent,
  buildHackathonBadgeDefinitionEvents,
} from "@/lib/hackathonBadges";

type BootstrapBody = {
  hackathonId?: string;
  request?: SignedEvent;
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

async function getBackendSecret() {
  const nsec = process.env.LACRYPTA_NSEC;
  if (!nsec) throw new Error("Falta LACRYPTA_NSEC.");
  const { decode } = await import("nostr-tools/nip19");
  const decoded = decode(nsec);
  if (decoded.type !== "nsec") throw new Error("LACRYPTA_NSEC invalido.");
  return decoded.data as Uint8Array;
}

async function getAdminPubkey(): Promise<string> {
  const npub = process.env.NEXT_PUBLIC_LACRYPTA_NPUB;
  if (!npub) throw new Error("Falta NEXT_PUBLIC_LACRYPTA_NPUB.");
  const { decode } = await import("nostr-tools/nip19");
  const decoded = decode(npub);
  if (decoded.type !== "npub") {
    throw new Error("NEXT_PUBLIC_LACRYPTA_NPUB invalido.");
  }
  return decoded.data as string;
}

function requestHasTag(request: SignedEvent, name: string, value: string): boolean {
  return request.tags.some((tag) => tag[0] === name && tag[1] === value);
}

export async function POST(req: Request) {
  let body: BootstrapBody;
  try {
    body = (await req.json()) as BootstrapBody;
  } catch {
    return jsonError("Body JSON invalido.");
  }

  const hackathonId = body.hackathonId?.trim();
  const request = body.request;
  if (!hackathonId) return jsonError("Falta hackathonId.");
  if (!request) return jsonError("Falta request firmado.");

  const hackathon = getHackathon(hackathonId);
  if (!hackathon) return jsonError("Hackaton no encontrada.", 404);

  try {
    const { finalizeEvent, getPublicKey, verifyEvent } = await import(
      "nostr-tools/pure"
    );
    const secret = await getBackendSecret();
    const issuerPubkey = getPublicKey(secret);
    const adminPubkey = await getAdminPubkey();
    if (!verifyEvent(request)) {
      return jsonError("Request Nostr invalido.", 401);
    }
    if (request.pubkey !== adminPubkey) {
      return jsonError(
        "El usuario logueado debe coincidir con NEXT_PUBLIC_LACRYPTA_NPUB.",
        403,
      );
    }
    if (Math.abs(Math.floor(Date.now() / 1000) - request.created_at) > 10 * 60) {
      return jsonError("Request expirado.", 401);
    }
    if (
      !requestHasTag(request, "action", "bootstrap-hackathon-badges") ||
      !requestHasTag(request, "hackathon", hackathonId)
    ) {
      return jsonError("Request no autorizado para este bootstrap.", 401);
    }

    const createdAt = Math.floor(Date.now() / 1000);
    const unsignedEvents = [
      ...buildHackathonBadgeDefinitionEvents(
        issuerPubkey,
        hackathon.id,
        undefined,
        createdAt,
      ),
      buildHackathonBadgeCatalogEvent(
        issuerPubkey,
        hackathon.id,
        hackathon.name,
        undefined,
        createdAt,
      ),
    ];
    const events = unsignedEvents.map((event) =>
      finalizeEvent(
        {
          kind: event.kind,
          created_at: event.created_at,
          tags: event.tags,
          content: event.content,
        },
        secret,
      ),
    );

    return NextResponse.json({
      issuerPubkey,
      events,
      count: events.length,
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "No se pudo generar bootstrap.",
      500,
    );
  }
}
