"use client";

import Link from "next/link";
import { useCallback } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Coins,
  Loader2,
  LogIn,
  Radio,
  ShieldCheck,
  Sparkles,
  Trophy,
  Vote,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useHackathonTab } from "@/lib/hackathonTabsContext";
import { hackathonSlugForId, prizeForPosition, formatSats } from "@/lib/hackathons";
import { useVotingLive } from "@/lib/useVotingLive";
import { useAdminLiveTally } from "@/lib/useAdminLiveTally";
import {
  VOTES_PER_HACKATHON,
  type VotingPeriod,
  type VotingWinner,
} from "@/lib/voting";
import { cn } from "@/lib/cn";
import LiveTally from "@/components/voting/LiveTally";
import FinalResultsTable from "@/components/voting/FinalResultsTable";
import PrizeZapButton from "@/components/voting/PrizeZapButton";

/**
 * Gamified, live "community voting" hero. Reused on the home page and the
 * hackathon page. While open it shows the viewer's vote wallet + the live
 * participation progress and pushes them to the ballot (`#votar`). Once closed
 * it celebrates the published winners. Renders nothing before the first open.
 */
export default function VotingHero({
  hackathonId,
  hackathonName,
  initialPeriod,
  variant,
  actions,
}: {
  hackathonId: string;
  hackathonName: string;
  initialPeriod: VotingPeriod | null;
  variant: "home" | "page";
  /** Page-only action bar (Ver padrón + admin controls), folded into the hero.
   *  Must be rendered inside the VotingProvider — only passed on the hackathon
   *  page (`variant="page"`). */
  actions?: React.ReactNode;
}) {
  const { ready } = useAuth();
  const live = useVotingLive(hackathonId, initialPeriod);
  const { period, viewer } = live;
  // Set only inside HackathonTabs (the hackathon detail page) — the ballot
  // (#votar) lives in the "Proyectos" tab, a different panel than this hero's
  // "Resultados" tab, so the CTA must switch tabs before it can scroll there.
  const hackathonTab = useHackathonTab();

  const slug = hackathonSlugForId(hackathonId);
  // On the hackathon page the CTA scrolls to the ballot; on home it links there.
  const ballotHref = variant === "home" ? `/hackathons/${slug}#votar` : "#votar";

  const scrollToBallot = useCallback(
    (e: React.MouseEvent) => {
      if (variant !== "page") return;
      e.preventDefault();
      if (hackathonTab && hackathonTab.tab !== "proyectos") {
        hackathonTab.setTab("proyectos");
      }
      // Defer to the next frame so the now-visible "Proyectos" panel is laid
      // out before we measure/scroll to it (it's `display:none` until then).
      requestAnimationFrame(() => {
        document
          .getElementById("votar")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    },
    [variant, hackathonTab],
  );

  if (!period) {
    // On the hackathon page the admin still needs the action bar before the
    // first round exists (to open voting). Everyone else sees nothing.
    if (variant === "page" && actions && live.isAdmin) {
      return <PageVotingActionsShell actions={actions} />;
    }
    return null;
  }

  // On the home page, default to a generic "voting in progress" hero (linking to
  // the hackathon) while the viewer's state resolves in the background. Swap to
  // the full ballot hero ONLY once we've confirmed they're eligible and still
  // have votes to spend; otherwise the "in progress" hero stays put.
  // (The closed/results state still shows for all.)
  if (variant === "home" && period.status === "open") {
    // The La Crypta admin oversees the round rather than voting in it — give
    // them the live standings (decrypted on demand) instead of the ballot.
    if (live.isAdmin) {
      return (
        <HomeVotingAdmin
          hackathonId={hackathonId}
          hackathonName={hackathonName}
          ballotHref={ballotHref}
          live={live}
        />
      );
    }
    const hasVotesAvailable =
      !live.loading && viewer.eligible && viewer.remaining > 0;
    if (!hasVotesAvailable) {
      return (
        <HomeVotingInProgress
          hackathonName={hackathonName}
          ballotHref={ballotHref}
        />
      );
    }
  }

  return (
    <section
      className={cn(
        variant === "page" ? "scroll-mt-24" : "pt-24 sm:pt-28",
      )}
    >
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className={cn(
            "relative overflow-hidden rounded-3xl border p-6 sm:p-8",
            period.status === "open"
              ? "border-nostr/40 bg-background-card shadow-[0_0_60px_-15px_rgba(168,85,247,0.45)]"
              : "border-bitcoin/40 bg-background-card shadow-[0_0_60px_-15px_rgba(247,147,26,0.45)]",
          )}
        >
          {/* Animated backdrop */}
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div
              className={cn(
                "absolute -left-24 -top-24 h-72 w-72 rounded-full blur-3xl",
                period.status === "open" ? "bg-nostr/20" : "bg-bitcoin/20",
              )}
            />
            <div className="absolute -bottom-28 -right-20 h-72 w-72 rounded-full bg-cyan/10 blur-3xl" />
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-nostr/70 to-transparent" />
          </div>

          {/* Page-only action bar (Ver padrón + admin controls), folded in from
              the old voting section card. */}
          {variant === "page" && actions && (
            <div className="relative mb-5 flex flex-wrap items-center justify-end gap-2">
              {actions}
            </div>
          )}

          {period.status === "open" ? (
            <OpenHero
              ready={ready}
              live={live}
              hackathonName={hackathonName}
              ballotHref={ballotHref}
              onCta={scrollToBallot}
            />
          ) : (
            <ClosedHero
              period={period}
              hackathonId={hackathonId}
              ballotHref={ballotHref}
              onCta={scrollToBallot}
              variant={variant}
            />
          )}
        </motion.div>
      </div>
    </section>
  );
}

/* ─────────────────── Page actions shell (no period) ─────────── */

/**
 * Minimal hackathon-page card shown to the admin before any voting round
 * exists, so they can still open the round. Hosts the same action bar the hero
 * folds in once a period is live.
 */
function PageVotingActionsShell({ actions }: { actions: React.ReactNode }) {
  return (
    <section className="scroll-mt-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-nostr/30 bg-background-card p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Vote className="h-4 w-4 text-nostr" />
              <h2 className="font-display font-bold text-sm uppercase tracking-widest text-foreground-muted">
                Votación comunitaria
              </h2>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {actions}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────── In-progress (home default) ─────────────── */

/**
 * Generic "voting in progress" hero shown on the home page by default — while
 * the viewer's eligibility/budget is still loading, and afterwards whenever they
 * have no votes available. Links through to the hackathon. The full ballot hero
 * (`OpenHero`) only replaces it once the viewer is confirmed to have votes left.
 */
function HomeVotingInProgress({
  hackathonName,
  ballotHref,
}: {
  hackathonName: string;
  ballotHref: string;
}) {
  return (
    <section className="pt-24 sm:pt-28">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="relative overflow-hidden rounded-3xl border border-nostr/40 bg-background-card p-6 shadow-[0_0_60px_-15px_rgba(168,85,247,0.45)] sm:p-8"
        >
          {/* Animated backdrop */}
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-nostr/20 blur-3xl" />
            <div className="absolute -bottom-28 -right-20 h-72 w-72 rounded-full bg-cyan/10 blur-3xl" />
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-nostr/70 to-transparent" />
          </div>

          <div className="relative grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-success/40 bg-success/10 px-3 py-1.5 text-[10px] font-mono font-black uppercase tracking-[0.22em] text-success">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                </span>
                Votación en progreso
              </div>

              <h2 className="mt-4 font-display text-3xl font-black leading-[0.95] tracking-tight sm:text-4xl">
                La comunidad está{" "}
                <span className="text-gradient-nostr">votando</span> a los
                ganadores de {hackathonName}
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-foreground-muted sm:text-base">
                Seguí la votación en vivo y mirá cómo se reparten los votos de la
                comunidad.
              </p>
            </div>

            <div className="lg:pb-1">
              <CtaButton
                href={ballotHref}
                onClick={() => {}}
                tone="nostr"
                label="Ver la votación"
                icon={<Vote className="h-5 w-5" />}
              />
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/* ───────────────────── Admin standings (home) ───────────────── */

/**
 * Admin-only home hero shown while voting is open. The La Crypta admin oversees
 * the round, so instead of a ballot they get the live participation gauge plus
 * the current decrypted standings — fetched on demand via the `close-preview`
 * action (admin-gated, decrypted server-side, publishes nothing).
 */
function HomeVotingAdmin({
  hackathonId,
  hackathonName,
  ballotHref,
  live,
}: {
  hackathonId: string;
  hackathonName: string;
  ballotHref: string;
  live: ReturnType<typeof useVotingLive>;
}) {
  const tally = useAdminLiveTally(hackathonId);
  const { votedCount, eligibleCount, progressPct } = live;

  return (
    <section className="pt-24 sm:pt-28">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="relative overflow-hidden rounded-3xl border border-bitcoin/40 bg-background-card p-6 shadow-[0_0_60px_-15px_rgba(247,147,26,0.45)] sm:p-8"
        >
          {/* Animated backdrop */}
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-bitcoin/20 blur-3xl" />
            <div className="absolute -bottom-28 -right-20 h-72 w-72 rounded-full bg-cyan/10 blur-3xl" />
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-bitcoin/70 to-transparent" />
          </div>

          <div className="relative grid gap-6 lg:grid-cols-[1fr_300px] lg:items-start">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-bitcoin/40 bg-bitcoin/10 px-3 py-1.5 text-[10px] font-mono font-black uppercase tracking-[0.22em] text-bitcoin">
                <ShieldCheck className="h-3 w-3" />
                Panel admin · Votación abierta
              </div>

              <h2 className="mt-4 font-display text-3xl font-black leading-[0.95] tracking-tight sm:text-4xl">
                Así viene la votación de{" "}
                <span className="text-gradient-bitcoin">{hackathonName}</span>
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-foreground-muted sm:text-base">
                Los votos están cifrados en los relays. Descifralos vos para ver
                el conteo actual — no se publica nada hasta que cierres la
                votación.
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={tally.refresh}
                  disabled={tally.loading}
                  className={cn(
                    "group inline-flex items-center justify-center gap-2.5 rounded-2xl bg-bitcoin px-6 py-3.5 font-display text-base font-black uppercase tracking-wide text-black transition-all",
                    "shadow-[0_0_38px_-8px_rgba(247,147,26,0.7)] hover:shadow-[0_0_56px_-8px_rgba(247,147,26,0.85)]",
                    "hover:scale-[1.03] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100",
                  )}
                >
                  {tally.loading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <BarChart3 className="h-5 w-5" />
                  )}
                  {tally.results ? "Actualizar conteo" : "Ver votos actuales"}
                </button>
                <Link
                  href={ballotHref}
                  className="inline-flex items-center gap-1.5 text-[11px] font-mono font-bold uppercase tracking-widest text-foreground-subtle transition-colors hover:text-bitcoin"
                >
                  Abrir panel completo
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              {tally.error && (
                <p className="mt-4 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-xs font-mono text-danger">
                  {tally.error}
                </p>
              )}

              {tally.results ? (
                <LiveTally results={tally.results} closed={false} />
              ) : (
                !tally.loading && (
                  <p className="mt-5 text-xs font-mono text-foreground-subtle">
                    Tocá “Ver votos actuales” para descifrar y ver el conteo en
                    vivo.
                  </p>
                )
              )}
            </div>

            {/* Live participation gauge (no decryption needed) */}
            <ParticipationGauge
              votedCount={votedCount}
              eligibleCount={eligibleCount}
              progressPct={progressPct}
            />
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/* ───────────────────────── Open state ───────────────────────── */

function OpenHero({
  ready,
  live,
  hackathonName,
  ballotHref,
  onCta,
}: {
  ready: boolean;
  live: ReturnType<typeof useVotingLive>;
  hackathonName: string;
  ballotHref: string;
  onCta: (e: React.MouseEvent) => void;
}) {
  const { viewer, votedCount, eligibleCount, progressPct } = live;

  return (
    <div className="relative grid gap-6 lg:grid-cols-[1fr_300px] lg:items-center">
      <div className="min-w-0">
        <div className="inline-flex items-center gap-2 rounded-full border border-success/40 bg-success/10 px-3 py-1.5 text-[10px] font-mono font-black uppercase tracking-[0.22em] text-success">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
          </span>
          Votación abierta
        </div>

        <h2 className="mt-4 font-display text-3xl font-black leading-[0.95] tracking-tight sm:text-4xl">
          La comunidad elige a los{" "}
          <span className="text-gradient-nostr">ganadores</span> de{" "}
          {hackathonName}
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-foreground-muted sm:text-base">
          {VOTES_PER_HACKATHON} votos por hackatón en el que participaste.
          Repartilos como quieras — tus votos van cifrados y se revelan recién al
          cerrar.
        </p>

        {/* Vote wallet */}
        <div className="mt-5">
          {!ready ? (
            <div className="h-[58px] w-full max-w-sm animate-pulse rounded-2xl border border-border bg-white/[0.03]" />
          ) : (
            <VoteWallet viewer={viewer} />
          )}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <CtaButton
            href={ballotHref}
            onClick={onCta}
            tone="nostr"
            label={
              viewer.hasVoted
                ? "Cambiar mi voto"
                : viewer.eligible
                  ? "Votar ahora"
                  : "Ver la votación"
            }
            icon={viewer.hasVoted ? <CheckCircle2 className="h-5 w-5" /> : <Vote className="h-5 w-5" />}
          />
          <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-foreground-subtle">
            <Sparkles className="h-3.5 w-3.5 text-lightning" />
            Cierra el Martes 30 de Junio
          </span>
        </div>
      </div>

      {/* Live participation gauge */}
      <ParticipationGauge
        votedCount={votedCount}
        eligibleCount={eligibleCount}
        progressPct={progressPct}
      />
    </div>
  );
}

function VoteWallet({
  viewer,
}: {
  viewer: ReturnType<typeof useVotingLive>["viewer"];
}) {
  if (!viewer.eligible) {
    return (
      <div className="inline-flex items-center gap-2.5 rounded-2xl border border-border bg-white/[0.03] px-4 py-3 text-sm text-foreground-muted">
        <LogIn className="h-4 w-4 text-nostr" />
        Conectá tu Nostr y, si participaste de un hackatón, vas a poder votar.
      </div>
    );
  }

  const pips = Array.from({ length: Math.min(viewer.maxVotes, 12) });
  const overflow = viewer.maxVotes - pips.length;

  return (
    <div className="inline-flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-lightning/30 bg-lightning/[0.06] px-4 py-3">
      <div className="inline-flex items-center gap-2">
        <Coins className="h-5 w-5 text-lightning" />
        <span className="font-display text-lg font-black tabular-nums">
          {viewer.remaining}
          <span className="text-foreground-subtle">/{viewer.maxVotes}</span>
        </span>
        <span className="text-xs font-mono uppercase tracking-widest text-foreground-muted">
          {viewer.remaining === 1 ? "voto" : "votos"}{" "}
          {viewer.hasVoted ? "sin usar" : "disponibles"}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        {pips.map((_, i) => {
          const spent = i >= viewer.remaining;
          return (
            <motion.span
              key={i}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: i * 0.04, type: "spring", stiffness: 400, damping: 20 }}
              className={cn(
                "h-3.5 w-3.5 rounded-full border",
                spent
                  ? "border-border bg-white/5"
                  : "border-lightning/60 bg-lightning shadow-[0_0_10px_rgba(255,215,0,0.6)]",
              )}
            />
          );
        })}
        {overflow > 0 && (
          <span className="ml-1 text-xs font-mono font-bold text-lightning">
            +{overflow}
          </span>
        )}
      </div>
    </div>
  );
}

function ParticipationGauge({
  votedCount,
  eligibleCount,
  progressPct,
}: {
  votedCount: number;
  eligibleCount: number;
  progressPct: number;
}) {
  return (
    <div className="relative rounded-2xl border border-border bg-black/30 p-5">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-success">
          <Radio className="h-3 w-3 animate-pulse" />
          En vivo
        </span>
        <span className="font-display text-2xl font-black tabular-nums">
          {progressPct}
          <span className="text-base text-foreground-subtle">%</span>
        </span>
      </div>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-nostr via-bitcoin to-lightning"
          initial={{ width: 0 }}
          animate={{ width: `${progressPct}%` }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        />
      </div>
      <div className="mt-3 flex items-center justify-between text-xs font-mono">
        <span className="text-foreground-muted">Participación</span>
        <span className="tabular-nums text-foreground">
          <span className="font-bold text-success">{votedCount}</span>
          <span className="text-foreground-subtle">
            {" "}
            / {eligibleCount} votaron
          </span>
        </span>
      </div>
    </div>
  );
}

/* ───────────────────────── Closed state ───────────────────────── */

const MEDAL = ["🥇", "🥈", "🥉"];

/** Per-rank visual tone for the podium (gold / silver / bronze). */
const RANK_TONE: Record<
  number,
  { card: string; accent: string; chip: string }
> = {
  1: {
    card: "border-bitcoin/50 bg-bitcoin/[0.1] shadow-[0_0_44px_-12px_rgba(247,147,26,0.75)]",
    accent: "text-bitcoin",
    chip: "border-bitcoin/40 bg-bitcoin/10 text-bitcoin",
  },
  2: {
    card: "border-zinc-400/40 bg-zinc-400/[0.07]",
    accent: "text-zinc-300",
    chip: "border-zinc-400/40 bg-zinc-400/10 text-zinc-200",
  },
  3: {
    card: "border-amber-600/40 bg-amber-600/[0.07]",
    accent: "text-amber-500",
    chip: "border-amber-600/40 bg-amber-600/10 text-amber-400",
  },
};

function ClosedHero({
  period,
  hackathonId,
  ballotHref,
  onCta,
  variant,
}: {
  period: VotingPeriod;
  hackathonId: string;
  ballotHref: string;
  onCta: (e: React.MouseEvent) => void;
  variant: "home" | "page";
}) {
  const slug = hackathonSlugForId(hackathonId);
  // The podium reflects the DEFINITIVE result: the combined 70/30 ranking when
  // judges' scores were merged (headline metric = final score), else the raw
  // popular vote (metric = votes). The detailed breakdown table renders below.
  const hasFinal =
    !!period.results?.final && period.results.final.length > 0;
  // `winners` is always computed at close (see computeVotingRanking), even
  // when `final` (judges-merged) also is — it's the only place the prize
  // recipient's pubkey is resolved, frozen at close time. Keyed by projectId
  // so it stays correct regardless of which ranking `entries` uses.
  const recipientByProject = new Map(
    (period.results?.winners ?? []).map((w) => [w.projectId, w.recipientPubkey]),
  );
  // Up to 6 prize positions; the top 3 go on the podium, 4–6 in the list below.
  const entries: PodiumEntry[] = hasFinal
    ? period.results!.final!.slice(0, 6).map((r) => ({
        position: r.position,
        projectId: r.projectId,
        projectName: r.name,
        metric: `${r.finalScore.toFixed(1)} pts`,
      }))
    : (period.results?.winners ?? []).slice(0, 6).map((w) => ({
        position: w.position,
        projectId: w.projectId,
        projectName: w.projectName,
        metric: `${w.votes} ${w.votes === 1 ? "voto" : "votos"}`,
      }));
  const podium = entries.slice(0, 3);
  const runnersUp = entries.slice(3, 6);
  // Classic podium reading order on wide screens: 2nd · 1st · 3rd (1st centered).
  const podiumOrder =
    podium.length === 3 ? [1, 0, 2] : podium.map((_, i) => i);

  return (
    <div className="relative space-y-7">
      {/* Header + CTA */}
      <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-bitcoin/40 bg-bitcoin/10 px-3 py-1.5 text-[10px] font-mono font-black uppercase tracking-[0.22em] text-bitcoin">
            <Trophy className="h-3 w-3" />
            Resultados publicados
          </div>
          <h2 className="mt-4 font-display text-3xl font-black leading-[0.95] tracking-tight sm:text-4xl">
            La comunidad ya <span className="text-gradient-bitcoin">eligió</span>
          </h2>
        </div>
        <div className="lg:pb-1">
          <CtaButton
            href={ballotHref}
            onClick={onCta}
            tone="bitcoin"
            label="Ver resultados"
            icon={<ArrowRight className="h-5 w-5" />}
          />
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="rounded-2xl border border-border bg-white/[0.02] px-4 py-6 text-center text-sm text-foreground-subtle">
          La votación cerró sin votos registrados.
        </p>
      ) : (
        <div className="space-y-2.5">
          {/* Podium — top 3, large */}
          <div className="grid grid-cols-3 items-end gap-2.5 sm:gap-4">
            {podiumOrder
              .filter((idx) => podium[idx])
              .map((idx) => (
                <PodiumCard
                  key={podium[idx].projectId}
                  entry={podium[idx]}
                  slug={slug}
                  hackathonId={hackathonId}
                  recipientPubkey={recipientByProject.get(podium[idx].projectId) ?? null}
                />
              ))}
          </div>

          {/* Positions 4–6 */}
          {runnersUp.length > 0 && (
            <ol className="space-y-2">
              {runnersUp.map((e, i) => (
                <RunnerRow
                  key={e.projectId}
                  entry={e}
                  slug={slug}
                  index={i}
                  hackathonId={hackathonId}
                  recipientPubkey={recipientByProject.get(e.projectId) ?? null}
                />
              ))}
            </ol>
          )}
        </div>
      )}

      {/* Detailed combined breakdown (per-judge scores + 70/30 math). The podium
       *  above already reflects this ranking; the table shows how it was built.
       *  Page-only — the home hero stays a compact teaser, the full table lives
       *  on the hackathon results page. */}
      {hasFinal && variant === "page" && (
        <FinalResultsTable
          judges={period.results!.judges ?? []}
          rows={period.results!.final!}
          hackathonId={hackathonId}
        />
      )}
    </div>
  );
}

/** One podium/runner-up slot — driven by either the final 70/30 ranking or the
 *  raw popular vote, with a pre-formatted headline metric ("21.1 pts" / "12
 *  votos"). */
type PodiumEntry = {
  position: number;
  projectId: string;
  projectName: string;
  metric: string;
};

function PodiumCard({
  entry,
  slug,
  hackathonId,
  recipientPubkey,
}: {
  entry: PodiumEntry;
  slug: string;
  hackathonId: string;
  recipientPubkey: string | null;
}) {
  const pos = entry.position;
  const isFirst = pos === 1;
  const prize = prizeForPosition(pos);
  const tone = RANK_TONE[pos] ?? RANK_TONE[3];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: (pos - 1) * 0.1, duration: 0.45, ease: "easeOut" }}
      className={cn(
        "relative flex flex-col items-center rounded-2xl border text-center",
        tone.card,
        isFirst ? "px-2.5 pb-4 pt-7 sm:pt-8" : "px-2 pb-3 pt-4 sm:pt-5",
      )}
    >
      {isFirst && (
        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-bitcoin/50 bg-background-card px-2.5 py-0.5 text-[8px] font-mono font-black uppercase tracking-[0.2em] text-bitcoin">
          Ganador
        </span>
      )}
      <span
        className={cn(
          "leading-none",
          isFirst ? "text-4xl sm:text-5xl" : "text-3xl sm:text-4xl",
        )}
      >
        {MEDAL[pos - 1] ?? "🏅"}
      </span>
      <span
        className={cn(
          "mt-1 font-display font-black tabular-nums",
          tone.accent,
          isFirst ? "text-lg" : "text-base",
        )}
      >
        {pos}°
      </span>
      <Link
        href={`/hackathons/${slug}/${entry.projectId}`}
        title={entry.projectName}
        className={cn(
          "mt-1.5 block w-full truncate px-1 font-semibold hover:underline",
          isFirst ? "text-sm sm:text-base" : "text-xs sm:text-sm",
        )}
      >
        {entry.projectName}
      </Link>
      <span className="mt-1 text-[11px] font-mono text-foreground-subtle tabular-nums">
        {entry.metric}
      </span>
      {prize != null && (
        <span
          className={cn(
            "mt-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-mono font-bold tabular-nums",
            tone.chip,
          )}
        >
          <Coins className="h-3 w-3" />
          {formatSats(prize)} sats
        </span>
      )}
      {prize != null && recipientPubkey && (
        <div className="mt-1.5">
          <PrizeZapButton
            target={{
              hackathonId,
              projectId: entry.projectId,
              projectName: entry.projectName,
              position: pos,
              recipientPubkey,
              sats: prize,
            }}
          />
        </div>
      )}
    </motion.div>
  );
}

function RunnerRow({
  entry,
  slug,
  index,
  hackathonId,
  recipientPubkey,
}: {
  entry: PodiumEntry;
  slug: string;
  index: number;
  hackathonId: string;
  recipientPubkey: string | null;
}) {
  const prize = prizeForPosition(entry.position);

  return (
    <motion.li
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.32 + index * 0.07, duration: 0.4 }}
      className="flex items-center gap-2"
    >
      <Link
        href={`/hackathons/${slug}/${entry.projectId}`}
        className="group flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-border bg-white/[0.02] px-3 py-2.5 transition-colors hover:bg-white/[0.05]"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-white/[0.03] font-display text-sm font-black tabular-nums text-foreground-muted">
          {entry.position}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold group-hover:text-bitcoin">
          {entry.projectName}
        </span>
        {prize != null && (
          <span className="hidden items-center gap-1 rounded-full border border-border bg-white/[0.03] px-2 py-0.5 text-[10px] font-mono font-bold tabular-nums text-lightning sm:inline-flex">
            <Coins className="h-3 w-3" />
            {formatSats(prize)} sats
          </span>
        )}
        <span className="text-sm font-mono font-bold tabular-nums text-nostr">
          {entry.metric}
        </span>
      </Link>
      {prize != null && recipientPubkey && (
        <PrizeZapButton
          target={{
            hackathonId,
            projectId: entry.projectId,
            projectName: entry.projectName,
            position: entry.position,
            recipientPubkey,
            sats: prize,
          }}
        />
      )}
    </motion.li>
  );
}

/* ───────────────────────── Shared CTA ───────────────────────── */

function CtaButton({
  href,
  onClick,
  label,
  icon,
  tone,
}: {
  href: string;
  onClick: (e: React.MouseEvent) => void;
  label: string;
  icon: React.ReactNode;
  tone: "nostr" | "bitcoin";
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "group inline-flex items-center justify-center gap-2.5 rounded-2xl px-6 py-3.5 font-display text-base font-black uppercase tracking-wide transition-all hover:scale-[1.03] active:scale-[0.97]",
        tone === "nostr"
          ? "bg-nostr text-white shadow-[0_0_38px_-8px_rgba(168,85,247,0.7)] hover:shadow-[0_0_56px_-8px_rgba(168,85,247,0.85)]"
          : "bg-bitcoin text-black shadow-[0_0_38px_-8px_rgba(247,147,26,0.7)] hover:shadow-[0_0_56px_-8px_rgba(247,147,26,0.85)]",
      )}
    >
      {icon}
      {label}
      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
    </Link>
  );
}
