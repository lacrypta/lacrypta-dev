import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import type { SignedEvent } from "@/lib/nostrSigner";
import { computeRanking } from "@/lib/soldiers";
import { getFreshNostrSubmissionsSnapshot } from "@/lib/nostrCache";
import { DEFAULT_RELAYS } from "@/lib/nostrRelayConfig";
import {
  NOSTR_PROJECTS_TAG,
  NOSTR_SOLDIERS_RANKING_TAG,
} from "@/lib/nostrCacheTags";
import { expireNostrTag } from "@/lib/nostrRevalidate";
import {
  RANKING_D_TAG,
  RANKING_KIND,
  RANKING_SCHEMA_VERSION,
  RANKING_T_TAG,
  serializeRankingSnapshot,
  type SoldiersRankingSnapshot,
} from "@/lib/soldiersRanking";

const ACTION = "publish-soldiers-ranking";

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

function requestHasTag(
  request: SignedEvent,
  name: string,
  value: string,
): boolean {
  return request.tags.some((tag) => tag[0] === name && tag[1] === value);
}

async function publishToRelays(
  signed: SignedEvent,
  relays: string[],
  perRelayTimeoutMs = 8000,
): Promise<{ relay: string; ok: boolean; error?: string }[]> {
  const { SimplePool } = await import("nostr-tools/pool");
  const pool = new SimplePool();
  const promises = pool.publish(relays, signed);
  const results = await Promise.all(
    relays.map(async (relay, i) => {
      try {
        await Promise.race([
          promises[i],
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), perRelayTimeoutMs),
          ),
        ]);
        return { relay, ok: true };
      } catch (error) {
        return {
          relay,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );
  try {
    pool.close(relays);
  } catch {
    /* noop */
  }
  return results;
}

export async function POST(req: Request) {
  let body: { request?: SignedEvent };
  try {
    body = (await req.json()) as { request?: SignedEvent };
  } catch {
    return jsonError("Body JSON invalido.");
  }
  const request = body.request;
  if (!request) return jsonError("Falta request firmado.");

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
      return jsonError("Request no autorizado para publicar el ranking.", 401);
    }

    // Recompute from ALL sources: curated (static) + fresh Nostr submissions.
    const fresh = await getFreshNostrSubmissionsSnapshot();
    const soldiers = computeRanking(fresh.projects);
    const nostrCutoff = fresh.projects.reduce(
      (max, p) => (p.eventCreatedAt > max ? p.eventCreatedAt : max),
      0,
    );

    const now = Math.floor(Date.now() / 1000);
    const snapshot: SoldiersRankingSnapshot = {
      version: RANKING_SCHEMA_VERSION,
      generatedAt: new Date(now * 1000).toISOString(),
      generatedAtUnix: now,
      nostrCutoff,
      counts: {
        soldiers: soldiers.length,
        nostr: soldiers.filter((s) => s.hasNostr).length,
      },
      soldiers,
    };

    const signed = finalizeEvent(
      {
        kind: RANKING_KIND,
        created_at: now,
        content: serializeRankingSnapshot(snapshot),
        tags: [
          ["d", RANKING_D_TAG],
          ["t", RANKING_T_TAG],
          ["client", "La Crypta Dev"],
          ["soldiers", String(soldiers.length)],
        ],
      },
      secret,
    );

    const relayResults = await publishToRelays(signed, DEFAULT_RELAYS);
    if (!relayResults.some((r) => r.ok)) {
      return NextResponse.json(
        {
          error: "Ningún relay aceptó el ranking.",
          relays: relayResults,
        },
        { status: 502 },
      );
    }

    // Bust the server cache so /soldados reads the freshly-published snapshot.
    // The ranking must drop out of Upstash too — its day-long TTL would
    // otherwise pin the ranking this request just superseded. The projects tag
    // only needs the Next tier expired: `getFreshNostrSubmissionsSnapshot()`
    // above already wrote the current snapshot through to Upstash.
    await expireNostrTag(NOSTR_SOLDIERS_RANKING_TAG);
    revalidateTag(NOSTR_PROJECTS_TAG, { expire: 0 });

    return NextResponse.json({
      ok: true,
      eventId: signed.id,
      issuerPubkey,
      soldierCount: soldiers.length,
      generatedAt: snapshot.generatedAt,
      relays: relayResults,
    });
  } catch (error) {
    console.error("[api/soldiers/ranking] failed", error);
    return jsonError(
      error instanceof Error ? error.message : "No se pudo publicar el ranking.",
      500,
    );
  }
}
