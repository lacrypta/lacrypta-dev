"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Gamepad2, Radio, Sparkles, Trophy, Zap } from "lucide-react";

const pixelRows = [
  [0, 1, 0, 0, 1, 0, 1, 0],
  [1, 1, 1, 0, 1, 1, 1, 0],
  [1, 0, 1, 1, 1, 0, 1, 1],
  [0, 1, 1, 1, 0, 1, 1, 0],
  [1, 0, 1, 0, 1, 1, 0, 1],
];

export default function GamingHackathonBanner() {
  return (
    <section className="relative overflow-hidden border-b border-bitcoin/30 bg-[#05070e] pt-24 sm:pt-28">
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(135deg, rgba(247,147,26,0.30) 0%, rgba(34,211,238,0.18) 32%, rgba(139,92,246,0.28) 67%, rgba(5,7,14,1) 100%)",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 mix-blend-screen opacity-70"
        style={{
          background:
            "repeating-linear-gradient(120deg, transparent 0 18px, rgba(247,147,26,0.20) 18px 20px, transparent 20px 42px), repeating-linear-gradient(0deg, rgba(255,255,255,0.06) 0 1px, transparent 1px 7px)",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 opacity-35"
        style={{
          backgroundImage:
            "linear-gradient(rgba(34,211,238,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(247,147,26,0.28) 1px, transparent 1px)",
          backgroundSize: "42px 42px",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,7,14,0.10)_0%,rgba(5,7,14,0.14)_45%,rgba(5,7,14,0.84)_100%)]"
      />
      <div
        aria-hidden
        className="absolute -left-24 top-20 h-56 w-[140%] -rotate-6 bg-cyan/10 blur-2xl"
      />
      <div
        aria-hidden
        className="absolute -right-24 bottom-10 h-48 w-[120%] rotate-6 bg-bitcoin/15 blur-2xl"
      />
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-bitcoin to-transparent"
      />

      <div className="relative mx-auto grid max-w-7xl items-center gap-8 px-4 py-14 sm:px-6 sm:py-16 lg:grid-cols-[1fr_360px] lg:px-8">
        <motion.div
          initial={false}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="max-w-4xl"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-3 py-1.5 text-[10px] font-mono font-black uppercase tracking-[0.24em] text-success">
            <Radio className="h-3 w-3 animate-pulse" />
            Ya arrancó
          </div>

          <div className="mt-5 flex flex-wrap items-end gap-x-4 gap-y-2">
            <h2 className="font-display text-5xl font-black uppercase leading-[0.86] tracking-tight sm:text-7xl lg:text-8xl">
              GAMING
            </h2>
            <span className="mb-1 inline-flex items-center gap-2 rounded-xl border border-cyan/35 bg-cyan/10 px-3 py-2 font-mono text-xs font-bold uppercase tracking-[0.18em] text-cyan">
              <Gamepad2 className="h-4 w-4" />
              Hackaton #04
            </span>
          </div>

          <p className="mt-5 max-w-2xl text-lg font-semibold leading-relaxed text-foreground sm:text-xl">
            Construí juegos con Bitcoin, Lightning y Nostr.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/hackathons/zaps"
              className="group inline-flex items-center justify-center gap-3 rounded-2xl bg-bitcoin px-7 py-4 font-display text-base font-black uppercase tracking-wide text-black shadow-[0_0_42px_rgba(247,147,26,0.38)] transition-all hover:scale-[1.025] hover:shadow-[0_0_64px_rgba(247,147,26,0.55)] active:scale-[0.98]"
            >
              Inscribirme ahora
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Link>
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-white/[0.04] px-5 py-4 text-sm font-mono font-bold text-foreground-muted sm:justify-start">
              <Trophy className="h-4 w-4 text-bitcoin" />
              1M sats en premios
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={false}
          whileInView={{ opacity: 1, scale: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.55, ease: "easeOut", delay: 0.08 }}
          className="relative mx-auto hidden w-full max-w-[360px] lg:block"
          aria-hidden
        >
          <div className="relative aspect-square overflow-hidden rounded-[28px] border border-cyan/30 bg-black/35 shadow-[0_0_80px_rgba(34,211,238,0.18)]">
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(34,211,238,0.10)_0%,transparent_45%,rgba(247,147,26,0.12)_100%)]" />
            <div className="absolute left-1/2 top-9 -translate-x-1/2 rounded-2xl border border-bitcoin/40 bg-bitcoin/10 px-4 py-2 font-mono text-[10px] font-black uppercase tracking-[0.22em] text-bitcoin">
              Press Start
            </div>

            <div className="absolute left-1/2 top-1/2 grid -translate-x-1/2 -translate-y-1/2 gap-2">
              {pixelRows.map((row, rowIndex) => (
                <div key={rowIndex} className="flex gap-2">
                  {row.map((active, colIndex) => (
                    <motion.span
                      key={`${rowIndex}-${colIndex}`}
                      className={
                        active
                          ? "h-7 w-7 rounded-md bg-cyan shadow-[0_0_20px_rgba(34,211,238,0.58)]"
                          : "h-7 w-7 rounded-md bg-white/[0.06]"
                      }
                      animate={
                        active
                          ? { opacity: [0.55, 1, 0.55], scale: [0.96, 1, 0.96] }
                          : undefined
                      }
                      transition={{
                        duration: 2.2,
                        delay: (rowIndex + colIndex) * 0.05,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>

            <div className="absolute bottom-8 left-8 right-8 flex items-center justify-between">
              <span className="inline-flex items-center gap-2 rounded-xl border border-nostr/40 bg-nostr/10 px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-nostr">
                <Sparkles className="h-3.5 w-3.5" />
                Boss level
              </span>
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-bitcoin/40 bg-bitcoin/10 text-bitcoin">
                <Zap className="h-6 w-6" />
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
