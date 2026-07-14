import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import type { SignedEvent } from "@/lib/nostrSigner";
import {
  getProjectRegistryState,
  isCuratedProjectId,
  registerUserProjectSlug,
} from "@/lib/projectRegistry";
import { normalizeRequestedSlug } from "@/lib/projectRegistryContract";
import {
  getNostrSubmissionsSnapshot,
  rawFetchProjectByDTag,
} from "@/lib/nostrCache";
import {
  UPSTASH_KEYS,
  UPSTASH_TTL,
  upstashSet,
} from "@/lib/upstashCache";
import { nostrProjectByIdTag } from "@/lib/nostrCacheTags";
import { projectSlugHref } from "@/lib/projectLinks";

/**
 * User-initiated project-slug registry.
 *
 *  GET  ?slug=<s>[&projectId=<id>]  → availability check (format + uniqueness).
 *  POST { request: SignedEvent }    → claim/change a slug. `request` is a
 *      kind-27235 NIP-98 event signed by the project's author carrying
 *      ["action","register-project-slug"], ["project",<id>], ["slug",<slug>].
 *      The backend verifies ownership against the project's own relay event,
 *      La-Crypta-signs an updated registry event, publishes it, caches a durable
 *      copy of the project, and returns the event for the client to republish.
 *
 * Mirrors the auth+sign pattern of `app/api/soldiers/ranking/route.ts`.
 */

const ACTION = "register-project-slug";
const REQUEST_MAX_AGE_SECONDS = 10 * 60;

function tagValue(ev: SignedEvent, name: string): string | undefined {
  return ev.tags.find((t) => t[0] === name)?.[1];
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const rawSlug = url.searchParams.get("slug") ?? "";
  const projectId = url.searchParams.get("projectId") ?? undefined;

  const normalized = normalizeRequestedSlug(rawSlug);
  if ("error" in normalized) {
    return NextResponse.json({
      available: false,
      reason: normalized.error,
      slug: rawSlug.trim().toLowerCase(),
    });
  }

  const slug = normalized.slug;
  const state = await getProjectRegistryState();
  const owner = state.bySlug.get(slug);

  if (owner && owner.id.toLowerCase() !== projectId?.toLowerCase()) {
    return NextResponse.json({
      available: false,
      reason: "Esa URL ya está en uso.",
      slug,
    });
  }

  const mine =
    owner && projectId && owner.id.toLowerCase() === projectId.toLowerCase();
  return NextResponse.json({
    available: true,
    slug,
    reason: mine ? "Es la URL actual de tu proyecto." : undefined,
  });
}

export async function POST(req: NextRequest) {
  let body: { request?: SignedEvent };
  try {
    body = (await req.json()) as { request?: SignedEvent };
  } catch {
    return NextResponse.json({ error: "Body JSON inválido." }, { status: 400 });
  }
  const request = body.request;
  if (!request) {
    return NextResponse.json({ error: "Falta request firmado." }, { status: 400 });
  }

  try {
    const { verifyEvent } = await import("nostr-tools/pure");

    if (!verifyEvent(request)) {
      return NextResponse.json({ error: "Request Nostr inválido." }, { status: 401 });
    }
    if (
      Math.abs(Math.floor(Date.now() / 1000) - request.created_at) >
      REQUEST_MAX_AGE_SECONDS
    ) {
      return NextResponse.json({ error: "Request expirado." }, { status: 401 });
    }
    if (!request.tags.some((t) => t[0] === "action" && t[1] === ACTION)) {
      return NextResponse.json(
        { error: "Request no autorizado para registrar una URL." },
        { status: 401 },
      );
    }

    // Normalize the id to lowercase so the durable/short KV keys we write match
    // the lowercased ids the resolver reads back (`getProjectWithDurableFallback`).
    const projectId = (tagValue(request, "project") ?? "").trim().toLowerCase();
    if (!projectId) {
      return NextResponse.json(
        { error: "Falta el id del proyecto." },
        { status: 400 },
      );
    }
    const normalized = normalizeRequestedSlug(tagValue(request, "slug") ?? "");
    if ("error" in normalized) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }
    const slug = normalized.slug;

    // Curated (in-tree) projects are La Crypta-owned; their canonical URL is
    // already their id and they're auto-registered by sync. Never claimable —
    // otherwise a community-project owner could shadow a curated project's URL.
    if (isCuratedProjectId(projectId)) {
      return NextResponse.json(
        { error: "Este proyecto no se puede registrar manualmente." },
        { status: 403 },
      );
    }

    // Recognized-author gate: if the system already knows this project (from the
    // La-Crypta-signed registry or the cached snapshot), only that author may
    // register/change its URL. This is what stops a stranger from hijacking a
    // known project by publishing a forged event under a colliding `#d` tag
    // (a `#d` is not owner-exclusive for NIP-33 replaceable events).
    const [registry, snapshot] = await Promise.all([
      getProjectRegistryState(),
      getNostrSubmissionsSnapshot(),
    ]);
    const recognizedAuthor =
      registry.byIdLc.get(projectId)?.author ??
      snapshot.projects.find((p) => p.id.toLowerCase() === projectId)?.author;
    if (recognizedAuthor && recognizedAuthor !== request.pubkey) {
      return NextResponse.json(
        { error: "Solo el autor del proyecto puede registrar su URL." },
        { status: 403 },
      );
    }

    // Fetch the requester's OWN event for this id (authors-filtered): confirms
    // they actually published the project AND yields authentic content to cache
    // durably — a forger's colliding event can never be the one returned here.
    const project = await rawFetchProjectByDTag(projectId, 4500, request.pubkey);
    if (!project) {
      return NextResponse.json(
        { error: "No encontramos un proyecto tuyo con ese id en los relays." },
        { status: 404 },
      );
    }

    const result = await registerUserProjectSlug({
      projectId,
      slug,
      requesterPubkey: request.pubkey,
      project: { name: project.name, hackathon: project.hackathon },
    });
    if (result.status === "error") {
      return NextResponse.json({ error: result.message }, { status: result.code });
    }

    // Durable backend copy so this project ALWAYS resolves server-side, even if
    // the broad snapshot never captured its (thinly-propagated) event — the
    // original `/projects/<slug>` "Proyecto no encontrado" class of bug. Pin the
    // queried id. Then refresh the per-id Next cache entry ONLY (not
    // `expireNostrTag`, which would delete the durable key we just wrote).
    const pinned = { ...project, id: projectId };
    await upstashSet(
      UPSTASH_KEYS.projectDurable(projectId),
      pinned,
      UPSTASH_TTL.durable,
    );
    await upstashSet(
      UPSTASH_KEYS.projectById(projectId),
      pinned,
      UPSTASH_TTL.lookup,
    );
    revalidateTag(nostrProjectByIdTag(projectId), { expire: 0 });

    return NextResponse.json({
      ok: true,
      event: result.event,
      slug: result.slug,
      changed: result.changed,
      canonicalUrl: projectSlugHref(result.slug),
    });
  } catch (error) {
    console.error("[api/projects/registry] failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno." },
      { status: 500 },
    );
  }
}
