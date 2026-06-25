import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import type { SignedEvent } from "@/lib/nostrSigner";
import { getSoldiers } from "@/lib/soldiers";
import {
  getHackathon,
  hackathonSlug,
  mergeWithSubmissions,
  primaryProjectPubkey,
  type Hackathon,
  type HackathonSubmission,
} from "@/lib/hackathons";
import { getNostrHackathonSubmissions } from "@/lib/nostrCache";
import { DEFAULT_RELAYS } from "@/lib/nostrRelayConfig";
import { isDevMode } from "@/lib/devMode";
import { devPubkeyForPubkey } from "@/lib/devImpersonation";
import { nostrVotingTag } from "@/lib/nostrCacheTags";
import {
  fetchVotingPeriodFromRelays,
  getCachedVotingPeriod,
} from "@/lib/votingCache";
import {
  VOTE_ENC,
  VOTING_KIND,
  VOTING_SCHEMA_VERSION,
  VOTING_T_TAG,
  buildEligibleVoters,
  computeVotingRanking,
  isVotingTestNamespace,
  parseBallotContent,
  serializeVotingPeriod,
  tallyDecryptedBallots,
  voteDTag,
  votingPeriodDTag,
  type DecryptedBallot,
  type VotingEligibleVoter,
  type VotingPeriod,
  type VotingProjectRef,
  type VotingResults,
  type VotingWinner,
} from "@/lib/voting";

const OPEN_ACTION = "open-voting";
/** Legacy single-shot close (kept as an alias for close-confirm). */
const CLOSE_ACTION = "close-voting";
/** Step 1: decrypt + tally + return preview (no publish). */
const CLOSE_PREVIEW_ACTION = "close-preview";
/** Step 2: re-validate the confirmed set, sign + publish the frozen result. */
const CLOSE_CONFIRM_ACTION = "close-confirm";
const CLOSE_ACTIONS = new Set([
  CLOSE_ACTION,
  CLOSE_PREVIEW_ACTION,
  CLOSE_CONFIRM_ACTION,
]);
const PROFILE_KIND = 0;
const PROFILE_SOURCE_NPUB =
  "npub1rujdpkd8mwezrvpqd2rx2zphfaztqrtsfg6w3vdnljdghs2q8qrqtt9u68";
const PROFILE_DISPLAY_NAME = "La Crypta Dev";
const PROFILE_SOURCE_FALLBACK_RELAYS = [
  "wss://purplepag.es",
  "wss://relay.nostr.band",
  "wss://relay.snort.social",
  "wss://nostr.wine",
] as const;
const VOTING_DM_KIND = 4;
const VOTING_DM_TAG = "lacrypta-dev-voting-notice";

type RelayPublishResult = { relay: string; ok: boolean; error?: string };

type VotingStartNotificationResult = {
  recipientPubkey: string;
  recipientName: string;
  eventId: string | null;
  ok: boolean;
  relays: RelayPublishResult[];
  error?: string;
};

type VotingStartNotificationSummary = {
  attempted: number;
  delivered: number;
  failed: number;
  senderProfile: SenderProfileResult;
  results: VotingStartNotificationResult[];
};

type SenderProfileResult = {
  pubkey: string;
  existed: boolean;
  sourcePubkey: string;
  sourceFound: boolean;
  eventId: string | null;
  relays: RelayPublishResult[];
  error?: string;
};

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
): Promise<RelayPublishResult[]> {
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

function parseProfileContent(content: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function fetchLatestProfileEvent(
  pubkey: string,
  relays: string[] = DEFAULT_RELAYS,
  timeoutMs = 3500,
): Promise<SignedEvent | null> {
  const { SimplePool } = await import("nostr-tools/pool");
  const pool = new SimplePool();
  let latest: SignedEvent | null = null;

  const closer = pool.subscribe(
    relays,
    { kinds: [PROFILE_KIND], authors: [pubkey], limit: 1 },
    {
      onevent(ev) {
        const event = ev as SignedEvent;
        if (!parseProfileContent(event.content)) return;
        if (!latest || event.created_at > latest.created_at) latest = event;
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
    pool.close(relays);
  } catch {
    /* noop */
  }
  return latest;
}

async function profileSourcePubkey(): Promise<string> {
  const { decode } = await import("nostr-tools/nip19");
  const decoded = decode(PROFILE_SOURCE_NPUB);
  if (decoded.type !== "npub") {
    throw new Error("PROFILE_SOURCE_NPUB invalido.");
  }
  return decoded.data as string;
}

function sourceProfileRelays(): string[] {
  return [...new Set([...DEFAULT_RELAYS, ...PROFILE_SOURCE_FALLBACK_RELAYS])];
}

async function ensureSenderProfile(
  secret: Uint8Array,
  createdAt: number,
): Promise<SenderProfileResult> {
  const { finalizeEvent, getPublicKey } = await import("nostr-tools/pure");
  const pubkey = getPublicKey(secret);
  const sourcePubkey = await profileSourcePubkey();
  const existing = await fetchLatestProfileEvent(pubkey);
  if (existing) {
    return {
      pubkey,
      existed: true,
      sourcePubkey,
      sourceFound: false,
      eventId: existing.id,
      relays: [],
    };
  }

  const source = await fetchLatestProfileEvent(
    sourcePubkey,
    sourceProfileRelays(),
    6000,
  );
  const cloned = parseProfileContent(source?.content ?? "") ?? {};
  const signed = finalizeEvent(
    {
      kind: PROFILE_KIND,
      created_at: createdAt,
      tags: [["client", "La Crypta Dev"]],
      content: JSON.stringify({
        ...cloned,
        name: PROFILE_DISPLAY_NAME,
        display_name: PROFILE_DISPLAY_NAME,
        displayName: PROFILE_DISPLAY_NAME,
      }),
    },
    secret,
  ) as SignedEvent;
  const relays = await publishToRelays(signed, DEFAULT_RELAYS);
  return {
    pubkey,
    existed: false,
    sourcePubkey,
    sourceFound: !!source,
    eventId: signed.id,
    relays,
  };
}

function siteBaseUrl(req: Request): string {
  try {
    return new URL(req.url).origin.replace(/\/+$/u, "");
  } catch {
    /* fallback below */
  }
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/u, "") ||
    "https://lacrypta.dev"
  );
}

function votingUrlForHackathon(hackathon: Hackathon, req: Request): string {
  return `${siteBaseUrl(req)}/hackathons/${hackathonSlug(hackathon)}#votar`;
}

function votingStartMessage(
  hackathonName: string,
  voter: VotingEligibleVoter,
  votingUrl: string,
): string {
  const voteWord = voter.maxVotes === 1 ? "voto" : "votos";
  return [
    voter.name ? `Hola ${voter.name}.` : "Hola.",
    `Ya está abierta la votación comunitaria de ${hackathonName}.`,
    `Tenés ${voter.maxVotes} ${voteWord} disponibles para repartir entre los proyectos habilitados.`,
    `Entrá a votar acá: ${votingUrl}`,
    "La Crypta Dev",
  ].join("\n\n");
}

async function publishVotingStartNotifications({
  secret,
  period,
  hackathonName,
  votingUrl,
  votingEventId,
  createdAt,
}: {
  secret: Uint8Array;
  period: VotingPeriod;
  hackathonName: string;
  votingUrl: string;
  votingEventId: string;
  createdAt: number;
}): Promise<VotingStartNotificationSummary> {
  const { finalizeEvent } = await import("nostr-tools/pure");
  const nip04 = await import("nostr-tools/nip04");
  const senderProfile = await ensureSenderProfile(secret, createdAt);

  const results: VotingStartNotificationResult[] = [];
  const batchSize = 5;
  for (let i = 0; i < period.eligible.length; i += batchSize) {
    const batch = period.eligible.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (voter): Promise<VotingStartNotificationResult> => {
        try {
          const content = await nip04.encrypt(
            secret,
            voter.pubkey,
            votingStartMessage(hackathonName, voter, votingUrl),
          );
          const signed = finalizeEvent(
            {
              kind: VOTING_DM_KIND,
              created_at: createdAt,
              content,
              tags: [
                ["p", voter.pubkey],
                ["e", votingEventId],
                ["t", VOTING_DM_TAG],
                ["client", "La Crypta Dev"],
              ],
            },
            secret,
          ) as SignedEvent;
          const relays = await publishToRelays(signed, DEFAULT_RELAYS, 5000);
          return {
            recipientPubkey: voter.pubkey,
            recipientName: voter.name,
            eventId: signed.id,
            ok: relays.some((r) => r.ok),
            relays,
          };
        } catch (error) {
          return {
            recipientPubkey: voter.pubkey,
            recipientName: voter.name,
            eventId: null,
            ok: false,
            relays: [],
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );
    results.push(...batchResults);
  }

  const delivered = results.filter((r) => r.ok).length;
  return {
    attempted: results.length,
    delivered,
    failed: results.length - delivered,
    senderProfile,
    results,
  };
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

/** Decrypts a ballot's content with LACRYPTA_NSEC. v2 = NIP-44 (nip04 fallback);
 *  v1 plaintext passes through. Returns null if it can't be read. */
async function decryptBallotContent(
  secret: Uint8Array,
  ev: SignedEvent,
): Promise<string | null> {
  const enc = ev.tags.find((t) => t[0] === "enc")?.[1];
  if (enc !== VOTE_ENC) return ev.content; // v1 plaintext (migration)
  try {
    const nip44 = await import("nostr-tools/nip44");
    return nip44.decrypt(ev.content, nip44.getConversationKey(secret, ev.pubkey));
  } catch {
    try {
      const nip04 = await import("nostr-tools/nip04");
      return await nip04.decrypt(secret, ev.pubkey, ev.content);
    } catch {
      return null;
    }
  }
}

export type ClosePreview = {
  tally: VotingResults;
  winners: VotingWinner[];
  countedBallotIds: string[];
  perVoter: {
    pubkey: string;
    name: string;
    allocations: Record<string, number>;
    total: number;
  }[];
  rejected: { pubkey: string; reason: string }[];
};

/**
 * Authoritative close pipeline (admin-only): verify each posted ballot's
 * signature, decrypt with LACRYPTA_NSEC, re-validate eligibility + budget, tally
 * and rank. Returns the preview the admin reviews and the exact result the
 * backend will sign on confirm. Does NOT publish.
 */
async function buildClosePreview(
  hackathonId: string,
  period: VotingPeriod,
  ballots: SignedEvent[],
  secret: Uint8Array,
  closedAt: number,
): Promise<ClosePreview> {
  const { verifyEvent } = await import("nostr-tools/pure");
  const dTag = voteDTag(hackathonId);

  const decrypted: DecryptedBallot[] = [];
  const earlyRejected: { pubkey: string; reason: string }[] = [];
  for (const ev of ballots) {
    // Never trust client-supplied events: signature + envelope first.
    if (ev.kind !== VOTING_KIND || ev.tags.find((t) => t[0] === "d")?.[1] !== dTag) {
      continue;
    }
    if (!verifyEvent(ev)) {
      earlyRejected.push({ pubkey: ev.pubkey, reason: "bad-signature" });
      continue;
    }
    const plaintext = await decryptBallotContent(secret, ev);
    if (plaintext === null) {
      earlyRejected.push({ pubkey: ev.pubkey, reason: "undecryptable" });
      continue;
    }
    const content = parseBallotContent(plaintext);
    if (!content || content.hackathonId !== hackathonId) {
      earlyRejected.push({ pubkey: ev.pubkey, reason: "content" });
      continue;
    }
    decrypted.push({
      id: ev.id,
      pubkey: ev.pubkey,
      created_at: ev.created_at,
      tags: ev.tags,
      allocations: content.allocations,
    });
  }

  const { results, byVoter, rejected } = tallyDecryptedBallots(
    decrypted,
    period,
    { closedAt },
  );

  // Resolve each project's primary recipient pubkey (dev → stand-in).
  const projects = await votableProjects(hackathonId);
  const byProjectId = new Map(projects.map((p) => [p.id, p]));
  const recipientCache = new Map<string, string | null>();
  const resolveRecipient = (projectId: string): string | null => {
    if (recipientCache.has(projectId)) return recipientCache.get(projectId)!;
    const project = byProjectId.get(projectId);
    const real = project ? primaryProjectPubkey(project) : null;
    recipientCache.set(projectId, real); // dev remap applied below (async)
    return real;
  };
  let winners = computeVotingRanking(results.tally, resolveRecipient);
  if (isDevMode()) {
    winners = await Promise.all(
      winners.map(async (w) => ({
        ...w,
        recipientPubkey: w.recipientPubkey
          ? await devPubkeyForPubkey(w.recipientPubkey)
          : null,
      })),
    );
  }

  const eligibleByPubkey = new Map(period.eligible.map((v) => [v.pubkey, v]));
  const perVoter = [...byVoter.entries()].map(([pubkey, allocations]) => ({
    pubkey,
    name: eligibleByPubkey.get(pubkey)?.name ?? `${pubkey.slice(0, 8)}…`,
    allocations,
    total: Object.values(allocations).reduce((s, n) => s + n, 0),
  }));

  return {
    tally: { ...results, winners },
    winners,
    countedBallotIds: results.countedBallotIds ?? [],
    perVoter,
    rejected: [
      ...earlyRejected,
      ...rejected.map((r) => ({ pubkey: r.pubkey, reason: r.reason })),
    ],
  };
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: routeParam } = await ctx.params;
  const hackathon = getHackathon(routeParam);
  if (!hackathon) return jsonError("Hackatón desconocido.", 404);
  // Normalize slug → canonical id so voting data keys off "zaps", not "gaming".
  const id = hackathon.id;
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
  const { id: routeParam } = await ctx.params;
  const hackathon = getHackathon(routeParam);
  if (!hackathon) return jsonError("Hackatón desconocido.", 404);
  // Normalize slug → canonical id so voting data keys off "zaps", not "gaming".
  const id = hackathon.id;

  let body: { request?: SignedEvent; ballots?: SignedEvent[] };
  try {
    body = (await req.json()) as {
      request?: SignedEvent;
      ballots?: SignedEvent[];
    };
  } catch {
    return jsonError("Body JSON invalido.");
  }
  const request = body.request;
  if (!request) return jsonError("Falta request firmado.");
  const postedBallots = Array.isArray(body.ballots) ? body.ballots : [];

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
    const action = requestTagValue(request, "action") ?? "";
    if (action !== OPEN_ACTION && !CLOSE_ACTIONS.has(action)) {
      return jsonError("Request no autorizado para administrar la votación.", 401);
    }
    if (requestTagValue(request, "h") !== id) {
      return jsonError("El request no corresponde a este hackatón.", 401);
    }

    // ── Close step 1: decrypt + tally + return preview (admin-gated, no publish) ──
    if (action === CLOSE_PREVIEW_ACTION) {
      const existing = await fetchVotingPeriodFromRelays(id);
      if (!existing || existing.period.status !== "open") {
        return jsonError("No hay una votación abierta para previsualizar.", 409);
      }
      const ballots =
        postedBallots.length > 0 ? postedBallots : await fetchBallotEvents(id);
      const preview = await buildClosePreview(
        id,
        existing.period,
        ballots,
        secret,
        Math.floor(Date.now() / 1000),
      );
      return NextResponse.json({ ok: true, preview });
    }

    const existing = await fetchVotingPeriodFromRelays(id);
    const now = Math.floor(Date.now() / 1000);
    const shouldNotifyVotingStart =
      action === OPEN_ACTION && existing?.period.status !== "open";
    // NIP-01 replaceable tie-break keeps the LOWEST id on equal created_at —
    // always publish strictly after the event we're replacing.
    const eventCreatedAt = Math.max(now, (existing?.eventCreatedAt ?? 0) + 1);

    let period: VotingPeriod;
    let notifications: VotingStartNotificationSummary | null = null;

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
      let eligible = buildEligibleVoters(soldiers, id);
      // Block self-votes using real pubkeys before any dev remap.
      applyTeamPubkeyBlocks(eligible, projects);
      if (isDevMode()) {
        // Real users never share secret keys, so dev impersonation signs with a
        // deterministic stand-in key derived from each pubkey. Remap eligibility
        // to those stand-ins so impersonated soldiers can cast valid ballots
        // against the local relay. Budgets and blocks are preserved.
        eligible = await Promise.all(
          eligible.map(async (v) => ({
            ...v,
            pubkey: await devPubkeyForPubkey(v.pubkey),
          })),
        );
      }
      // Env testers carry their own dev keys — merge after the remap.
      for (const extra of testExtraVoters()) {
        if (!eligible.some((v) => v.pubkey === extra.pubkey)) {
          eligible.push(extra);
        }
      }

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
      // close-confirm (and the close-voting alias): re-validate the confirmed
      // ballot set and freeze the signed result.
      if (!existing || existing.period.status !== "open") {
        return jsonError("No hay una votación abierta para cerrar.", 409);
      }
      const ballots =
        postedBallots.length > 0 ? postedBallots : await fetchBallotEvents(id);
      const preview = await buildClosePreview(
        id,
        existing.period,
        ballots,
        secret,
        now,
      );
      period = {
        ...existing.period,
        status: "closed",
        closedAt: now,
        // tally already carries winners + countedBallotIds (the FREEZE set).
        results: preview.tally,
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

    if (shouldNotifyVotingStart) {
      notifications = await publishVotingStartNotifications({
        secret,
        period,
        hackathonName: hackathon.name,
        votingUrl: votingUrlForHackathon(hackathon, req),
        votingEventId: signed.id,
        createdAt: eventCreatedAt,
      });
      if (notifications.failed > 0) {
        console.warn("[api/hackathons/voting] NIP-04 notification misses", {
          hackathonId: id,
          delivered: notifications.delivered,
          attempted: notifications.attempted,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      eventId: signed.id,
      status: period.status,
      eligibleCount: period.eligible.length,
      projectCount: period.projects.length,
      results: period.results,
      notifications,
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
