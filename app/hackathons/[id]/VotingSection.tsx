"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  Lock,
  Megaphone,
  Minus,
  Plus,
  Trophy,
  Vote,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getSigner, type SignedEvent } from "@/lib/nostrSigner";
import { useToast } from "@/components/Toast";
import { useScrollLock } from "@/lib/useScrollLock";
import { cn } from "@/lib/cn";
import {
  isVotingTestNamespace,
  tallyBallots,
  type VotingPeriod,
  type VotingResults,
} from "@/lib/voting";
import {
  publishBallot,
  subscribeToBallots,
  subscribeToVotingPeriod,
} from "@/lib/votingClient";

type Pubkeys = { adminPubkey: string | null; publisherPubkey: string | null };

/**
 * Community voting for the hackathon's projects. Eligibility, vote budgets and
 * the votable project list come frozen inside the period event La Crypta
 * publishes when the admin opens the voting; ballots are replaceable Nostr
 * events signed by each voter. While open the tally is computed live from
 * relay ballots; once closed the embedded official results are rendered
 * verbatim (the freeze rule — late ballots can't change a signed result).
 */
export default function VotingSection({
  hackathonId,
  hackathonName,
  initialPeriod,
}: {
  hackathonId: string;
  hackathonName: string;
  initialPeriod: VotingPeriod | null;
}) {
  const { auth, ready } = useAuth();

  const [pubkeys, setPubkeys] = useState<Pubkeys>({
    adminPubkey: null,
    publisherPubkey: null,
  });
  const [period, setPeriod] = useState<VotingPeriod | null>(initialPeriod);
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

  const liveTally = useMemo(() => {
    if (!period) return null;
    return tallyBallots([...ballots.values()], period);
  }, [ballots, period]);

  // Nothing to show before the first opening (admins see the open button).
  if (!period && !isAdmin) return null;

  const results: VotingResults | null =
    period?.status === "closed"
      ? period.results
      : (liveTally?.results ?? null);

  const voter =
    period && auth?.pubkey
      ? (period.eligible.find(
          (v) => v.pubkey === auth.pubkey.toLowerCase(),
        ) ?? null)
      : null;

  const ownBallotEvent = auth?.pubkey
    ? (ballots.get(auth.pubkey.toLowerCase()) ?? null)
    : null;
  const ownAllocations =
    voter && auth?.pubkey
      ? (liveTally?.byVoter.get(auth.pubkey.toLowerCase()) ?? null)
      : null;

  return (
    <section className="pb-12">
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
            {isAdmin && (
              <AdminVotingControls
                hackathonId={hackathonId}
                period={period}
                onPeriod={setPeriod}
              />
            )}
          </div>

          {!period ? (
            <p className="text-sm text-foreground-muted">
              La votación comunitaria de {hackathonName} todavía no fue abierta.
            </p>
          ) : (
            <>
              <p className="text-sm text-foreground-muted">
                {period.status === "open"
                  ? "La comunidad elige a los ganadores. Vota cualquiera que haya participado de algún hackatón y tenga su identidad Nostr vinculada — 1 voto por hackatón participado, repartidos como quieras."
                  : "La votación está cerrada. Estos son los resultados oficiales."}
              </p>

              {period.status === "open" && ready && (
                <div className="mt-4">
                  {!auth ? (
                    <p className="text-xs font-mono text-foreground-subtle">
                      Iniciá sesión con Nostr para votar.
                    </p>
                  ) : voter ? (
                    <BallotEditor
                      key={`${period.openedAt}:${auth.pubkey}`}
                      hackathonId={hackathonId}
                      period={period}
                      voterPubkey={auth.pubkey.toLowerCase()}
                      maxVotes={voter.maxVotes}
                      blocked={voter.blocked}
                      initialAllocations={ownAllocations}
                      prevBallotCreatedAt={ownBallotEvent?.created_at ?? 0}
                      onPublished={(ev) => {
                        setBallots((prev) => {
                          const next = new Map(prev);
                          next.set(ev.pubkey.toLowerCase(), ev);
                          return next;
                        });
                      }}
                    />
                  ) : (
                    <p className="text-xs font-mono text-foreground-subtle">
                      Solo pueden votar quienes participaron de algún hackatón y
                      tienen su identidad Nostr vinculada.
                    </p>
                  )}
                </div>
              )}

              {results && (
                <TallyBoard
                  results={results}
                  closed={period.status === "closed"}
                />
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── Admin controls ───────────────────────── */

type AdminStep = "idle" | "signing" | "publishing";

function AdminVotingControls({
  hackathonId,
  period,
  onPeriod,
}: {
  hackathonId: string;
  period: VotingPeriod | null;
  onPeriod: (period: VotingPeriod) => void;
}) {
  const { auth } = useAuth();
  const { push } = useToast();
  const [step, setStep] = useState<AdminStep>("idle");
  const [confirmClose, setConfirmClose] = useState(false);
  useScrollLock(confirmClose);

  const busy = step !== "idle";

  const runAction = useCallback(
    async (action: "open-voting" | "close-voting", force = false) => {
      if (!auth || busy) return;
      setStep("signing");
      try {
        const signer = await getSigner(auth);
        const tags: string[][] = [
          ["u", `/api/hackathons/${hackathonId}/voting`],
          ["method", "POST"],
          ["action", action],
          ["h", hackathonId],
        ];
        if (force) tags.push(["force", "1"]);
        const request = await signer.signEvent({
          kind: 27235,
          pubkey: signer.pubkey,
          created_at: Math.floor(Date.now() / 1000),
          content:
            action === "open-voting"
              ? "Abrir votación comunitaria"
              : "Cerrar votación comunitaria",
          tags,
        });

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
          error?: string;
        };
        if (!res.ok || !data.ok) {
          throw new Error(data.error || "No se pudo actualizar la votación.");
        }

        // Optimistic refresh — the relay subscription will confirm shortly.
        const fresh = await fetch(
          `/api/hackathons/${hackathonId}/voting`,
        ).then((r) => (r.ok ? r.json() : null));
        if (fresh?.period) onPeriod(fresh.period as VotingPeriod);

        push({
          kind: "success",
          title:
            data.status === "open" ? "Votación abierta" : "Votación cerrada",
          description:
            data.status === "open"
              ? `${data.eligibleCount ?? 0} votantes habilitados.`
              : "Los resultados quedaron congelados y publicados en Nostr.",
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
        setConfirmClose(false);
      }
    },
    [auth, busy, hackathonId, onPeriod, push],
  );

  const label =
    step === "signing"
      ? "Firmando…"
      : step === "publishing"
        ? "Publicando…"
        : null;

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
              onClick={() => setConfirmClose(true)}
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

      {confirmClose && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => !busy && setConfirmClose(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-background-card p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-display font-bold text-lg">
                ¿Cerrar la votación?
              </h4>
              <button
                type="button"
                onClick={() => setConfirmClose(false)}
                disabled={busy}
                className="text-foreground-muted hover:text-foreground transition-colors"
                aria-label="Cancelar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-foreground-muted leading-relaxed">
              Se calculará el resultado final con los votos recibidos hasta
              ahora y se publicará firmado por La Crypta. Después del cierre
              los votos nuevos no cuentan.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmClose(false)}
                disabled={busy}
                className="rounded-lg border border-border px-4 py-2 text-sm text-foreground-muted hover:text-foreground transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => runAction("close-voting")}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-lg border border-bitcoin/40 bg-bitcoin/15 px-4 py-2 text-sm font-semibold text-bitcoin hover:bg-bitcoin/25 disabled:opacity-60 transition-colors"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Cerrar y publicar resultados
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ───────────────────────── Ballot editor ───────────────────────── */

function BallotEditor({
  hackathonId,
  period,
  voterPubkey,
  maxVotes,
  blocked,
  initialAllocations,
  prevBallotCreatedAt,
  onPublished,
}: {
  hackathonId: string;
  period: VotingPeriod;
  voterPubkey: string;
  maxVotes: number;
  blocked: string[];
  initialAllocations: Record<string, number> | null;
  prevBallotCreatedAt: number;
  onPublished: (ev: SignedEvent) => void;
}) {
  const { auth } = useAuth();
  const { push } = useToast();
  const [allocations, setAllocations] = useState<Record<string, number>>(
    initialAllocations ?? {},
  );
  const [publishing, setPublishing] = useState(false);
  // Refresh steppers when our relay ballot arrives, but never clobber edits.
  const dirty = useRef(false);
  useEffect(() => {
    if (!dirty.current && initialAllocations) {
      setAllocations(initialAllocations);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(initialAllocations)]);

  const used = Object.values(allocations).reduce((sum, n) => sum + n, 0);
  const remaining = maxVotes - used;
  const hasPrev = prevBallotCreatedAt > 0 || !!initialAllocations;

  function adjust(projectId: string, delta: number) {
    dirty.current = true;
    setAllocations((prev) => {
      const current = prev[projectId] ?? 0;
      const next = current + delta;
      if (next < 0) return prev;
      // Compute against `prev`, not the rendered `remaining` — rapid clicks
      // batched into one render would otherwise overshoot the budget.
      const prevUsed = Object.values(prev).reduce((sum, n) => sum + n, 0);
      if (delta > 0 && prevUsed >= maxVotes) return prev;
      const out = { ...prev };
      if (next === 0) delete out[projectId];
      else out[projectId] = next;
      return out;
    });
  }

  async function handlePublish() {
    if (!auth || publishing || used === 0 || used > maxVotes) return;
    setPublishing(true);
    try {
      const signer = await getSigner(auth);
      const ev = await publishBallot(
        signer,
        hackathonId,
        allocations,
        prevBallotCreatedAt,
      );
      dirty.current = false;
      onPublished(ev);
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
  }

  return (
    <div className="rounded-xl border border-border bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <span className="text-xs font-mono font-semibold tracking-wider text-foreground">
          Tenés {maxVotes} {maxVotes === 1 ? "voto" : "votos"} ·{" "}
          <span className={cn(remaining === 0 ? "text-bitcoin" : "text-success")}>
            te {remaining === 1 ? "queda" : "quedan"} {remaining}
          </span>
        </span>
        {voterPubkey && hasPrev && (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono text-foreground-subtle">
            <CheckCircle2 className="h-3 w-3 text-success" />
            Ya votaste — podés cambiar tu voto
          </span>
        )}
      </div>

      <ul className="space-y-1.5">
        {period.projects.map((p) => {
          const isBlocked = blocked.includes(p.id);
          const count = allocations[p.id] ?? 0;
          return (
            <li
              key={p.id}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-3 py-2",
                isBlocked
                  ? "border-border bg-white/[0.01] opacity-60"
                  : count > 0
                    ? "border-nostr/40 bg-nostr/5"
                    : "border-border bg-white/[0.02]",
              )}
            >
              <span className="flex-1 min-w-0 text-sm font-semibold truncate">
                {p.name}
              </span>
              {isBlocked ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-border text-[9px] font-mono font-semibold tracking-widest text-foreground-subtle uppercase">
                  Tu proyecto
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => adjust(p.id, -1)}
                    disabled={publishing || count === 0}
                    aria-label={`Quitar voto a ${p.name}`}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-foreground-muted hover:text-foreground hover:border-border-strong disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span
                    className={cn(
                      "w-6 text-center text-sm font-mono font-bold tabular-nums",
                      count > 0 ? "text-nostr" : "text-foreground-subtle",
                    )}
                  >
                    {count}
                  </span>
                  <button
                    type="button"
                    onClick={() => adjust(p.id, 1)}
                    disabled={publishing || remaining <= 0}
                    aria-label={`Sumar voto a ${p.name}`}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-foreground-muted hover:text-foreground hover:border-border-strong disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={handlePublish}
          disabled={publishing || used === 0 || used > maxVotes}
          className="inline-flex items-center gap-2 rounded-lg border border-nostr/40 bg-nostr/10 px-4 py-2 text-sm font-semibold text-nostr hover:bg-nostr/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {publishing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Vote className="h-4 w-4" />
          )}
          {publishing
            ? "Publicando…"
            : hasPrev
              ? "Actualizar mis votos"
              : "Publicar mis votos"}
        </button>
      </div>
    </div>
  );
}

/* ───────────────────────── Tally board ───────────────────────── */

function TallyBoard({
  results,
  closed,
}: {
  results: VotingResults;
  closed: boolean;
}) {
  const max = Math.max(1, ...results.tally.map((r) => r.votes));
  return (
    <div className="mt-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-mono font-semibold tracking-widest text-foreground-subtle uppercase">
          {closed ? "Resultados finales" : "Resultados en vivo"}
        </span>
        <span className="text-[10px] font-mono text-foreground-subtle tabular-nums">
          {results.ballotsCounted}{" "}
          {results.ballotsCounted === 1 ? "votante" : "votantes"} ·{" "}
          {results.totalVotesCast} votos
        </span>
      </div>
      <ol className="space-y-1.5">
        {results.tally.map((row, i) => {
          const leader = closed && i === 0 && row.votes > 0;
          return (
            <li key={row.projectId} className="relative">
              <div
                className={cn(
                  "relative overflow-hidden rounded-lg border px-3 py-2",
                  leader
                    ? "border-bitcoin/40 bg-bitcoin/5"
                    : "border-border bg-white/[0.02]",
                )}
              >
                <div
                  aria-hidden
                  className={cn(
                    "absolute inset-y-0 left-0 transition-[width] duration-500",
                    leader ? "bg-bitcoin/15" : "bg-nostr/10",
                  )}
                  style={{ width: `${(row.votes / max) * 100}%` }}
                />
                <div className="relative flex items-center gap-2">
                  {leader && <Trophy className="h-3.5 w-3.5 text-bitcoin shrink-0" />}
                  <span className="flex-1 min-w-0 text-sm font-semibold truncate">
                    {row.name}
                  </span>
                  <span
                    className={cn(
                      "text-sm font-mono font-bold tabular-nums",
                      leader ? "text-bitcoin" : "text-nostr",
                    )}
                  >
                    {row.votes}
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
