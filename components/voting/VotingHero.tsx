"use client";

import Link from "next/link";
import { useCallback } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  Coins,
  LogIn,
  Radio,
  Sparkles,
  Trophy,
  Vote,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { hackathonSlugForId } from "@/lib/hackathons";
import { useVotingLive } from "@/lib/useVotingLive";
import type { VotingPeriod } from "@/lib/voting";
import { cn } from "@/lib/cn";

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
}: {
  hackathonId: string;
  hackathonName: string;
  initialPeriod: VotingPeriod | null;
  variant: "home" | "page";
}) {
  const { ready } = useAuth();
  const live = useVotingLive(hackathonId, initialPeriod);
  const { period } = live;

  const slug = hackathonSlugForId(hackathonId);
  // On the hackathon page the CTA scrolls to the ballot; on home it links there.
  const ballotHref = variant === "home" ? `/hackathons/${slug}#votar` : "#votar";

  const scrollToBallot = useCallback(
    (e: React.MouseEvent) => {
      if (variant !== "page") return;
      const el = document.getElementById("votar");
      if (!el) return;
      e.preventDefault();
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [variant],
  );

  if (!period) return null;

  return (
    <section className={cn(variant === "page" && "scroll-mt-24")}>
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
            <div
              className="absolute inset-0 opacity-[0.07]"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
                backgroundSize: "28px 28px",
              }}
            />
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-nostr/70 to-transparent" />
          </div>

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
            />
          )}
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
          1 voto por hackatón en el que participaste. Repartilos como quieras —
          tus votos van cifrados y se revelan recién al cerrar.
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
            Cierre manual de La Crypta — no hay reloj, ¡votá tranqui!
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

function ClosedHero({
  period,
  hackathonId,
  ballotHref,
  onCta,
}: {
  period: VotingPeriod;
  hackathonId: string;
  ballotHref: string;
  onCta: (e: React.MouseEvent) => void;
}) {
  const winners = (period.results?.winners ?? []).slice(0, 3);
  const slug = hackathonSlugForId(hackathonId);
  const MEDAL = ["🥇", "🥈", "🥉"];

  return (
    <div className="relative grid gap-6 lg:grid-cols-[1fr_320px] lg:items-center">
      <div className="min-w-0">
        <div className="inline-flex items-center gap-2 rounded-full border border-bitcoin/40 bg-bitcoin/10 px-3 py-1.5 text-[10px] font-mono font-black uppercase tracking-[0.22em] text-bitcoin">
          <Trophy className="h-3 w-3" />
          Resultados publicados
        </div>
        <h2 className="mt-4 font-display text-3xl font-black leading-[0.95] tracking-tight sm:text-4xl">
          La comunidad ya <span className="text-gradient-bitcoin">eligió</span>
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-foreground-muted sm:text-base">
          La votación cerró y el resultado quedó firmado por La Crypta en Nostr.
          Mirá quiénes se llevaron los votos de la comunidad.
        </p>
        <div className="mt-6">
          <CtaButton
            href={ballotHref}
            onClick={onCta}
            tone="bitcoin"
            label="Ver resultados"
            icon={<ArrowRight className="h-5 w-5" />}
          />
        </div>
      </div>

      {winners.length > 0 && (
        <ol className="space-y-2">
          {winners.map((w, i) => (
            <motion.li
              key={w.projectId}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08, duration: 0.4 }}
            >
              <Link
                href={`/hackathons/${slug}/${w.projectId}`}
                className={cn(
                  "group flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors",
                  i === 0
                    ? "border-bitcoin/40 bg-bitcoin/[0.08] hover:bg-bitcoin/[0.14]"
                    : "border-border bg-white/[0.02] hover:bg-white/[0.05]",
                )}
              >
                <span className="text-xl leading-none">{MEDAL[i] ?? `${w.position}°`}</span>
                <span className="flex-1 min-w-0 text-sm font-semibold truncate group-hover:text-bitcoin">
                  {w.projectName}
                </span>
                <span className="text-sm font-mono font-bold text-nostr tabular-nums">
                  {w.votes}
                </span>
              </Link>
            </motion.li>
          ))}
        </ol>
      )}
    </div>
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
