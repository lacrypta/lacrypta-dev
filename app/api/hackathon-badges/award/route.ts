import { NextResponse } from "next/server";
import { getHackathon } from "@/lib/hackathons";
import type { SignedEvent } from "@/lib/nostrSigner";
import type { HackathonBadgeCatalogBadge } from "@/lib/hackathonBadges";
import {
  HACKATHON_BADGE_DEFINITION_KIND,
  LACRYPTA_NOSTR_CLIENT_TAG,
  normalizeHackathonBadgeId,
} from "@/lib/hackathonBadges";

type AwardRecipient = {
  pubkey?: string;
  name?: string;
  nip05?: string;
};

type AwardBody = {
  hackathonId?: string;
  badge?: HackathonBadgeCatalogBadge;
  recipients?: AwardRecipient[];
  request?: SignedEvent;
};

const MAX_RECIPIENTS_PER_REQUEST = 32;

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

function cleanPubkey(value: unknown): string {
  return typeof value === "string" && /^[0-9a-f]{64}$/iu.test(value.trim())
    ? value.trim().toLowerCase()
    : "";
}

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function parseRecipients(value: unknown): Required<AwardRecipient>[] {
  if (!Array.isArray(value)) return [];
  const byPubkey = new Map<string, Required<AwardRecipient>>();
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;
    const pubkey = cleanPubkey(rec.pubkey);
    if (!pubkey) continue;
    byPubkey.set(pubkey, {
      pubkey,
      name: cleanText(rec.name, 80),
      nip05: cleanText(rec.nip05, 120).toLowerCase(),
    });
  }
  return [...byPubkey.values()];
}

function parseBadge(value: unknown): HackathonBadgeCatalogBadge | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const badge = value as Partial<HackathonBadgeCatalogBadge>;
  const id = normalizeHackathonBadgeId(badge.id ?? "");
  const definition = cleanText(badge.definition, 220);
  const parts = definition.split(":");
  if (
    !id ||
    parts.length < 3 ||
    parts[0] !== String(HACKATHON_BADGE_DEFINITION_KIND) ||
    !cleanPubkey(parts[1])
  ) {
    return null;
  }
  return {
    id,
    category: badge.category ?? "specials",
    name: cleanText(badge.name, 100) || id,
    description: cleanText(badge.description, 240),
    tone: badge.tone ?? "nostr",
    icon: badge.icon ?? "award",
    criteria: badge.criteria ?? { type: "manual" },
    definition,
    image: cleanText(badge.image, 300) || undefined,
    thumb: cleanText(badge.thumb, 300) || undefined,
  };
}

export async function POST(req: Request) {
  let body: AwardBody;
  try {
    body = (await req.json()) as AwardBody;
  } catch {
    return jsonError("Body JSON invalido.");
  }

  const hackathonId = body.hackathonId?.trim();
  const request = body.request;
  const badge = parseBadge(body.badge);
  const recipients = parseRecipients(body.recipients);
  if (!hackathonId) return jsonError("Falta hackathonId.");
  if (!request) return jsonError("Falta request firmado.");
  if (!badge) return jsonError("Badge invalido.");
  if (recipients.length === 0) return jsonError("Faltan receptores.");
  if (recipients.length > MAX_RECIPIENTS_PER_REQUEST) {
    return jsonError(`Maximo ${MAX_RECIPIENTS_PER_REQUEST} receptores.`);
  }

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
        "El usuario logueado debe coincidir con NEXT_PUBLIC_LACRYPTA_ADMIN_NPUB.",
        403,
      );
    }
    if (Math.abs(Math.floor(Date.now() / 1000) - request.created_at) > 10 * 60) {
      return jsonError("Request expirado.", 401);
    }
    if (
      !requestHasTag(request, "action", "award-hackathon-badge") ||
      !requestHasTag(request, "hackathon", hackathonId) ||
      !requestHasTag(request, "badge", badge.id)
    ) {
      return jsonError("Request no autorizado para otorgar este badge.", 401);
    }
    for (const recipient of recipients) {
      if (!requestHasTag(request, "p", recipient.pubkey)) {
        return jsonError(`Request no autoriza ${recipient.pubkey}.`, 401);
      }
    }

    const createdAt = Math.floor(Date.now() / 1000);
    const events = recipients.map((recipient) =>
      finalizeEvent(
        {
          kind: 8,
          created_at: createdAt,
          content: `${badge.name} ${hackathon.name}: ${recipient.name || recipient.nip05 || recipient.pubkey.slice(0, 8)}`,
          tags: [
            ["a", badge.definition],
            ["p", recipient.pubkey],
            ["hackathon", hackathon.id],
            ["badge", badge.id],
            ["category", badge.category],
            ["client", LACRYPTA_NOSTR_CLIENT_TAG],
            ["name", recipient.name],
            ["nip05", recipient.nip05],
          ].filter((tag) => tag[1]),
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
    console.error("[api/hackathon-badges/award] failed", error);
    return jsonError("No se pudo otorgar badge.", 500);
  }
}
