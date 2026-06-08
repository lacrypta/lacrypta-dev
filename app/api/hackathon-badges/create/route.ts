import { NextResponse } from "next/server";
import { getHackathon } from "@/lib/hackathons";
import { getCachedHackathonBadgeCatalogSnapshot } from "@/lib/hackathonBadgeCache";
import type { SignedEvent } from "@/lib/nostrSigner";
import {
  HACKATHON_BADGE_SCHEMA_VERSION,
  buildHackathonBadgeCatalogEvent,
  buildHackathonBadgeDefinitionEvents,
  catalogBadgeToTemplate,
  ensureHackathonBadgeCategories,
  mergeHackathonBadgeTemplates,
  normalizeHackathonBadgeCategoryId,
  normalizeHackathonBadgeTemplate,
  type HackathonBadgeCatalog,
  type HackathonBadgeCategory,
  type HackathonBadgeCriterion,
  type HackathonBadgeTemplate,
  type HackathonBadgeTone,
} from "@/lib/hackathonBadges";

type CreateBody = {
  hackathonId?: string;
  request?: SignedEvent;
  badges?: HackathonBadgeTemplate[];
  categories?: HackathonBadgeCategory[];
};

const MAX_BADGES_PER_REQUEST = 32;

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function trimField(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function parseCriterion(value: unknown): HackathonBadgeCriterion {
  if (!isRecord(value)) return { type: "manual" };
  if (value.type === "rank" && typeof value.position === "number") {
    return { type: "rank", position: Math.max(1, Math.floor(value.position)) };
  }
  if (
    value.type === "rank-range" &&
    typeof value.min === "number" &&
    typeof value.max === "number"
  ) {
    const min = Math.max(1, Math.floor(value.min));
    const max = Math.max(min, Math.floor(value.max));
    return { type: "rank-range", min, max };
  }
  if (value.type === "first-submit") return { type: "first-submit" };
  if (value.type === "streak" && typeof value.count === "number") {
    return { type: "streak", count: Math.max(1, Math.floor(value.count)) };
  }
  return {
    type: "manual",
    juror: trimField(value.juror, 48) || undefined,
  };
}

function parseBadgeTemplate(value: unknown): HackathonBadgeTemplate {
  if (!isRecord(value)) throw new Error("Badge invalido.");
  return normalizeHackathonBadgeTemplate({
    id: trimField(value.id, 96),
    category: normalizeHackathonBadgeCategoryId(trimField(value.category, 96)),
    name: trimField(value.name, 80),
    description: trimField(value.description, 220),
    tone: trimField(value.tone, 24) as HackathonBadgeTone,
    icon: trimField(value.icon, 32) || "award",
    criteria: parseCriterion(value.criteria),
    image: trimField(value.image, 300) || undefined,
    thumb: trimField(value.thumb, 300) || undefined,
  });
}

function parseCategory(value: unknown): HackathonBadgeCategory | null {
  if (!isRecord(value)) return null;
  const id = normalizeHackathonBadgeCategoryId(trimField(value.id, 96));
  if (!id) return null;
  return {
    id,
    label: trimField(value.label, 60) || id,
    description: trimField(value.description, 160) || undefined,
  };
}

function existingTemplates(catalog: HackathonBadgeCatalog | null | undefined) {
  if (!catalog || catalog.version !== HACKATHON_BADGE_SCHEMA_VERSION) return [];
  if (!Array.isArray(catalog.badges)) return [];
  return catalog.badges.map(catalogBadgeToTemplate);
}

function existingCategories(catalog: HackathonBadgeCatalog | null | undefined) {
  if (!catalog || catalog.version !== HACKATHON_BADGE_SCHEMA_VERSION) return [];
  if (!Array.isArray(catalog.categories)) return [];
  return catalog.categories
    .map(parseCategory)
    .filter(Boolean) as HackathonBadgeCategory[];
}

export async function POST(req: Request) {
  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return jsonError("Body JSON invalido.");
  }

  const hackathonId = body.hackathonId?.trim();
  const request = body.request;
  if (!hackathonId) return jsonError("Falta hackathonId.");
  if (!request) return jsonError("Falta request firmado.");

  const hackathon = getHackathon(hackathonId);
  if (!hackathon) return jsonError("Hackaton no encontrada.", 404);

  let additions: HackathonBadgeTemplate[];
  try {
    additions = (Array.isArray(body.badges) ? body.badges : []).map(
      parseBadgeTemplate,
    );
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Badges invalidos.",
      400,
    );
  }

  if (additions.length === 0) return jsonError("Faltan badges para crear.");
  if (additions.length > MAX_BADGES_PER_REQUEST) {
    return jsonError(`Maximo ${MAX_BADGES_PER_REQUEST} badges por request.`);
  }

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
      !requestHasTag(request, "action", "create-hackathon-badges") ||
      !requestHasTag(request, "hackathon", hackathonId)
    ) {
      return jsonError("Request no autorizado para crear badges.", 401);
    }
    for (const badge of additions) {
      if (!requestHasTag(request, "badge", badge.id)) {
        return jsonError(`Request no autoriza el badge ${badge.id}.`, 401);
      }
    }

    const currentCatalog =
      (await getCachedHackathonBadgeCatalogSnapshot(hackathonId)).catalogEvent
        ?.catalog ?? null;
    const categories = ensureHackathonBadgeCategories(additions, [
      ...existingCategories(currentCatalog),
      ...((Array.isArray(body.categories) ? body.categories : [])
        .map(parseCategory)
        .filter(Boolean) as HackathonBadgeCategory[]),
    ]);
    const mergedBadges = mergeHackathonBadgeTemplates(
      existingTemplates(currentCatalog),
      additions,
    );
    const createdAt = Math.floor(Date.now() / 1000);
    const unsignedEvents = [
      ...buildHackathonBadgeDefinitionEvents(
        issuerPubkey,
        hackathon.id,
        additions,
        createdAt,
      ),
      buildHackathonBadgeCatalogEvent(
        issuerPubkey,
        hackathon.id,
        hackathon.name,
        mergedBadges,
        createdAt,
        categories,
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
      catalog: JSON.parse(events[events.length - 1]?.content ?? "null"),
    });
  } catch (error) {
    console.error("[api/hackathon-badges/create] failed", error);
    return jsonError("No se pudieron crear badges.", 500);
  }
}
