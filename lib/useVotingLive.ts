"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import type { SignedEvent } from "@/lib/nostrSigner";
import type { VotingPeriod } from "@/lib/voting";
import {
  claimedVotes,
  subscribeToBallots,
  subscribeToVotingPeriod,
} from "@/lib/votingClient";

type Pubkeys = { adminPubkey: string | null; publisherPubkey: string | null };

/** What the logged-in viewer can do with this voting period. */
export type ViewerVotingState = {
  /** Logged in AND in the frozen eligible snapshot. */
  eligible: boolean;
  /** Total vote budget (1 per hackathon participated). 0 if not eligible. */
  maxVotes: number;
  /** Declared votes already cast (from the plaintext ["votes"] tag). */
  used: number;
  /** maxVotes - used, floored at 0. */
  remaining: number;
  /** Has a ballot on the relay. */
  hasVoted: boolean;
};

export type VotingLive = {
  period: VotingPeriod | null;
  pubkeys: Pubkeys;
  /** Distinct eligible voters who have published a ballot. */
  votedCount: number;
  /** Size of the frozen eligible snapshot. */
  eligibleCount: number;
  /** 0–100 participation. */
  progressPct: number;
  viewer: ViewerVotingState;
  isAdmin: boolean;
};

/**
 * Shared live read of a hackathon's voting period + ballots, derived for the
 * current viewer. Mirrors the subscription logic in `VotingSection` so the
 * voting hero / home banner stay in sync with the relay without duplicating it.
 * Read-only: it never publishes — the ballot editor and admin actions live in
 * `VotingSection`.
 */
export function useVotingLive(
  hackathonId: string,
  initialPeriod: VotingPeriod | null,
): VotingLive {
  const { auth } = useAuth();
  const [period, setPeriod] = useState<VotingPeriod | null>(initialPeriod);
  const [pubkeys, setPubkeys] = useState<Pubkeys>({
    adminPubkey: null,
    publisherPubkey: null,
  });
  const [ballots, setBallots] = useState<Map<string, SignedEvent>>(new Map());

  // La Crypta's admin + publisher pubkeys (trust anchors for the subscription).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/lacrypta-pubkeys")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Pubkeys | null) => {
        if (!cancelled && data) {
          setPubkeys({
            adminPubkey: data.adminPubkey ?? null,
            publisherPubkey: data.publisherPubkey ?? null,
          });
        }
      })
      .catch(() => {
        /* degrades to SSR period */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Authoritative period on mount — SSR is cached and may predate open/close.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/hackathons/${hackathonId}/voting`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { period?: VotingPeriod | null } | null) => {
        if (cancelled || !data?.period) return;
        setPeriod((prev) => {
          if (prev?.status === "closed" && data.period!.status === "open") {
            return prev; // never downgrade a closed period with stale data
          }
          return data.period!;
        });
      })
      .catch(() => {
        /* subscription still covers us */
      });
    return () => {
      cancelled = true;
    };
  }, [hackathonId]);

  // Live open/close flips.
  useEffect(() => {
    if (!pubkeys.publisherPubkey) return;
    let freshest = 0;
    return subscribeToVotingPeriod(
      hackathonId,
      pubkeys.publisherPubkey,
      (next, createdAt) => {
        if (createdAt <= freshest) return;
        freshest = createdAt;
        setPeriod(next);
      },
    );
  }, [hackathonId, pubkeys.publisherPubkey]);

  // Live ballots while open (for the participation progress).
  const votingOpen = period?.status === "open";
  useEffect(() => {
    if (!votingOpen) return;
    return subscribeToBallots(hackathonId, (ev) => {
      setBallots((prev) => {
        const key = ev.pubkey.toLowerCase();
        const existing = prev.get(key);
        if (
          existing &&
          (existing.created_at > ev.created_at ||
            (existing.created_at === ev.created_at && existing.id <= ev.id))
        ) {
          return prev;
        }
        const next = new Map(prev);
        next.set(key, ev);
        return next;
      });
    });
  }, [hackathonId, votingOpen]);

  const isAdmin =
    !!auth?.pubkey &&
    !!pubkeys.adminPubkey &&
    auth.pubkey === pubkeys.adminPubkey;

  return useMemo<VotingLive>(() => {
    const eligibleList = period?.eligible ?? [];
    const eligibleCount = eligibleList.length;
    const votedCount = eligibleList.filter((v) =>
      ballots.has(v.pubkey),
    ).length;
    const progressPct =
      eligibleCount > 0 ? Math.round((votedCount / eligibleCount) * 100) : 0;

    const me =
      period && auth?.pubkey
        ? (eligibleList.find((v) => v.pubkey === auth.pubkey.toLowerCase()) ??
          null)
        : null;
    const myBallot = auth?.pubkey ? ballots.get(auth.pubkey.toLowerCase()) : null;
    const used = myBallot ? claimedVotes(myBallot) : 0;
    const maxVotes = me?.maxVotes ?? 0;

    return {
      period,
      pubkeys,
      votedCount,
      eligibleCount,
      progressPct,
      isAdmin,
      viewer: {
        eligible: !!me,
        maxVotes,
        used,
        remaining: Math.max(0, maxVotes - used),
        hasVoted: !!myBallot,
      },
    };
  }, [period, pubkeys, ballots, auth?.pubkey, isAdmin]);
}
