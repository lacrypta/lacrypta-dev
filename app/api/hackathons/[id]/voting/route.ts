import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import type { SignedEvent } from "@/lib/nostrSigner";
import { getSoldiers } from "@/lib/soldiers";
import {
  getHackathon,
  mergeWithSubmissions,
  type HackathonSubmission,
} from "@/lib/hackathons";
import { getNostrHackathonSubmissions } from "@/lib/nostrCache";
import { DEFAULT_RELAYS } from "@/lib/nostrRelayConfig";
import { nostrVotingTag } from "@/lib/nostrCacheTags";
import {
  fetchVotingPeriodFromRelays,
  getCachedVotingPeriod,
} from "@/lib/votingCache";
import {
  VOTING_KIND,
  VOTING_SCHEMA_VERSION,
  VOTING_T_TAG,
  buildEligibleVoters,
  isVotingTestNamespace,
  serializeVotingPeriod,
  tallyBallots,
  voteDTag,
  votingPeriodDTag,
  type VotingEligibleVoter,
  type VotingPeriod,
  type VotingProjectRef,
} from "@/lib/voting";

const OPEN_ACTION = "open-voting";
const CLOSE_ACTION = "close-voting";

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

function requestTagValue(request: SignedEvent, name: string): string | null {
  return request.tags.find((tag) => tag[0] === name)?.[1] ?? null;
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

/** Collects all ballot events for the hackathon (no `authors` filter —
 *  eligibility is enforced by `tallyBallots` against the frozen snapshot). */
async function fetchBallotEvents(
  hackathonId: string,
  timeoutMs = 5000,
): Promise<SignedEvent[]> {
  const dTag = voteDTag(hackathonId);
  const { SimplePool } = await import("nostr-tools/pool");
  const pool = new SimplePool();
  const events: SignedEvent[] = [];

  const closer = pool.subscribe(
    DEFAULT_RELAYS,
    { kinds: [VOTING_KIND], "#d": [dTag], limit: 1000 },
    {
      onevent(ev) {
        const event = ev as SignedEvent;
        const d = event.tags.find((t) => t[0] === "d")?.[1];
        if (d === dTag) events.push(event);
      },
      oneose() {
        /* timeout-driven */
      },
    },
  );

  await new Promise((r) => setTimeout(r, timeoutMs));
  try {
    closer.close();
  } catch {
    /* noop */
  }
  try {
    pool.close(DEFAULT_RELAYS);
  } catch {
    /* noop */
  }
  return events;
}

/** Test-only extra voters (`hexpk:budget,hexpk:budget`) — hard-gated to the
 *  test namespace so it can never widen production eligibility. */
function testExtraVoters(): VotingEligibleVoter[] {
  if (!isVotingTestNamespace()) return [];
  const raw = process.env.VOTING_TEST_EXTRA_VOTERS;
  if (!raw) return [];
  const out: VotingEligibleVoter[] = [];
  for (const entry of raw.split(",")) {
    const [pubkey, budget] = entry.trim().split(":");
    if (!pubkey || !/^[0-9a-f]{64}$/i.test(pubkey)) continue;
    const maxVotes = Math.max(1, Number.parseInt(budget ?? "1", 10) || 1);
    out.push({
      pubkey: pubkey.toLowerCase(),
      name: `Tester ${pubkey.slice(0, 8)}`,
      maxVotes,
      blocked: [],
    });
  }
  return out;
}

/** Adds current-hackathon team pubkeys (and Nostr authors) to those voters'
 *  blocked lists — covers projects whose members carry explicit pubkeys. */
function applyTeamPubkeyBlocks(
  eligible: VotingEligibleVoter[],
  projects: HackathonSubmission[],
) {
  const byPubkey = new Map(eligible.map((v) => [v.pubkey, v]));
  for (const project of projects) {
    const memberPubkeys = new Set<string>();
    for (const m of project.team) {
      if (m.pubkey) memberPubkeys.add(m.pubkey.toLowerCase());
    }
    if (project.nostrAuthor) memberPubkeys.add(project.nostrAuthor.toLowerCase());
    for (const pubkey of memberPubkeys) {
      const voter = byPubkey.get(pubkey);
      if (voter && !voter.blocked.includes(project.id)) {
        voter.blocked.push(project.id);
      }
    }
  }
}

async function votableProjects(
  hackathonId: string,
): Promise<HackathonSubmission[]> {
  const nostr = (await getNostrHackathonSubmissions(hackathonId)).map((p) => ({
    ...p,
    nostrAuthor: p.author,
    nostrEventId: p.eventId,
    nostrCreatedAt: p.eventCreatedAt,
  }));
  return mergeWithSubmissions(hackathonId, nostr);
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!getHackathon(id)) return jsonError("Hackatón desconocido.", 404);
  try {
    const period = await getCachedVotingPeriod(id);
    return NextResponse.json({ period });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "No se pudo leer la votación.",
      500,
    );
  }
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const hackathon = getHackathon(id);
  if (!hackathon) return jsonError("Hackatón desconocido.", 404);

  let body: { request?: SignedEvent };
  try {
    body = (await req.json()) as { request?: SignedEvent };
  } catch {
    return jsonError("Body JSON invalido.");
  }
  const request = body.request;
  if (!request) return jsonError("Falta request firmado.");

  try {
    const { finalizeEvent, verifyEvent } = await import("nostr-tools/pure");
    const secret = await getBackendSecret();
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
    const action = requestTagValue(request, "action");
    if (action !== OPEN_ACTION && action !== CLOSE_ACTION) {
      return jsonError("Request no autorizado para administrar la votación.", 401);
    }
    if (requestTagValue(request, "h") !== id) {
      return jsonError("El request no corresponde a este hackatón.", 401);
    }

    const existing = await fetchVotingPeriodFromRelays(id);
    const now = Math.floor(Date.now() / 1000);
    // NIP-01 replaceable tie-break keeps the LOWEST id on equal created_at —
    // always publish strictly after the event we're replacing.
    const eventCreatedAt = Math.max(now, (existing?.eventCreatedAt ?? 0) + 1);

    let period: VotingPeriod;

    if (action === OPEN_ACTION) {
      if (
        existing?.period.status === "closed" &&
        requestTagValue(request, "force") !== "1"
      ) {
        return jsonError(
          "La votación ya fue cerrada. Reabrir requiere forzar.",
          409,
        );
      }

      const projects = await votableProjects(id);
      const projectRefs: VotingProjectRef[] = projects.map((p) => ({
        id: p.id,
        name: p.name,
      }));
      const soldiers = await getSoldiers().catch(() => []);
      const eligible = buildEligibleVoters(soldiers, id);
      for (const extra of testExtraVoters()) {
        if (!eligible.some((v) => v.pubkey === extra.pubkey)) {
          eligible.push(extra);
        }
      }
      applyTeamPubkeyBlocks(eligible, projects);

      period = {
        version: VOTING_SCHEMA_VERSION,
        hackathonId: id,
        status: "open",
        // Re-publishing an already-open period refreshes the snapshot
        // (projects/eligibility) without restarting the window.
        openedAt:
          existing?.period.status === "open" ? existing.period.openedAt : now,
        closedAt: null,
        projects: projectRefs,
        eligible,
        results: null,
      };
    } else {
      if (!existing || existing.period.status !== "open") {
        return jsonError("No hay una votación abierta para cerrar.", 409);
      }
      const ballots = await fetchBallotEvents(id);
      const { results } = tallyBallots(ballots, existing.period, now);
      period = {
        ...existing.period,
        status: "closed",
        closedAt: now,
        results,
      };
    }

    const signed = finalizeEvent(
      {
        kind: VOTING_KIND,
        created_at: eventCreatedAt,
        content: serializeVotingPeriod(period),
        tags: [
          ["d", votingPeriodDTag(id)],
          ["t", VOTING_T_TAG],
          ["h", id],
          ["status", period.status],
          ["client", "La Crypta Dev"],
        ],
      },
      secret,
    ) as SignedEvent;

    const relayResults = await publishToRelays(signed, DEFAULT_RELAYS);
    if (!relayResults.some((r) => r.ok)) {
      return NextResponse.json(
        { error: "Ningún relay aceptó el evento de votación.", relays: relayResults },
        { status: 502 },
      );
    }

    // Bust the server cache so SSR reads the freshly-published period.
    revalidateTag(nostrVotingTag(id), { expire: 0 });

    return NextResponse.json({
      ok: true,
      eventId: signed.id,
      status: period.status,
      eligibleCount: period.eligible.length,
      projectCount: period.projects.length,
      results: period.results,
      relays: relayResults,
    });
  } catch (error) {
    console.error("[api/hackathons/voting] failed", error);
    return jsonError(
      error instanceof Error
        ? error.message
        : "No se pudo administrar la votación.",
      500,
    );
  }
}
