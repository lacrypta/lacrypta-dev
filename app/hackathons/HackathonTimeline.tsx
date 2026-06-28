"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import {
  ArrowRight,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flame,
  Gauge,
  Layers,
  Radio,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/cn";
import HackathonInscripcionButton from "@/components/HackathonInscripcionButton";

/** Serializable shape passed from the server page — no Date objects. */
export type TimelineHackathon = {
  id: string;
  slug: string;
  number: number;
  name: string;
  focus: string;
  description: string;
  difficulty: string;
  stars: number;
  month: string;
  monthShort: string;
  year: number;
  icon: string;
  tags: string[];
  topics: string[];
  firstDay: string | null;
  lastDay: string | null;
  status: "upcoming" | "active" | "closed";
  inscriptionOpen: boolean;
  countdown: string | null;
  sponsors: { name: string; logo: string }[];
};

const STATUS_META: Record<
  TimelineHackathon["status"],
  { label: string; dot: string; text: string; ring: string }
> = {
  active: {
    label: "EN CURSO",
    dot: "bg-success",
    text: "text-success",
    ring: "ring-success/60",
  },
  upcoming: {
    label: "PRÓXIMO",
    dot: "bg-cyan",
    text: "text-cyan",
    ring: "ring-cyan/60",
  },
  closed: {
    label: "REALIZADO",
    dot: "bg-bitcoin",
    text: "text-bitcoin",
    ring: "ring-bitcoin/60",
  },
};

const slideVariants: Variants = {
  enter: (dir: number) => ({
    x: dir > 0 ? 64 : -64,
    opacity: 0,
    scale: 0.97,
  }),
  center: { x: 0, opacity: 1, scale: 1 },
  exit: (dir: number) => ({
    x: dir > 0 ? -64 : 64,
    opacity: 0,
    scale: 0.97,
  }),
};

export default function HackathonTimeline({
  items,
  initialIndex,
  todayPct,
}: {
  items: TimelineHackathon[];
  initialIndex: number;
  todayPct: number;
}) {
  const [[index, direction], setState] = useState<[number, number]>([
    initialIndex,
    0,
  ]);
  const n = items.length;

  const goTo = useCallback(
    (next: number) => {
      setState(([cur]) => {
        const clamped = Math.max(0, Math.min(n - 1, next));
        if (clamped === cur) return [cur, 0];
        return [clamped, clamped > cur ? 1 : -1];
      });
    },
    [n],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      // Don't hijack arrows while the user is typing or inside a dialog/menu.
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.isContentEditable ||
          /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) ||
          t.closest('[role="dialog"],[role="menu"],[contenteditable="true"]'))
      ) {
        return;
      }
      goTo(e.key === "ArrowLeft" ? index - 1 : index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, goTo]);

  const active = items[index];
  const prev = index > 0 ? items[index - 1] : null;
  const next = index < n - 1 ? items[index + 1] : null;

  return (
    <div className="relative">
      {/* ── Timeline rail ─────────────────────────────────────────────── */}
      <div className="relative mb-10">
        <div className="overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
          <div className="relative min-w-[640px] sm:min-w-0 pt-2 pb-1">
            {/* Base track */}
            <div className="absolute left-0 right-0 top-[18px] h-0.5 rounded-full bg-border" />
            {/* Elapsed-time fill */}
            <motion.div
              className="absolute left-0 top-[18px] h-0.5 rounded-full bg-gradient-to-r from-bitcoin via-bitcoin to-nostr shadow-[0_0_12px_rgba(247,147,26,0.6)]"
              initial={{ width: 0 }}
              animate={{ width: `${todayPct}%` }}
              transition={{ duration: 1.1, ease: "easeOut" }}
            />
            {/* "Today" marker */}
            <motion.div
              className="absolute top-[18px] -translate-x-1/2 -translate-y-1/2 z-10"
              initial={{ left: 0, opacity: 0 }}
              animate={{ left: `${todayPct}%`, opacity: 1 }}
              transition={{ duration: 1.1, ease: "easeOut" }}
            >
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lightning/70" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-lightning shadow-[0_0_10px_rgba(255,215,0,0.9)]" />
              </span>
            </motion.div>

            {/* Nodes */}
            <div className="relative flex">
              {items.map((h, i) => {
                const meta = STATUS_META[h.status];
                const selected = i === index;
                return (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => goTo(i)}
                    aria-current={selected ? "true" : undefined}
                    aria-label={`${h.name} — ${meta.label}`}
                    className="group relative flex flex-1 flex-col items-center gap-2 rounded-lg pt-[6px] outline-none focus-visible:ring-2 focus-visible:ring-cyan/60"
                  >
                    {/* Dot */}
                    <span className="relative flex h-6 w-6 items-center justify-center">
                      {selected && (
                        <motion.span
                          layoutId="rail-active"
                          className={cn(
                            "absolute inset-0 rounded-full ring-2",
                            meta.ring,
                          )}
                          transition={{
                            type: "spring",
                            stiffness: 500,
                            damping: 34,
                          }}
                        />
                      )}
                      <span
                        className={cn(
                          "h-2.5 w-2.5 rounded-full transition-all duration-300",
                          h.status === "upcoming"
                            ? "bg-background ring-2 ring-border group-hover:ring-cyan/60"
                            : meta.dot,
                          selected && "scale-125",
                          h.status === "active" &&
                            "shadow-[0_0_10px_rgba(34,197,94,0.8)]",
                        )}
                      />
                    </span>
                    {/* Label */}
                    <span
                      className={cn(
                        "text-[10px] font-mono font-semibold uppercase tracking-widest transition-colors",
                        selected
                          ? meta.text
                          : "text-foreground-subtle group-hover:text-foreground-muted",
                      )}
                    >
                      {h.monthShort}
                    </span>
                    <span
                      className={cn(
                        "max-w-[72px] truncate text-[10px] font-semibold leading-none transition-colors",
                        selected
                          ? "text-foreground"
                          : "text-foreground-subtle group-hover:text-foreground-muted",
                      )}
                    >
                      {h.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Stage: prev peek · active card · next peek ─────────────────── */}
      <div className="grid items-center gap-4 lg:grid-cols-[minmax(0,0.62fr)_minmax(0,2.2fr)_minmax(0,0.62fr)]">
        {/* Prev peek (desktop) */}
        <div className="hidden lg:block">
          {prev ? (
            <PeekCard h={prev} side="left" onClick={() => goTo(index - 1)} />
          ) : (
            <RailEnd label="Inicio del programa" />
          )}
        </div>

        {/* Active card */}
        <div className="relative">
          {/* Mobile arrows */}
          <div className="mb-3 flex items-center justify-between lg:hidden">
            <NavButton
              dir="prev"
              disabled={index === 0}
              onClick={() => goTo(index - 1)}
            />
            <span className="text-[11px] font-mono uppercase tracking-widest text-foreground-subtle">
              {index + 1} / {n}
            </span>
            <NavButton
              dir="next"
              disabled={index === n - 1}
              onClick={() => goTo(index + 1)}
            />
          </div>

          <div className="relative overflow-hidden">
            <AnimatePresence mode="wait" custom={direction} initial={false}>
              <motion.div
                key={active.id}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{
                  x: { type: "spring", stiffness: 300, damping: 32 },
                  opacity: { duration: 0.2 },
                  scale: { duration: 0.25 },
                }}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.18}
                onDragEnd={(_, info) => {
                  if (info.offset.x < -80) goTo(index + 1);
                  else if (info.offset.x > 80) goTo(index - 1);
                }}
              >
                <StageCard h={active} />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Next peek (desktop) */}
        <div className="hidden lg:block">
          {next ? (
            <PeekCard h={next} side="right" onClick={() => goTo(index + 1)} />
          ) : (
            <RailEnd label="Cierre del programa" />
          )}
        </div>
      </div>

      {/* Desktop arrows below the stage, centered */}
      <div className="mt-6 hidden items-center justify-center gap-4 lg:flex">
        <NavButton
          dir="prev"
          disabled={index === 0}
          onClick={() => goTo(index - 1)}
        />
        <span className="min-w-[64px] text-center text-[11px] font-mono uppercase tracking-widest text-foreground-subtle">
          {index + 1} / {n}
        </span>
        <NavButton
          dir="next"
          disabled={index === n - 1}
          onClick={() => goTo(index + 1)}
        />
      </div>
    </div>
  );
}

/* ───────────────────────────── pieces ──────────────────────────────── */

function NavButton({
  dir,
  disabled,
  onClick,
}: {
  dir: "prev" | "next";
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = dir === "prev" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === "prev" ? "Hackatón anterior" : "Hackatón siguiente"}
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-full border bg-background-card transition-all",
        disabled
          ? "cursor-not-allowed border-border opacity-30"
          : "border-border-strong hover:border-bitcoin/60 hover:bg-bitcoin/10 hover:text-bitcoin active:scale-95",
      )}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

function RailEnd({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border/70 px-4 text-center">
      <span className="h-2 w-2 rounded-full bg-border-strong" />
      <span className="text-[10px] font-mono uppercase tracking-widest text-foreground-subtle">
        {label}
      </span>
    </div>
  );
}

function PeekCard({
  h,
  side,
  onClick,
}: {
  h: TimelineHackathon;
  side: "left" | "right";
  onClick: () => void;
}) {
  const meta = STATUS_META[h.status];
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0 }}
      animate={{ opacity: 0.78 }}
      whileHover={{ opacity: 1, scale: 1.02 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "group flex w-full flex-col gap-3 rounded-2xl border border-border bg-background-card/70 p-4 text-left transition-colors hover:border-border-strong",
        side === "left" ? "items-start" : "items-end text-right",
      )}
    >
      <div
        className={cn(
          "flex w-full items-center gap-2",
          side === "right" && "flex-row-reverse",
        )}
      >
        <span className="text-3xl leading-none">{h.icon}</span>
        <span
          className={cn(
            "inline-flex items-center gap-1 text-[9px] font-mono font-semibold uppercase tracking-widest",
            meta.text,
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
          {meta.label}
        </span>
      </div>
      <div className={cn("w-full", side === "right" && "text-right")}>
        <div className="text-[10px] font-mono tracking-widest text-foreground-subtle">
          #{String(h.number).padStart(2, "0")} · {h.monthShort} {h.year}
        </div>
        <div className="mt-0.5 truncate font-display text-lg font-bold tracking-tight">
          {h.name}
        </div>
        <div className="truncate text-[11px] font-mono uppercase tracking-wide text-foreground-muted">
          {h.focus}
        </div>
      </div>
      <span
        className={cn(
          "inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-foreground-subtle transition-colors group-hover:text-foreground-muted",
          side === "right" && "flex-row-reverse",
        )}
      >
        {side === "left" ? (
          <>
            <ChevronLeft className="h-3 w-3" /> Anterior
          </>
        ) : (
          <>
            Siguiente <ChevronRight className="h-3 w-3" />
          </>
        )}
      </span>
    </motion.button>
  );
}

/** A compact icon pill whose full detail appears in a tooltip on hover —
 *  keeps the stage card scannable instead of wall-of-text. */
function InfoChip({
  icon,
  label,
  tooltip,
}: {
  icon: React.ReactNode;
  label: string;
  tooltip: React.ReactNode;
}) {
  return (
    <div className="group/chip relative">
      {/* A button so the detail is reachable by keyboard/touch (focus), not
       *  only by hover. The tooltip reveals on hover OR focus-within. */}
      <button
        type="button"
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-mono font-semibold uppercase tracking-wider text-foreground-muted outline-none transition-colors hover:border-border-strong hover:text-foreground focus-visible:border-border-strong focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-cyan/60"
      >
        <span className="text-foreground-subtle">{icon}</span>
        {label}
      </button>
      <span className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 w-max max-w-[240px] -translate-x-1/2 translate-y-1 rounded-xl border border-border-strong bg-background-elevated px-3 py-2 text-left text-xs font-normal normal-case tracking-normal text-foreground opacity-0 shadow-xl transition-all duration-150 group-hover/chip:translate-y-0 group-hover/chip:opacity-100 group-focus-within/chip:translate-y-0 group-focus-within/chip:opacity-100">
        {tooltip}
      </span>
    </div>
  );
}

function StageCard({ h }: { h: TimelineHackathon }) {
  const isActive = h.status === "active";
  const isClosed = h.status === "closed";

  const accent = isActive
    ? {
        ring: "border-success/40",
        glow: "shadow-[0_0_70px_-16px_rgba(34,197,94,0.4)]",
        gradient: "from-success/[0.10] via-transparent to-bitcoin/[0.05]",
        eyebrow: "text-success",
        icon: <Radio className="h-3.5 w-3.5 animate-pulse" />,
        label: "Hackatón en curso",
        badge: "border-success/30 bg-success/10 text-success",
        badgeLabel: "● EN CURSO",
      }
    : isClosed
      ? {
          ring: "border-bitcoin/30",
          glow: "shadow-[0_0_60px_-18px_rgba(247,147,26,0.35)]",
          gradient: "from-bitcoin/[0.07] via-transparent to-nostr/[0.04]",
          eyebrow: "text-bitcoin",
          icon: <Calendar className="h-3.5 w-3.5" />,
          label: "Hackatón realizado",
          badge: "border-bitcoin/30 bg-bitcoin/10 text-bitcoin",
          badgeLabel: "✓ REALIZADO",
        }
      : {
          ring: "border-cyan/40",
          glow: "shadow-[0_0_70px_-16px_rgba(34,211,238,0.4)]",
          gradient: "from-cyan/[0.10] via-transparent to-nostr/[0.05]",
          eyebrow: "text-cyan",
          icon: <Flame className="h-3.5 w-3.5" />,
          label: "Próximo hackatón",
          badge: "border-cyan/30 bg-cyan/10 text-cyan",
          badgeLabel: h.countdown ?? "PRÓXIMO",
        };

  return (
    <div
      className={cn(
        "group relative rounded-3xl border bg-background-card",
        accent.ring,
        accent.glow,
      )}
    >
      {/* Aurora backdrop (clipped here so card tooltips can overflow). */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
        <div className={cn("absolute inset-0 bg-gradient-to-br", accent.gradient)} />
        <div className="aurora absolute -right-24 -top-24 h-64 w-64 rounded-full bg-bitcoin/10 opacity-40 blur-3xl" />
        <div
          className="aurora absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-nostr/10 opacity-30 blur-3xl"
          style={{ animationDelay: "-10s" }}
        />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
      </div>

      <div className="relative grid items-start gap-6 p-6 sm:grid-cols-[1fr_auto] sm:p-9">
        <div className="flex min-w-0 flex-col gap-4">
          {/* Eyebrow + number */}
          <div className="flex items-center gap-2">
            <span className={cn("inline-flex items-center", accent.eyebrow)}>
              {accent.icon}
            </span>
            <span
              className={cn(
                "text-xs font-mono font-semibold uppercase tracking-widest",
                accent.eyebrow,
              )}
            >
              {accent.label}
            </span>
            <span className="ml-auto font-mono text-xs tracking-widest text-foreground-subtle">
              #{String(h.number).padStart(2, "0")}
            </span>
          </div>

          {/* Title */}
          <div>
            <h2 className="font-display text-4xl font-bold leading-none tracking-tight sm:text-6xl">
              {h.name}
            </h2>
            <p className="mt-2 font-mono text-sm uppercase tracking-widest text-foreground-muted sm:text-base">
              {h.focus}
            </p>
          </div>

          {/* Compact icon meta — hover any chip to read the detail. */}
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-mono font-semibold uppercase tracking-wider",
                accent.badge,
                isActive && "animate-pulse",
              )}
            >
              {!isActive && !isClosed && <Clock className="h-3.5 w-3.5" />}
              {accent.badgeLabel}
            </span>
            <InfoChip
              icon={<Calendar className="h-3.5 w-3.5" />}
              label={
                h.firstDay && h.lastDay
                  ? `${h.firstDay}–${h.lastDay}`
                  : h.monthShort
              }
              tooltip={`${h.month} ${h.year}`}
            />
            <InfoChip
              icon={<Gauge className="h-3.5 w-3.5" />}
              label={"★".repeat(h.stars)}
              tooltip={`Dificultad: ${h.difficulty}`}
            />
            {h.topics.length > 0 && (
              <InfoChip
                icon={<Layers className="h-3.5 w-3.5" />}
                label={`${h.topics.length} temas`}
                tooltip={
                  <ul className="space-y-1">
                    {h.topics.map((t) => (
                      <li key={t} className="flex items-center gap-1.5">
                        <span className="h-1 w-1 shrink-0 rounded-full bg-bitcoin" />
                        {t}
                      </li>
                    ))}
                  </ul>
                }
              />
            )}
            {h.tags.length > 0 && (
              <InfoChip
                icon={<Tag className="h-3.5 w-3.5" />}
                label={`${h.tags.length} ${h.tags.length === 1 ? "tag" : "tags"}`}
                tooltip={
                  <div className="flex flex-wrap gap-1">
                    {h.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                }
              />
            )}
          </div>

          {/* CTA */}
          <div className="flex flex-col items-start gap-3 border-t border-border pt-4 sm:flex-row sm:items-center">
            {h.inscriptionOpen && (
              <HackathonInscripcionButton hackathonId={h.id} />
            )}
            <Link
              href={`/hackathons/${h.slug}`}
              className="inline-flex items-center gap-1 text-sm font-semibold text-foreground-muted transition-colors hover:text-foreground"
            >
              Ver detalle
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>

          {/* Sponsors */}
          {h.sponsors.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <span className="text-[10px] font-mono font-semibold uppercase tracking-widest text-foreground-subtle">
                Sponsor
              </span>
              {h.sponsors.map((s) => (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  key={s.name}
                  src={s.logo}
                  alt={s.name}
                  className="h-12 w-auto object-contain sm:h-14"
                  loading="lazy"
                />
              ))}
            </div>
          )}
        </div>

        {/* Big icon */}
        <div className="origin-right shrink-0 text-right text-7xl leading-none opacity-90 transition-transform group-hover:scale-105 sm:text-9xl">
          {h.icon}
        </div>
      </div>
    </div>
  );
}
