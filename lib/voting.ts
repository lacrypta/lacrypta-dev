/**
 * Shared contract for the community voting system — two NIP-78 (kind 30078)
 * parameterized replaceable event roles:
 *
 * 1. Voting period event — published by La Crypta (server-signed with
 *    LACRYPTA_NSEC), `d = lacrypta.dev:voting:<hackathonId>`. Carries the
 *    open/closed status, a frozen eligibility snapshot and, once closed, the
 *    canonical final tally.
 * 2. Ballot event — signed by the voter, `d = lacrypta.dev:vote:<hackathonId>`.
 *    Replaceable: one ballot per voter per hackathon; re-voting replaces it.
 *
 * Pure module shared by the server cache reader (`lib/votingCache.ts`), the
 * admin API route (`app/api/hackathons/[id]/voting/route.ts`) and the client
 * (`lib/votingClient.ts`, `VotingSection`). No Nostr I/O, no `"use cache"`.
 */

import type { Soldier } from "./soldiers";

export const VOTING_KIND = 30078;
export const VOTING_T_TAG = "lacrypta-dev-voting";
export const VOTE_T_TAG = "lacrypta-dev-vote";
/** v2 = NIP-44-encrypted ballots (allocations hidden on relays). v1 = plaintext. */
export const VOTING_SCHEMA_VERSION = 2;
/** Value of the ballot's `["enc", …]` tag when the content is NIP-44 ciphertext. */
export const VOTE_ENC = "nip44";
/** Votes a voter gets per distinct hackathon they participated in. Budget =
 *  (distinct hackathons) × this, so a voter can spread votes across several
 *  different projects rather than backing a single one. */
export const VOTES_PER_HACKATHON = 5;

/**
 * Dev/test isolation: with `NEXT_PUBLIC_VOTING_NS=test` every d-tag moves to
 * the `lacrypta.dev:test:` namespace, so test events on the public relays are
 * invisible to production reads (which query the un-namespaced tags signed by
 * the production publisher key). Build-time inlined on both server and client.
 */
export function isVotingTestNamespace(): boolean {
  return process.env.NEXT_PUBLIC_VOTING_NS === "test";
}

function dTagPrefix(): string {
  return isVotingTestNamespace() ? "lacrypta.dev:test" : "lacrypta.dev";
}

export function votingPeriodDTag(hackathonId: string): string {
  return `${dTagPrefix()}:voting:${hackathonId}`;
}

export function voteDTag(hackathonId: string): string {
  return `${dTagPrefix()}:vote:${hackathonId}`;
}

export type VotingEligibleVoter = {
  pubkey: string;
  name: string;
  /** VOTES_PER_HACKATHON votes per distinct hackathon the voter participated in. */
  maxVotes: number;
  /** Project ids in the current hackathon the voter cannot vote for (own projects). */
  blocked: string[];
};

export type VotingProjectRef = {
  id: string;
  name: string;
};

export type VotingTallyRow = {
  projectId: string;
  name: string;
  votes: number;
  /** Distinct voters that allocated at least one vote to this project. */
  voters: number;
};

/** A ranked winner in the closed result. Ranking only — prize amounts and
 *  payout are handled separately (manual via existing tooling). */
export type VotingWinner = {
  /** 1-based rank in the final result. */
  position: number;
  projectId: string;
  projectName: string;
  votes: number;
  voters: number;
  /** Primary team pubkey to send prizes to, resolved at close (null if none). */
  recipientPubkey: string | null;
};

export type VotingResults = {
  tally: VotingTallyRow[];
  ballotsCounted: number;
  ballotsRejected: number;
  totalVotesCast: number;
  /** Ranking of projects with at least one vote (present on v2 closes). */
  winners?: VotingWinner[];
  /** The exact ballot event ids counted into this result — the FREEZE set.
   *  Ballots re-published after close (new ids) are never in this set. */
  countedBallotIds?: string[];
};

/** A ballot whose encrypted content has already been decrypted (by the backend
 *  with LACRYPTA_NSEC, or by the voter with their own key). Lets validate/tally
 *  run in this pure module without any crypto. */
export type DecryptedBallot = {
  id: string;
  pubkey: string;
  created_at: number;
  tags: string[][];
  allocations: Record<string, number>;
};

export type VotingPeriod = {
  version: number;
  hackathonId: string;
  status: "open" | "closed";
  /** Unix seconds the voting opened. */
  openedAt: number;
  /** Unix seconds the voting closed; null while open. */
  closedAt: number | null;
  projects: VotingProjectRef[];
  eligible: VotingEligibleVoter[];
  /** Canonical final tally — only present once status is "closed". */
  results: VotingResults | null;
};

export type BallotContent = {
  version: number;
  hackathonId: string;
  /** projectId → votes allocated (positive integers). */
  allocations: Record<string, number>;
};

/** Minimal event shape — matches `SignedEvent` without importing client code. */
export type VotingEventLike = {
  id: string;
  pubkey: string;
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
};

export function serializeVotingPeriod(period: VotingPeriod): string {
  return JSON.stringify(period);
}

/** Defensive parse — returns null for anything that isn't a valid period. */
export function parseVotingPeriod(content: string): VotingPeriod | null {
  try {
    const parsed = JSON.parse(content) as Partial<VotingPeriod>;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.hackathonId !== "string" ||
      (parsed.status !== "open" && parsed.status !== "closed") ||
      typeof parsed.openedAt !== "number" ||
      !Array.isArray(parsed.projects) ||
      !Array.isArray(parsed.eligible)
    ) {
      return null;
    }
    return {
      version:
        typeof parsed.version === "number"
          ? parsed.version
          : VOTING_SCHEMA_VERSION,
      hackathonId: parsed.hackathonId,
      status: parsed.status,
      openedAt: parsed.openedAt,
      closedAt: typeof parsed.closedAt === "number" ? parsed.closedAt : null,
      projects: parsed.projects.filter(
        (p): p is VotingProjectRef =>
          !!p && typeof p.id === "string" && typeof p.name === "string",
      ),
      eligible: parsed.eligible
        .filter(
          (v): v is VotingEligibleVoter =>
            !!v &&
            typeof v.pubkey === "string" &&
            typeof v.maxVotes === "number" &&
            v.maxVotes > 0,
        )
        .map((v) => ({
          pubkey: v.pubkey.toLowerCase(),
          name: typeof v.name === "string" ? v.name : "",
          maxVotes: Math.floor(v.maxVotes),
          blocked: Array.isArray(v.blocked)
            ? v.blocked.filter((b): b is string => typeof b === "string")
            : [],
        })),
      results:
        parsed.results && Array.isArray(parsed.results.tally)
          ? (parsed.results as VotingResults)
          : null,
    };
  } catch {
    return null;
  }
}

/** Defensive parse of a ballot's content — null on garbage. */
export function parseBallotContent(content: string): BallotContent | null {
  try {
    const parsed = JSON.parse(content) as Partial<BallotContent>;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.hackathonId !== "string" ||
      !parsed.allocations ||
      typeof parsed.allocations !== "object" ||
      Array.isArray(parsed.allocations)
    ) {
      return null;
    }
    const allocations: Record<string, number> = {};
    for (const [projectId, votes] of Object.entries(parsed.allocations)) {
      if (typeof votes !== "number") return null;
      allocations[projectId] = votes;
    }
    return {
      version:
        typeof parsed.version === "number"
          ? parsed.version
          : VOTING_SCHEMA_VERSION,
      hackathonId: parsed.hackathonId,
      allocations,
    };
  } catch {
    return null;
  }
}


export type BallotValidation =
  | { ok: true; allocations: Record<string, number> }
  | { ok: false; reason: string };

/**
 * Content-independent ballot gate: correct `d` tag, eligible author, and within
 * the voting window. Returns the matched eligible voter on success. Reused by
 * both the plaintext (v1) path and the decrypted (v2) path.
 */
export function ballotEnvelopeOk(
  ev: { pubkey: string; kind: number; created_at: number; tags: string[][] },
  period: VotingPeriod,
  opts: { closedAt?: number | null } = {},
):
  | { ok: true; voter: VotingEligibleVoter }
  | { ok: false; reason: string } {
  if (ev.kind !== VOTING_KIND) return { ok: false, reason: "kind" };
  if (
    (ev.tags.find((t) => t[0] === "d")?.[1] ?? null) !==
    voteDTag(period.hackathonId)
  ) {
    return { ok: false, reason: "d-tag" };
  }
  const voter = period.eligible.find(
    (v) => v.pubkey === ev.pubkey.toLowerCase(),
  );
  if (!voter) return { ok: false, reason: "not-eligible" };
  if (ev.created_at < period.openedAt) return { ok: false, reason: "too-early" };
  const closedAt = opts.closedAt ?? period.closedAt;
  if (closedAt !== null && closedAt !== undefined && ev.created_at > closedAt) {
    return { ok: false, reason: "too-late" };
  }
  return { ok: true, voter };
}

/**
 * Validates already-decrypted allocations against the period + voter budget:
 * positive integers, votable (non-blocked) projects, total within budget.
 * This is the AUTHORITATIVE budget check (the plaintext `["votes"]` tag on a
 * ballot is never trusted — only this counts).
 */
export function validateAllocations(
  allocations: Record<string, number>,
  voter: VotingEligibleVoter,
  period: VotingPeriod,
): BallotValidation {
  const projectIds = new Set(period.projects.map((p) => p.id));
  let total = 0;
  const out: Record<string, number> = {};
  for (const [projectId, votes] of Object.entries(allocations)) {
    if (!Number.isInteger(votes) || votes < 1) {
      return { ok: false, reason: "invalid-amount" };
    }
    if (!projectIds.has(projectId)) {
      return { ok: false, reason: "unknown-project" };
    }
    if (voter.blocked.includes(projectId)) {
      return { ok: false, reason: "self-vote" };
    }
    out[projectId] = votes;
    total += votes;
  }
  if (total === 0) return { ok: false, reason: "empty" };
  if (total > voter.maxVotes) return { ok: false, reason: "over-budget" };
  return { ok: true, allocations: out };
}

/**
 * Validates a PLAINTEXT (v1) ballot event end-to-end. Kept for backward compat
 * with un-encrypted ballots; v2 encrypted ballots are decrypted first and run
 * through `ballotEnvelopeOk` + `validateAllocations`.
 */
export function validateBallot(
  ev: VotingEventLike,
  period: VotingPeriod,
  opts: { closedAt?: number | null } = {},
): BallotValidation {
  const envelope = ballotEnvelopeOk(ev, period, opts);
  if (!envelope.ok) return { ok: false, reason: envelope.reason };
  const content = parseBallotContent(ev.content);
  if (!content || content.hackathonId !== period.hackathonId) {
    return { ok: false, reason: "content" };
  }
  return validateAllocations(content.allocations, envelope.voter, period);
}

/**
 * Latest-per-author dedupe for replaceable ballots: keep the highest
 * `created_at`; on ties keep the lowest event id (NIP-01 — relays may return
 * divergent versions of the same replaceable event).
 */
export function dedupeBallots(events: VotingEventLike[]): VotingEventLike[] {
  const byAuthor = new Map<string, VotingEventLike>();
  for (const ev of events) {
    const key = ev.pubkey.toLowerCase();
    const prev = byAuthor.get(key);
    if (
      !prev ||
      ev.created_at > prev.created_at ||
      (ev.created_at === prev.created_at && ev.id < prev.id)
    ) {
      byAuthor.set(key, ev);
    }
  }
  return [...byAuthor.values()];
}

/** Latest-per-author dedupe over any event-like with id/pubkey/created_at. */
function pickLatestPerAuthor<
  T extends { id: string; pubkey: string; created_at: number },
>(events: T[]): T[] {
  const byAuthor = new Map<string, T>();
  for (const ev of events) {
    const key = ev.pubkey.toLowerCase();
    const prev = byAuthor.get(key);
    if (
      !prev ||
      ev.created_at > prev.created_at ||
      (ev.created_at === prev.created_at && ev.id < prev.id)
    ) {
      byAuthor.set(key, ev);
    }
  }
  return [...byAuthor.values()];
}

/**
 * Builds tally rows + per-project voter counts from a `byVoter` map.
 */
function tallyFromByVoter(
  byVoter: Map<string, Record<string, number>>,
  period: VotingPeriod,
): { tally: VotingTallyRow[]; totalVotesCast: number } {
  const votesByProject = new Map<string, { votes: number; voters: number }>();
  let totalVotesCast = 0;
  for (const allocations of byVoter.values()) {
    for (const [projectId, votes] of Object.entries(allocations)) {
      const row = votesByProject.get(projectId) ?? { votes: 0, voters: 0 };
      row.votes += votes;
      row.voters += 1;
      votesByProject.set(projectId, row);
      totalVotesCast += votes;
    }
  }
  const tally: VotingTallyRow[] = period.projects
    .map((p) => ({
      projectId: p.id,
      name: p.name,
      votes: votesByProject.get(p.id)?.votes ?? 0,
      voters: votesByProject.get(p.id)?.voters ?? 0,
    }))
    .sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));
  return { tally, totalVotesCast };
}

/**
 * The AUTHORITATIVE tally — run by the backend over ballots whose content has
 * already been decrypted (with LACRYPTA_NSEC). Dedupes latest-per-author,
 * re-checks envelope + allocations (eligibility + budget + projects), and
 * returns the survivors plus the FREEZE set (`countedBallotIds`).
 */
export function tallyDecryptedBallots(
  ballots: DecryptedBallot[],
  period: VotingPeriod,
  opts: { closedAt?: number | null } = {},
): {
  results: Omit<VotingResults, "winners">;
  byVoter: Map<string, Record<string, number>>;
  counted: DecryptedBallot[];
  rejected: { id: string; pubkey: string; reason: string }[];
} {
  const deduped = pickLatestPerAuthor(ballots);
  const byVoter = new Map<string, Record<string, number>>();
  const counted: DecryptedBallot[] = [];
  const rejected: { id: string; pubkey: string; reason: string }[] = [];

  for (const ev of deduped) {
    const envelope = ballotEnvelopeOk(
      { pubkey: ev.pubkey, kind: VOTING_KIND, created_at: ev.created_at, tags: ev.tags },
      period,
      opts,
    );
    if (!envelope.ok) {
      rejected.push({ id: ev.id, pubkey: ev.pubkey, reason: envelope.reason });
      continue;
    }
    const validation = validateAllocations(ev.allocations, envelope.voter, period);
    if (!validation.ok) {
      rejected.push({ id: ev.id, pubkey: ev.pubkey, reason: validation.reason });
      continue;
    }
    byVoter.set(ev.pubkey.toLowerCase(), validation.allocations);
    counted.push(ev);
  }

  const { tally, totalVotesCast } = tallyFromByVoter(byVoter, period);
  return {
    results: {
      tally,
      ballotsCounted: byVoter.size,
      ballotsRejected: rejected.length,
      totalVotesCast,
      countedBallotIds: counted.map((b) => b.id),
    },
    byVoter,
    counted,
    rejected,
  };
}

/**
 * Ranks projects with at least one vote (tally is already sorted votes desc,
 * name asc). `resolveRecipient` injects the project's primary team pubkey for
 * later (manual) prize payout. Ranking only — no prize amounts.
 */
export function computeVotingRanking(
  tally: VotingTallyRow[],
  resolveRecipient: (projectId: string) => string | null,
): VotingWinner[] {
  return tally
    .filter((row) => row.votes > 0)
    .map((row, i) => ({
      position: i + 1,
      projectId: row.projectId,
      projectName: row.name,
      votes: row.votes,
      voters: row.voters,
      recipientPubkey: resolveRecipient(row.projectId),
    }));
}

/** @deprecated v1 plaintext live tally. v2 hides the tally until close. */
export function tallyBallots(
  events: VotingEventLike[],
  period: VotingPeriod,
  closedAt?: number | null,
): {
  results: VotingResults;
  /** voter pubkey (lowercase hex) → their counted allocations. */
  byVoter: Map<string, Record<string, number>>;
} {
  const deduped = dedupeBallots(events);
  const byVoter = new Map<string, Record<string, number>>();
  let rejected = 0;

  for (const ev of deduped) {
    const result = validateBallot(ev, period, { closedAt });
    if (result.ok) {
      byVoter.set(ev.pubkey.toLowerCase(), result.allocations);
    } else {
      rejected++;
    }
  }

  const votesByProject = new Map<string, { votes: number; voters: number }>();
  let totalVotesCast = 0;
  for (const allocations of byVoter.values()) {
    for (const [projectId, votes] of Object.entries(allocations)) {
      const row = votesByProject.get(projectId) ?? { votes: 0, voters: 0 };
      row.votes += votes;
      row.voters += 1;
      votesByProject.set(projectId, row);
      totalVotesCast += votes;
    }
  }

  const tally: VotingTallyRow[] = period.projects
    .map((p) => ({
      projectId: p.id,
      name: p.name,
      votes: votesByProject.get(p.id)?.votes ?? 0,
      voters: votesByProject.get(p.id)?.voters ?? 0,
    }))
    .sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));

  return {
    results: {
      tally,
      ballotsCounted: byVoter.size,
      ballotsRejected: rejected,
      totalVotesCast,
    },
    byVoter,
  };
}

/**
 * Builds the frozen eligibility snapshot from the soldiers roster: anyone with
 * a Nostr pubkey who participated in at least one hackathon. Vote budget =
 * VOTES_PER_HACKATHON per distinct hackathon participated in; `blocked` = the
 * voter's own projects in the hackathon being voted (no self-votes).
 */
export function buildEligibleVoters(
  soldiers: Soldier[],
  hackathonId: string,
): VotingEligibleVoter[] {
  const byPubkey = new Map<string, VotingEligibleVoter>();
  for (const s of soldiers) {
    if (!s.pubkey) continue;
    const hackathons = new Set(
      s.projects.map((p) => p.hackathonId).filter(Boolean),
    );
    if (hackathons.size === 0) continue;
    const blocked = [
      ...new Set(
        s.projects
          .filter((p) => p.hackathonId === hackathonId)
          .map((p) => p.projectId),
      ),
    ];
    const pubkey = s.pubkey.toLowerCase();
    const existing = byPubkey.get(pubkey);
    if (existing) {
      // Same pubkey reachable from two roster entries — keep the larger budget
      // and union the blocked lists.
      existing.maxVotes = Math.max(
        existing.maxVotes,
        hackathons.size * VOTES_PER_HACKATHON,
      );
      existing.blocked = [...new Set([...existing.blocked, ...blocked])];
    } else {
      byPubkey.set(pubkey, {
        pubkey,
        name: s.name,
        maxVotes: hackathons.size * VOTES_PER_HACKATHON,
        blocked,
      });
    }
  }
  return [...byPubkey.values()];
}
