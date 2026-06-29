"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  ChevronDown,
  Coins,
  Loader2,
  Lock,
  Megaphone,
  Minus,
  PartyPopper,
  Plus,
  Radio,
  Trophy,
  Vote,
  X,
  Users,
  ListChecks,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import type { Auth } from "@/lib/auth";
import { hackathonSlugForId } from "@/lib/hackathons";
import { getSigner, type SignedEvent } from "@/lib/nostrSigner";
import { useToast } from "@/components/Toast";
import { useScrollLock } from "@/lib/useScrollLock";
import { cn } from "@/lib/cn";
import {
  isVotingTestNamespace,
  VOTES_PER_HACKATHON,
  type VotingPeriod,
  type VotingResults,
  type VotingWinner,
} from "@/lib/voting";
import {
  claimedVotes,
  decryptOwnBallot,
  fetchAllBallotEvents,
  publishBallot,
  subscribeToBallots,
  subscribeToVotingPeriod,
} from "@/lib/votingClient";
import LiveTally from "@/components/voting/LiveTally";
import {
  useAdminLiveTally,
  type AdminVoterAllocation,
} from "@/lib/useAdminLiveTally";

/** Shape of the close-preview the backend returns (decrypted, admin-only). */
type ClosePreviewData = {
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

type Pubkeys = { adminPubkey: string | null; publisherPubkey: string | null };

type VoterRow = {
  pubkey: string;
  name: string;
  maxVotes: number;
  /** Declared total from the ballot's ["votes"] tag (allocations are encrypted). */
  used: number;
  remaining: number;
  voted: boolean;
};

type VotingTotals = {
  budget: number;
  used: number;
  remaining: number;
  votedCount: number;
  eligibleCount: number;
};

type VotingContextValue = {
  hackathonId: string;
  hackathonName: string;
  auth: Auth | null;
  ready: boolean;
  pubkeys: Pubkeys;
  period: VotingPeriod | null;
  setPeriod: (period: VotingPeriod) => void;
  ballots: Map<string, SignedEvent>;
  isAdmin: boolean;
  admin: AdminVoting;
  voterRows: VoterRow[];
  totals: VotingTotals;
  results: VotingResults | null;
  voter: VotingPeriod["eligible"][number] | null;
  allocations: Record<string, number>;
  maxVotes: number;
  used: number;
  remaining: number;
  blocked: string[];
  publishing: boolean;
  celebrate: boolean;
  hasPrev: boolean;
  /** On-screen allocation differs from the published ballot — there are unsaved
   *  changes worth publishing. False right after load / publish. */
  isDirty: boolean;
  adjustProjectVote: (projectId: string, delta: number) => void;
  publishVotes: () => Promise<void>;
};

/** Allocation maps are equal ignoring zero/missing entries. */
function allocationsEqual(
  a: Record<string, number>,
  b: Record<string, number>,
): boolean {
  const keysA = Object.keys(a).filter((k) => (a[k] ?? 0) > 0);
  const keysB = Object.keys(b).filter((k) => (b[k] ?? 0) > 0);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((k) => a[k] === b[k]);
}

const VotingContext = createContext<VotingContextValue | null>(null);

function useVotingContext() {
  const context = useContext(VotingContext);
  if (!context) {
    throw new Error("Voting components must be rendered inside VotingProvider.");
  }
  return context;
}

function useOptionalVotingContext() {
  return useContext(VotingContext);
}

/**
 * Community voting for the hackathon's projects. Eligibility, vote budgets and
 * the votable project list come frozen inside the period event La Crypta
 * publishes when the admin opens the voting; ballots are replaceable Nostr
 * events signed by each voter. While open the tally is computed live from
 * relay ballots; once closed the embedded official results are rendered
 * verbatim (the freeze rule — late ballots can't change a signed result).
 */
export function VotingProvider({
  hackathonId,
  hackathonName,
  initialPeriod,
  children,
}: {
  hackathonId: string;
  hackathonName: string;
  initialPeriod: VotingPeriod | null;
  children: ReactNode;
}) {
  const { auth, ready } = useAuth();
  const { push } = useToast();

  const [pubkeys, setPubkeys] = useState<Pubkeys>({
    adminPubkey: null,
    publisherPubkey: null,
  });
  const [rawPeriod, setPeriod] = useState<VotingPeriod | null>(initialPeriod);
  // Defensive: a frozen period event may carry duplicate projects (e.g. it was
  // opened before community submissions were deduped). Collapse by id so every
  // consumer — ballot editor, tally, modal — keeps unique React keys.
  const period = useMemo<VotingPeriod | null>(() => {
    if (!rawPeriod) return null;
    const seen = new Set<string>();
    const projects = rawPeriod.projects.filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
    return projects.length === rawPeriod.projects.length
      ? rawPeriod
      : { ...rawPeriod, projects };
  }, [rawPeriod]);
  const [ballots, setBallots] = useState<Map<string, SignedEvent>>(new Map());

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
        /* section degrades to read-only */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Authoritative period read on mount — the SSR'd page is cached and may
  // predate the latest open/close, and relays can be slow to answer the
  // subscription below.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/hackathons/${hackathonId}/voting`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { period?: VotingPeriod | null } | null) => {
        if (cancelled || !data?.period) return;
        setPeriod((prev) => {
          // Never downgrade a closed period back to open with stale data.
          if (prev?.status === "closed" && data.period!.status === "open") {
            return prev;
          }
          return data.period!;
        });
      })
      .catch(() => {
        /* relay subscription still covers us */
      });
    return () => {
      cancelled = true;
    };
  }, [hackathonId]);

  // Live period flips (open/close) — what makes admin actions visible
  // everywhere without a reload.
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

  // Live ballots while voting is open.
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

  const admin = useAdminVoting(hackathonId, setPeriod);

  // Ballots are NIP-44 encrypted, so the client can't tally them. While open we
  // only surface WHO voted + their DECLARED count (the plaintext ["votes"] tag);
  // the real allocations/tally are revealed only when the admin closes.
  const voterRows = useMemo<VoterRow[]>(() => {
    if (!period) return [];
    return period.eligible
      .map((v) => {
        const ballot = ballots.get(v.pubkey);
        const used = ballot ? claimedVotes(ballot) : 0;
        return {
          pubkey: v.pubkey,
          name: v.name,
          maxVotes: v.maxVotes,
          used,
          remaining: Math.max(0, v.maxVotes - used),
          voted: !!ballot,
        };
      })
      .sort((a, b) => Number(b.voted) - Number(a.voted) || a.name.localeCompare(b.name));
  }, [period, ballots]);

  // The voter's own ballot, self-decrypted (symmetric NIP-44 key) to pre-fill
  // the editor. Runs only when their own ballot changes.
  const [ownAllocations, setOwnAllocations] = useState<Record<
    string,
    number
  > | null>(null);
  const ownBallotId = auth?.pubkey
    ? (ballots.get(auth.pubkey.toLowerCase())?.id ?? null)
    : null;
  useEffect(() => {
    let cancelled = false;
    const ev = auth?.pubkey ? ballots.get(auth.pubkey.toLowerCase()) : null;
    if (!ev || !auth || !pubkeys.publisherPubkey) {
      setOwnAllocations(null);
      return;
    }
    void (async () => {
      try {
        const signer = await getSigner(auth);
        const alloc = await decryptOwnBallot(
          signer,
          pubkeys.publisherPubkey!,
          ev,
        );
        if (!cancelled) setOwnAllocations(alloc);
      } catch {
        if (!cancelled) setOwnAllocations(null);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.pubkey, ownBallotId, pubkeys.publisherPubkey]);

  const totals = useMemo(() => {
    const budget = voterRows.reduce((s, r) => s + r.maxVotes, 0);
    const used = voterRows.reduce((s, r) => s + r.used, 0);
    return {
      budget,
      used,
      remaining: budget - used,
      votedCount: voterRows.filter((r) => r.voted).length,
      eligibleCount: voterRows.length,
    };
  }, [voterRows]);

  // Results stay hidden while open (ballots are encrypted); only the closed,
  // signed period carries the canonical tally + winners.
  const results: VotingResults | null =
    period?.status === "closed" ? period.results : null;

  const voter =
    period && auth?.pubkey
      ? (period.eligible.find(
          (v) => v.pubkey === auth.pubkey.toLowerCase(),
        ) ?? null)
      : null;

  const ownBallotEvent = auth?.pubkey
    ? (ballots.get(auth.pubkey.toLowerCase()) ?? null)
    : null;

  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [publishing, setPublishing] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const dirty = useRef(false);
  const maxVotes = voter?.maxVotes ?? 0;
  const blocked = useMemo(() => voter?.blocked ?? [], [voter]);
  const used = Object.values(allocations).reduce((sum, n) => sum + n, 0);
  const remaining = Math.max(0, maxVotes - used);
  const hasPrev = (ownBallotEvent?.created_at ?? 0) > 0 || !!ownAllocations;
  const isDirty = !allocationsEqual(allocations, ownAllocations ?? {});
  const resetKey = `${period?.openedAt ?? 0}:${auth?.pubkey ?? ""}`;
  const ownAllocationsKey = JSON.stringify(ownAllocations ?? {});

  useEffect(() => {
    dirty.current = false;
    setAllocations(ownAllocations ?? {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  useEffect(() => {
    if (!dirty.current) {
      setAllocations(ownAllocations ?? {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownAllocationsKey]);

  // Once the editor matches the published ballot again (the user reverted their
  // edits, or just published), clear the edit flag so later authoritative ballot
  // updates resume syncing into this tab. Only ever clears — adjustProjectVote
  // sets it — so a genuine ownAllocations change (isDirty flips true while the
  // editor is stale) still lets the sync effect above run.
  useEffect(() => {
    if (!isDirty) dirty.current = false;
  }, [isDirty]);

  const adjustProjectVote = useCallback(
    (projectId: string, delta: number) => {
      if (!voter || publishing || blocked.includes(projectId)) return;
      dirty.current = true;
      setAllocations((prev) => {
        const current = prev[projectId] ?? 0;
        const next = current + delta;
        if (next < 0) return prev;
        const prevUsed = Object.values(prev).reduce((sum, n) => sum + n, 0);
        if (delta > 0 && prevUsed >= maxVotes) return prev;
        const out = { ...prev };
        if (next === 0) delete out[projectId];
        else out[projectId] = next;
        return out;
      });
    },
    [blocked, maxVotes, publishing, voter],
  );

  const publishVotes = useCallback(async () => {
    if (
      !auth ||
      publishing ||
      used === 0 ||
      used > maxVotes ||
      !pubkeys.publisherPubkey
    ) {
      return;
    }
    setPublishing(true);
    try {
      const signer = await getSigner(auth);
      const ev = await publishBallot(
        signer,
        hackathonId,
        allocations,
        pubkeys.publisherPubkey,
        ownBallotEvent?.created_at ?? 0,
      );
      dirty.current = false;
      setBallots((prev) => {
        const next = new Map(prev);
        next.set(ev.pubkey.toLowerCase(), ev);
        return next;
      });
      setCelebrate(true);
      window.setTimeout(() => setCelebrate(false), 2400);
      push({
        kind: "success",
        title: hasPrev ? "Votos actualizados" : "Votos publicados",
        description: `Repartiste ${used} ${used === 1 ? "voto" : "votos"} firmados con tu clave Nostr.`,
      });
    } catch (error) {
      push({
        kind: "error",
        title: "No se pudo publicar tu voto",
        description:
          error instanceof Error ? error.message : "Error desconocido.",
      });
    } finally {
      setPublishing(false);
    }
  }, [
    allocations,
    auth,
    hackathonId,
    hasPrev,
    maxVotes,
    ownBallotEvent?.created_at,
    pubkeys.publisherPubkey,
    publishing,
    push,
    used,
  ]);

  return (
    <VotingContext.Provider
      value={{
        hackathonId,
        hackathonName,
        auth,
        ready,
        pubkeys,
        period,
        setPeriod,
        ballots,
        isAdmin,
        admin,
        voterRows,
        totals,
        results,
        voter,
        allocations,
        maxVotes,
        used,
        remaining,
        blocked,
        publishing,
        celebrate,
        hasPrev,
        isDirty,
        adjustProjectVote,
        publishVotes,
      }}
    >
      {children}
    </VotingContext.Provider>
  );
}

type VotingSectionProps = {
  hackathonId: string;
  hackathonName: string;
  initialPeriod: VotingPeriod | null;
};

export default function VotingSection(props: Partial<VotingSectionProps> = {}) {
  const context = useOptionalVotingContext();
  if (!context) {
    if (
      !props.hackathonId ||
      !props.hackathonName ||
      !("initialPeriod" in props)
    ) {
      throw new Error("VotingSection requires VotingProvider or voting props.");
    }
    return (
      <VotingProvider
        hackathonId={props.hackathonId}
        hackathonName={props.hackathonName}
        initialPeriod={props.initialPeriod ?? null}
      >
        <VotingSectionInner />
      </VotingProvider>
    );
  }
  return <VotingSectionInner />;
}

function VotingSectionInner() {
  const {
    hackathonId,
    hackathonName,
    auth,
    ready,
    period,
    isAdmin,
    admin,
    voterRows,
    totals,
    results,
    voter,
  } = useVotingContext();
  const [detailOpen, setDetailOpen] = useState(false);

  // Nothing to show before the first opening (admins see the open button).
  if (!period && !isAdmin) return null;

  return (
    <section id="votacion-comunitaria" className="scroll-mt-24 pb-12">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-nostr/30 bg-background-card p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
            <div className="flex items-center gap-2">
              <Vote className="h-4 w-4 text-nostr" />
              <h3 className="font-display font-bold text-sm uppercase tracking-widest text-foreground-muted">
                Votación comunitaria
              </h3>
              {isVotingTestNamespace() && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-lightning/10 border border-lightning/40 text-[9px] font-mono font-bold tracking-widest text-lightning">
                  MODO TEST
                </span>
              )}
              {period && (
                <span
                  className={cn(
                    "inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-mono font-semibold tracking-widest",
                    period.status === "open"
                      ? "text-success bg-success/10"
                      : "text-bitcoin bg-bitcoin/10",
                  )}
                >
                  {period.status === "open" ? "ABIERTA" : "CERRADA"}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {period && (
                <button
                  type="button"
                  onClick={() => setDetailOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white/[0.03] px-3 py-1.5 text-[11px] font-mono font-bold uppercase tracking-widest text-foreground-muted hover:bg-white/[0.06] transition-colors"
                >
                  <ListChecks className="h-3.5 w-3.5" />
                  Ver padrón ({totals.votedCount}/{totals.eligibleCount})
                </button>
              )}
              {isAdmin && <AdminVotingControls period={period} admin={admin} />}
            </div>
          </div>

          {!period ? (
            <div className="space-y-4">
              <p className="text-sm text-foreground-muted">
                La votación comunitaria de {hackathonName} todavía no fue
                abierta.
              </p>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => admin.runAction("open-voting")}
                  disabled={admin.busy}
                  className="inline-flex items-center gap-2 rounded-xl border border-success/50 bg-success/15 px-6 py-3 text-base font-display font-bold text-success hover:bg-success/25 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  {admin.busy ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Megaphone className="h-5 w-5" />
                  )}
                  Arrancar votación
                </button>
              )}
            </div>
          ) : (
            <>
              <p className="text-sm text-foreground-muted">
                {period.status === "open"
                  ? `La comunidad elige a los ganadores. Vota cualquiera que haya participado de algún hackatón y tenga su identidad Nostr vinculada — ${VOTES_PER_HACKATHON} votos por hackatón participado, repartidos como quieras.`
                  : "La votación está cerrada. Estos son los resultados oficiales."}
              </p>

              {period.status === "open" && (
                <VotingProgressBar
                  voted={totals.votedCount}
                  eligible={totals.eligibleCount}
                />
              )}

              {period.status === "open" && ready && (
                <div className="mt-4">
                  {!auth ? (
                    <p className="text-xs font-mono text-foreground-subtle">
                      Iniciá sesión con Nostr para votar.
                    </p>
                  ) : !voter ? (
                    <p className="text-xs font-mono text-foreground-subtle">
                      Solo pueden votar quienes participaron de algún hackatón y
                      tienen su identidad Nostr vinculada.
                    </p>
                  ) : null}
                </div>
              )}

              {period.status === "open" && (
                <p className="mt-5 text-[11px] font-mono text-foreground-subtle inline-flex items-center gap-1.5">
                  <Lock className="h-3 w-3" />
                  Los votos van cifrados a La Crypta. Los resultados se revelan
                  al cerrar la votación — por ahora solo se ve quién votó.
                </p>
              )}

              {period.status === "closed" && results && (
                <>
                  <LiveTally results={results} closed />
                  {results.winners && results.winners.length > 0 && (
                    <WinnersPanel
                      winners={results.winners}
                      hackathonId={hackathonId}
                      countedBallots={results.countedBallotIds?.length ?? 0}
                    />
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {detailOpen && period && (
        <VotingDetailModal
          period={period}
          rows={voterRows}
          totals={totals}
          closed={period.status === "closed"}
          isAdmin={isAdmin}
          onClose={() => setDetailOpen(false)}
        />
      )}
    </section>
  );
}

/**
 * Compact voting action bar — "Ver padrón" + the admin open/close controls +
 * the padrón modal. Extracted from the section card so the hackathon page can
 * fold these buttons into the voting hero (the card itself is now only used by
 * /dev/voting). Reads the shared VotingProvider context, so it must render
 * inside a `<VotingProvider>`. Renders nothing for a non-admin before voting
 * has opened.
 */
export function HackathonVotingActions() {
  const { period, isAdmin, admin, voterRows, totals } = useVotingContext();
  const [detailOpen, setDetailOpen] = useState(false);

  if (!period && !isAdmin) return null;

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {period && (
          <button
            type="button"
            onClick={() => setDetailOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white/[0.03] px-3 py-1.5 text-[11px] font-mono font-bold uppercase tracking-widest text-foreground-muted hover:bg-white/[0.06] transition-colors"
          >
            <ListChecks className="h-3.5 w-3.5" />
            Ver padrón ({totals.votedCount}/{totals.eligibleCount})
          </button>
        )}
        {isAdmin && <AdminVotingControls period={period} admin={admin} />}
      </div>

      {detailOpen && period && (
        <VotingDetailModal
          period={period}
          rows={voterRows}
          totals={totals}
          closed={period.status === "closed"}
          isAdmin={isAdmin}
          onClose={() => setDetailOpen(false)}
        />
      )}
    </>
  );
}

/* ───────────────────────── Detail modal ───────────────────────── */

function VotingDetailModal({
  period,
  rows,
  totals,
  closed,
  isAdmin,
  onClose,
}: {
  period: VotingPeriod;
  rows: VoterRow[];
  totals: {
    budget: number;
    used: number;
    remaining: number;
    votedCount: number;
    eligibleCount: number;
  };
  closed: boolean;
  isAdmin: boolean;
  onClose: () => void;
}) {
  useScrollLock(true);
  // SSR-safe portal: stay null on the server and the first client render, then
  // mount into <body> after hydration.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Admins can reveal each voter's actual allocations on demand. Ballots are
  // encrypted, so one `close-preview` decrypt (admin-gated, no publish) loads
  // every voter's breakdown; we only fetch it the first time a voter is opened.
  // Only available while open — once closed the round can't be previewed.
  const canReveal = isAdmin && !closed;
  const tally = useAdminLiveTally(period.hackathonId);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const projectNames = useMemo(
    () => new Map(period.projects.map((p) => [p.id, p.name])),
    [period.projects],
  );
  const perVoterMap = useMemo(() => {
    const map = new Map<string, AdminVoterAllocation>();
    for (const v of tally.perVoter ?? []) map.set(v.pubkey.toLowerCase(), v);
    return map;
  }, [tally.perVoter]);

  const toggleReveal = useCallback(
    (pubkey: string) => {
      if (!tally.perVoter && !tally.loading) void tally.refresh();
      setExpanded((prev) => {
        const key = pubkey.toLowerCase();
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    },
    [tally],
  );

  if (!mounted) return null;
  // Portal to <body>: the hero folds this in under a transformed,
  // overflow-hidden motion.div, which would otherwise clip a fixed child.
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-2xl border border-border bg-background-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-nostr" />
            <h4 className="font-display font-bold">Padrón y votos</h4>
            <span
              className={cn(
                "inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-mono font-semibold tracking-widest",
                closed ? "text-bitcoin bg-bitcoin/10" : "text-success bg-success/10",
              )}
            >
              {closed ? "CERRADA" : "ABIERTA"}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-foreground-muted hover:text-foreground transition-colors"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Totals */}
        <div className="grid grid-cols-3 gap-px bg-border">
          <Stat label="Votos emitidos" value={totals.used} accent="text-nostr" />
          <Stat
            label="Puntos restantes"
            value={totals.remaining}
            accent="text-lightning"
          />
          <Stat
            label="Votaron"
            value={`${totals.votedCount}/${totals.eligibleCount}`}
            accent="text-success"
          />
        </div>

        {/* Per-voter roll */}
        <div className="flex-1 overflow-y-auto">
          <ul className="divide-y divide-border/60">
            {rows.map((r) => {
              const isOpen = expanded.has(r.pubkey.toLowerCase());
              const revealable = canReveal && r.voted;
              return (
                <li
                  key={r.pubkey}
                  className={cn("px-5 py-2.5", r.voted ? "bg-success/[0.04]" : "")}
                >
                  <div className="flex items-center gap-3">
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold truncate">
                        {r.name}
                      </span>
                      <span className="block text-[10px] font-mono text-foreground-subtle">
                        {r.used}/{r.maxVotes} votos declarados · {r.remaining}{" "}
                        restante{r.remaining === 1 ? "" : "s"}
                      </span>
                    </span>
                    {r.voted ? (
                      revealable ? (
                        <button
                          type="button"
                          onClick={() => toggleReveal(r.pubkey)}
                          aria-expanded={isOpen}
                          className="inline-flex items-center gap-1 rounded-md border border-success/40 bg-success/10 px-2 py-1 text-[10px] font-mono font-bold text-success hover:bg-success/20 transition-colors"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          VOTÓ
                          <ChevronDown
                            className={cn(
                              "h-3 w-3 transition-transform",
                              isOpen && "rotate-180",
                            )}
                          />
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-success">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          VOTÓ
                        </span>
                      )
                    ) : (
                      <span className="text-[10px] font-mono text-foreground-subtle">
                        SIN VOTAR
                      </span>
                    )}
                  </div>

                  {revealable && isOpen && (
                    <VoterBallotBreakdown
                      voter={perVoterMap.get(r.pubkey.toLowerCase()) ?? null}
                      loading={tally.loading && !tally.perVoter}
                      error={tally.error}
                      projectNames={projectNames}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="px-5 py-3 border-t border-border text-[10px] font-mono text-foreground-subtle inline-flex items-center gap-1.5">
          <Lock className="h-3 w-3 shrink-0" />
          {closed
            ? "Resultados congelados y publicados en Nostr."
            : canReveal
              ? "Tocá “VOTÓ” para descifrar qué votó cada quien — solo lo ves vos, no se publica nada."
              : "Los votos están cifrados — el detalle (qué votó cada uno) se revela al cerrar la votación."}
          {" · "}
          {period.projects.length} proyectos votables
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Admin-only expanded breakdown of one voter's decrypted allocations. */
function VoterBallotBreakdown({
  voter,
  loading,
  error,
  projectNames,
}: {
  voter: AdminVoterAllocation | null;
  loading: boolean;
  error: string | null;
  projectNames: Map<string, string>;
}) {
  if (loading) {
    return (
      <div className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-black/20 px-3 py-2 text-[11px] font-mono text-foreground-subtle">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Descifrando voto…
      </div>
    );
  }
  if (error) {
    return (
      <div className="mt-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-[11px] font-mono text-danger">
        {error}
      </div>
    );
  }
  const entries = Object.entries(voter?.allocations ?? {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  if (!voter || entries.length === 0) {
    return (
      <div className="mt-2 rounded-lg border border-border bg-black/20 px-3 py-2 text-[11px] font-mono text-foreground-subtle">
        No se pudo descifrar este voto.
      </div>
    );
  }
  return (
    <ul className="mt-2 space-y-1 rounded-lg border border-border bg-black/20 px-3 py-2">
      {entries.map(([projectId, count]) => (
        <li
          key={projectId}
          className="flex items-center justify-between gap-2 text-[11px] font-mono"
        >
          <span className="min-w-0 truncate text-foreground-muted">
            {projectNames.get(projectId) ?? projectId}
          </span>
          <span className="shrink-0 font-bold tabular-nums text-nostr">
            {count} {count === 1 ? "voto" : "votos"}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent: string;
}) {
  return (
    <div className="bg-background-card px-4 py-3 text-center">
      <div className={cn("font-display text-2xl font-bold tabular-nums", accent)}>
        {value}
      </div>
      <div className="text-[9px] font-mono uppercase tracking-widest text-foreground-subtle mt-1">
        {label}
      </div>
    </div>
  );
}

/* ───────────────────────── Live progress ───────────────────────── */

function VotingProgressBar({
  voted,
  eligible,
}: {
  voted: number;
  eligible: number;
}) {
  const pct = eligible > 0 ? Math.round((voted / eligible) * 100) : 0;
  return (
    <div className="mt-4 rounded-xl border border-border bg-black/20 px-4 py-3">
      <div className="flex items-center justify-between text-[11px] font-mono">
        <span className="inline-flex items-center gap-1.5 font-bold uppercase tracking-[0.18em] text-success">
          <Radio className="h-3 w-3 animate-pulse" />
          Votación en vivo
        </span>
        <span className="tabular-nums text-foreground-muted">
          <span className="font-bold text-success">{voted}</span> / {eligible}{" "}
          votaron · <span className="font-bold text-foreground">{pct}%</span>
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.06]">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-nostr via-bitcoin to-lightning"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

/* ───────────────────────── Admin controls ───────────────────────── */

type AdminStep = "idle" | "signing" | "publishing" | "previewing";

function useAdminVoting(
  hackathonId: string,
  onPeriod: (period: VotingPeriod) => void,
) {
  const { auth } = useAuth();
  const { push } = useToast();
  const [step, setStep] = useState<AdminStep>("idle");
  const busy = step !== "idle";
  // The exact ballot set the admin reviewed in the preview — posted verbatim on
  // confirm so the signed result freezes precisely what was shown.
  const frozenBallots = useRef<SignedEvent[]>([]);

  const signRequest = useCallback(
    async (action: string, extraTags: string[][] = []) => {
      const signer = await getSigner(auth!);
      return signer.signEvent({
        kind: 27235,
        pubkey: signer.pubkey,
        created_at: Math.floor(Date.now() / 1000),
        content: `${action} · votación comunitaria`,
        tags: [
          ["u", `/api/hackathons/${hackathonId}/voting`],
          ["method", "POST"],
          ["action", action],
          ["h", hackathonId],
          ...extraTags,
        ],
      });
    },
    [auth, hackathonId],
  );

  /** Open / refresh-padrón (no encryption involved at open). */
  const runAction = useCallback(
    async (action: "open-voting", force = false) => {
      if (!auth || busy) return;
      setStep("signing");
      try {
        const request = await signRequest(
          action,
          force ? [["force", "1"]] : [],
        );
        setStep("publishing");
        const res = await fetch(`/api/hackathons/${hackathonId}/voting`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ request }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          status?: "open" | "closed";
          eligibleCount?: number;
          notifications?: {
            attempted: number;
            delivered: number;
            failed: number;
          } | null;
          error?: string;
        };
        if (!res.ok || !data.ok) {
          throw new Error(data.error || "No se pudo actualizar la votación.");
        }
        const fresh = await fetch(
          `/api/hackathons/${hackathonId}/voting`,
        ).then((r) => (r.ok ? r.json() : null));
        if (fresh?.period) onPeriod(fresh.period as VotingPeriod);
        const notices = data.notifications
          ? ` NIP-04: ${data.notifications.delivered}/${data.notifications.attempted} enviados.`
          : "";
        push({
          kind: "success",
          title: "Votación abierta",
          description: `${data.eligibleCount ?? 0} votantes habilitados.${notices}`,
        });
      } catch (error) {
        push({
          kind: "error",
          title: "Error de votación",
          description:
            error instanceof Error ? error.message : "Error desconocido.",
        });
      } finally {
        setStep("idle");
      }
    },
    [auth, busy, hackathonId, onPeriod, push, signRequest],
  );

  /** Close step 1: fetch all ballots, ask the backend to decrypt + tally them
   *  into a preview the admin reviews. Nothing is published. */
  const closePreview = useCallback(async (): Promise<ClosePreviewData | null> => {
    if (!auth || busy) return null;
    setStep("previewing");
    try {
      const ballots = await fetchAllBallotEvents(hackathonId);
      frozenBallots.current = ballots;
      const request = await signRequest("close-preview");
      const res = await fetch(`/api/hackathons/${hackathonId}/voting`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ request, ballots }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        preview?: ClosePreviewData;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.preview) {
        throw new Error(data.error || "No se pudo previsualizar el cierre.");
      }
      return data.preview;
    } catch (error) {
      push({
        kind: "error",
        title: "Error al previsualizar",
        description:
          error instanceof Error ? error.message : "Error desconocido.",
      });
      return null;
    } finally {
      setStep("idle");
    }
  }, [auth, busy, hackathonId, push, signRequest]);

  /** Close step 2: the admin authorizes — re-post the SAME frozen ballot set;
   *  the backend re-validates, signs and publishes the frozen result. */
  const closeConfirm = useCallback(async (): Promise<boolean> => {
    if (!auth || busy) return false;
    setStep("publishing");
    try {
      const request = await signRequest("close-confirm");
      const res = await fetch(`/api/hackathons/${hackathonId}/voting`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ request, ballots: frozenBallots.current }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "No se pudo cerrar la votación.");
      }
      const fresh = await fetch(
        `/api/hackathons/${hackathonId}/voting`,
      ).then((r) => (r.ok ? r.json() : null));
      if (fresh?.period) onPeriod(fresh.period as VotingPeriod);
      push({
        kind: "success",
        title: "Votación cerrada",
        description: "El resultado quedó firmado y publicado en Nostr.",
      });
      return true;
    } catch (error) {
      push({
        kind: "error",
        title: "Error al cerrar",
        description:
          error instanceof Error ? error.message : "Error desconocido.",
      });
      return false;
    } finally {
      setStep("idle");
    }
  }, [auth, busy, hackathonId, onPeriod, push, signRequest]);

  return { step, busy, runAction, closePreview, closeConfirm };
}

type AdminVoting = ReturnType<typeof useAdminVoting>;

function AdminVotingControls({
  period,
  admin,
}: {
  period: VotingPeriod | null;
  admin: AdminVoting;
}) {
  const { step, busy, runAction, closePreview, closeConfirm } = admin;
  const [preview, setPreview] = useState<ClosePreviewData | null>(null);
  useScrollLock(!!preview);

  const label =
    step === "signing"
      ? "Firmando…"
      : step === "previewing"
        ? "Descifrando…"
        : step === "publishing"
          ? "Publicando…"
          : null;

  async function handleStartClose() {
    const p = await closePreview();
    if (p) setPreview(p);
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {(!period || period.status === "closed") && (
          <button
            type="button"
            onClick={() => runAction("open-voting", period?.status === "closed")}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg border border-success/40 bg-success/10 px-3 py-1.5 text-[11px] font-mono font-bold uppercase tracking-widest text-success hover:bg-success/20 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Megaphone className="h-3.5 w-3.5" />
            )}
            {label ??
              (period?.status === "closed"
                ? "Reabrir votación"
                : "Abrir votación")}
          </button>
        )}
        {period?.status === "open" && (
          <>
            <button
              type="button"
              onClick={() => runAction("open-voting")}
              disabled={busy}
              title="Vuelve a publicar el padrón y la lista de proyectos sin reiniciar la votación"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-white/[0.03] px-3 py-1.5 text-[11px] font-mono font-bold uppercase tracking-widest text-foreground-muted hover:bg-white/[0.06] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              Actualizar padrón
            </button>
            <button
              type="button"
              onClick={handleStartClose}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg border border-bitcoin/40 bg-bitcoin/10 px-3 py-1.5 text-[11px] font-mono font-bold uppercase tracking-widest text-bitcoin hover:bg-bitcoin/20 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Lock className="h-3.5 w-3.5" />
              )}
              {label ?? "Cerrar votación"}
            </button>
          </>
        )}
      </div>

      {preview && period && (
        <CloseReviewModal
          period={period}
          preview={preview}
          busy={busy}
          onCancel={() => !busy && setPreview(null)}
          onConfirm={async () => {
            const ok = await closeConfirm();
            if (ok) setPreview(null);
          }}
        />
      )}
    </>
  );
}

/* ─────────────────── Close review modal (admin verifies) ─────────────────── */

function CloseReviewModal({
  period,
  preview,
  busy,
  onCancel,
  onConfirm,
}: {
  period: VotingPeriod;
  preview: ClosePreviewData;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useScrollLock(true);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const projectName = useMemo(
    () => new Map(period.projects.map((p) => [p.id, p.name])),
    [period.projects],
  );
  const counted = preview.countedBallotIds.length;
  if (!mounted) return null;
  // Portal to <body>: same reason as the padrón modal — the admin controls now
  // live inside the hero's transformed, overflow-hidden card.
  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-xl max-h-[88vh] flex flex-col rounded-2xl border border-border bg-background-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
          <h4 className="font-display font-bold text-lg">Revisar y cerrar</h4>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="text-foreground-muted hover:text-foreground transition-colors"
            aria-label="Cancelar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-border text-xs text-foreground-muted">
          La Crypta descifró los votos. Revisá el resultado antes de firmarlo —
          una vez confirmado, estos {counted} voto{counted === 1 ? "" : "s"}{" "}
          quedan congelados y los posteriores no cuentan.
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Ranking */}
          <div>
            <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-foreground-subtle mb-2">
              Ranking ({preview.winners.length})
            </div>
            <ol className="space-y-1">
              {preview.winners.map((w) => (
                <li
                  key={w.projectId}
                  className="flex items-center gap-2 rounded-lg border border-border bg-white/[0.02] px-3 py-1.5"
                >
                  <span className="w-6 text-center text-sm font-mono font-bold text-bitcoin tabular-nums">
                    {w.position}°
                  </span>
                  <span className="flex-1 min-w-0 text-sm font-semibold truncate">
                    {w.projectName}
                  </span>
                  <span className="text-sm font-mono font-bold text-nostr tabular-nums">
                    {w.votes}
                  </span>
                </li>
              ))}
              {preview.winners.length === 0 && (
                <li className="text-xs text-foreground-subtle">
                  Nadie recibió votos.
                </li>
              )}
            </ol>
          </div>

          {/* Per-voter decrypted ballots */}
          <div>
            <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-foreground-subtle mb-2">
              Votos por votante ({preview.perVoter.length})
            </div>
            <ul className="divide-y divide-border/60 rounded-lg border border-border overflow-hidden">
              {preview.perVoter.map((v) => (
                <li key={v.pubkey} className="px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold truncate">
                      {v.name}
                    </span>
                    <span className="text-[10px] font-mono text-foreground-subtle">
                      {v.total} voto{v.total === 1 ? "" : "s"}
                    </span>
                  </div>
                  <ul className="mt-1 flex flex-wrap gap-1.5">
                    {Object.entries(v.allocations)
                      .sort((a, b) => b[1] - a[1])
                      .map(([projectId, votes]) => (
                        <li
                          key={projectId}
                          className="inline-flex items-center gap-1 rounded-md border border-nostr/30 bg-nostr/5 px-2 py-0.5 text-[10px] font-mono text-nostr"
                        >
                          <span className="truncate max-w-[18ch]">
                            {projectName.get(projectId) ?? projectId}
                          </span>
                          <span className="font-bold tabular-nums">
                            ×{votes}
                          </span>
                        </li>
                      ))}
                  </ul>
                </li>
              ))}
              {preview.perVoter.length === 0 && (
                <li className="px-3 py-2 text-xs text-foreground-subtle">
                  Ningún voto válido todavía.
                </li>
              )}
            </ul>
          </div>

          {/* Rejected */}
          {preview.rejected.length > 0 && (
            <div>
              <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-danger mb-2">
                Rechazados ({preview.rejected.length})
              </div>
              <ul className="space-y-1">
                {preview.rejected.map((r, i) => (
                  <li
                    key={`${r.pubkey}:${i}`}
                    className="flex items-center justify-between gap-2 text-[10px] font-mono text-foreground-subtle"
                  >
                    <span className="truncate">{r.pubkey.slice(0, 16)}…</span>
                    <span className="text-danger">{r.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-border px-4 py-2 text-sm text-foreground-muted hover:text-foreground transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg border border-bitcoin/40 bg-bitcoin/15 px-4 py-2 text-sm font-semibold text-bitcoin hover:bg-bitcoin/25 disabled:opacity-60 transition-colors"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirmar y publicar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ───────────────────────── Project-list voting controls ───────────────────────── */

export function ProjectVotingToolbar() {
  const voting = useOptionalVotingContext();
  if (
    !voting?.period ||
    voting.period.status !== "open" ||
    !voting.ready ||
    !voting.auth ||
    !voting.voter
  ) {
    return null;
  }

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-lightning/30 bg-lightning/[0.06] px-3 py-3">
      <div className="inline-flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="inline-flex items-center gap-2">
          <Coins className="h-4 w-4 text-lightning" />
          <span className="font-display text-base font-black tabular-nums">
            {voting.remaining}
            <span className="text-foreground-subtle">/{voting.maxVotes}</span>
          </span>
          <span className="text-[10px] font-mono uppercase tracking-widest text-foreground-muted">
            {voting.remaining === 0
              ? "todo repartido"
              : `${voting.remaining === 1 ? "voto" : "votos"} por repartir`}
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          {Array.from({ length: Math.min(voting.maxVotes, 10) }).map((_, i) => {
            const spent = i >= voting.remaining;
            return (
              <span
                key={i}
                className={cn(
                  "h-2.5 w-2.5 rounded-full border transition-colors",
                  spent
                    ? "border-border bg-white/5"
                    : "border-lightning/60 bg-lightning shadow-[0_0_8px_rgba(255,215,0,0.55)]",
                )}
              />
            );
          })}
          {voting.maxVotes > 10 && (
            <span className="text-[10px] font-mono font-bold text-lightning">
              +{voting.maxVotes - 10}
            </span>
          )}
        </span>
        {voting.hasPrev && (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono text-foreground-subtle">
            <CheckCircle2 className="h-3 w-3 text-success" />
            Ya votaste
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <AnimatePresence>
          {voting.celebrate && (
            <motion.span
              initial={{ opacity: 0, scale: 0.85, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.85 }}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-success/40 bg-success/10 px-3 py-1.5 text-xs font-mono font-bold text-success"
            >
              <PartyPopper className="h-4 w-4" />
              ¡Voto publicado!
            </motion.span>
          )}
        </AnimatePresence>
        {/* Save-changes affordance: surfaced only when the on-screen ballot
            differs from what's published. Stays visible (but disabled) for an
            empty edit so a ballot cleared to zero isn't silently unsavable. */}
        {voting.isDirty && (
          <button
            type="button"
            onClick={voting.publishVotes}
            disabled={
              voting.publishing ||
              voting.used === 0 ||
              voting.used > voting.maxVotes
            }
            className="inline-flex items-center gap-2 rounded-lg border border-nostr/40 bg-nostr/10 px-4 py-2 text-sm font-semibold text-nostr hover:bg-nostr/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {voting.publishing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Vote className="h-4 w-4" />
            )}
            {voting.publishing
              ? "Publicando…"
              : voting.hasPrev
                ? "Actualizar votos"
                : "Publicar votos"}
          </button>
        )}
      </div>
    </div>
  );
}

export function ProjectVotingControls({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const voting = useOptionalVotingContext();
  if (
    !voting?.period ||
    voting.period.status !== "open" ||
    !voting.ready ||
    !voting.auth ||
    !voting.voter ||
    !voting.period.projects.some((project) => project.id === projectId)
  ) {
    return null;
  }

  const isBlocked = voting.blocked.includes(projectId);
  const count = voting.allocations[projectId] ?? 0;
  if (isBlocked) {
    return (
      <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[9px] font-mono font-semibold uppercase tracking-widest text-foreground-subtle">
        Tu proyecto
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 rounded-lg border border-border bg-white/[0.02] px-2 py-1">
      <button
        type="button"
        onClick={() => voting.adjustProjectVote(projectId, -1)}
        disabled={voting.publishing || count === 0}
        aria-label={`Quitar voto a ${projectName}`}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-foreground-muted hover:text-foreground hover:border-border-strong disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <motion.span
        key={count}
        initial={{ scale: 1.4 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 20 }}
        className={cn(
          "w-6 text-center text-sm font-mono font-bold tabular-nums",
          count > 0 ? "text-nostr" : "text-foreground-subtle",
        )}
      >
        {count}
      </motion.span>
      <button
        type="button"
        onClick={() => voting.adjustProjectVote(projectId, 1)}
        disabled={voting.publishing || voting.remaining <= 0}
        aria-label={`Sumar voto a ${projectName}`}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-foreground-muted hover:text-foreground hover:border-border-strong disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

/* ───────────────────────── Tally board ───────────────────────── */

/* ───────────────────────── Winners (post-close) ───────────────────────── */

const MEDAL = ["🥇", "🥈", "🥉"];

function WinnersPanel({
  winners,
  hackathonId,
  countedBallots,
}: {
  winners: VotingWinner[];
  hackathonId: string;
  countedBallots: number;
}) {
  return (
    <div className="mt-6">
      <div className="flex items-center gap-2 mb-2">
        <Trophy className="h-4 w-4 text-bitcoin" />
        <span className="text-[10px] font-mono font-semibold tracking-widest text-foreground-subtle uppercase">
          Ganadores de la comunidad
        </span>
      </div>
      <ol className="space-y-1.5">
        {winners.map((w) => (
          <li
            key={w.projectId}
            className="flex items-center gap-3 rounded-lg border border-border bg-white/[0.02] px-3 py-2"
          >
            <span className="w-7 text-center text-base tabular-nums">
              {MEDAL[w.position - 1] ?? `${w.position}°`}
            </span>
            <Link
              href={`/hackathons/${hackathonSlugForId(hackathonId)}/${w.projectId}`}
              className="flex-1 min-w-0 text-sm font-semibold truncate hover:text-bitcoin transition-colors"
            >
              {w.projectName}
            </Link>
            <span className="text-sm font-mono font-bold text-nostr tabular-nums">
              {w.votes} {w.votes === 1 ? "voto" : "votos"}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[10px] font-mono text-foreground-subtle">
        Resultado firmado por La Crypta · {countedBallots} voto
        {countedBallots === 1 ? "" : "s"} contado
        {countedBallots === 1 ? "" : "s"}. La entrega de premios (Lightning y
        badges) se realiza por separado.
      </p>
    </div>
  );
}
