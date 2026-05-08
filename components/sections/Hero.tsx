"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight, Sparkles, Zap } from "lucide-react";
import { GithubIcon } from "@/components/BrandIcons";
import {
  HACKATHONS,
  PROGRAM,
  allProjects,
  formatSats,
} from "@/lib/hackathons";
import { PROJECTS } from "@/lib/projects";

export default function Hero() {
  return (
    <section className="relative overflow-hidden pt-32 pb-24 sm:pt-40 sm:pb-32">
      {/* Background decoration */}
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute inset-0 bg-grid bg-grid-fade opacity-60" />
        <motion.div
          animate={{
            x: [0, 40, -30, 0],
            y: [0, -30, 40, 0],
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full bg-bitcoin/15 blur-[120px]"
        />
        <motion.div
          animate={{
            x: [0, -40, 30, 0],
            y: [0, 30, -40, 0],
          }}
          transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-1/3 right-1/4 w-[500px] h-[500px] rounded-full bg-nostr/15 blur-[120px]"
        />
        <motion.div
          animate={{
            x: [0, 30, -20, 0],
            y: [0, 20, -30, 0],
          }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-1/4 left-1/2 w-[400px] h-[400px] rounded-full bg-cyan/10 blur-[100px]"
        />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center text-center max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-6"
          >
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-bitcoin/30 bg-bitcoin/10 text-xs font-mono tracking-wider text-bitcoin">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-bitcoin opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-bitcoin" />
              </span>
              CÓDIGO ABIERTO · BITCOIN · LIGHTNING · NOSTR
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="font-display text-[44px] sm:text-6xl md:text-7xl lg:text-[92px] font-bold leading-[0.95] tracking-tight"
          >
            <span className="block text-foreground">Acá construimos</span>
            <span className="block text-gradient-hero animate-gradient-x">
              el futuro
            </span>
            <span className="block text-foreground">del dinero.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="mt-8 text-lg sm:text-xl text-foreground-muted max-w-2xl leading-relaxed"
          >
            La Crypta Dev explora, investiga y lanza prototipos y productos
            reales sobre{" "}
            <span className="text-bitcoin font-semibold">Bitcoin</span>,{" "}
            <span className="text-lightning font-semibold">Lightning</span> y{" "}
            <span className="text-nostr font-semibold">Nostr</span>. Operamos
            infraestructura, organizamos hackatones y formamos a la próxima
            generación de builders.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="mt-10 flex flex-col sm:flex-row items-center gap-3"
          >
            <Link
              href="/infrastructure"
              className="group relative inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-bitcoin to-yellow-500 text-black font-semibold text-base shadow-xl shadow-bitcoin/20 hover:shadow-bitcoin/40 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <Zap className="h-4 w-4" strokeWidth={2.5} />
              Ver infraestructura
              <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <Link
              href="/projects"
              className="group inline-flex items-center gap-2 px-6 py-3.5 rounded-xl glass hover:bg-white/[0.08] border border-border-strong font-semibold text-base transition-all"
            >
              <Sparkles className="h-4 w-4" />
              Ver proyectos
              <ArrowRight className="h-4 w-4 opacity-0 -ml-4 group-hover:opacity-100 group-hover:ml-0 transition-all" />
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.5 }}
            className="mt-6 flex items-center gap-2 text-sm text-foreground-subtle"
          >
            <GithubIcon className="h-3.5 w-3.5" />
            <span>100% código abierto ·</span>
            <a
              href="https://github.com/lacrypta/lacrypta-dev"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground-muted hover:text-bitcoin transition-colors"
            >
              github.com/lacrypta/lacrypta-dev
            </a>
          </motion.div>
        </div>

        <HeroStats />
      </div>
    </section>
  );
}

function HeroStats() {
  const curatedCount = PROJECTS.length;
  const hackathonProjects = allProjects().length;
  const totalProjects = curatedCount + hackathonProjects;
  const buildersCount = new Set(
    allProjects().flatMap((p) => p.team.map((m) => m.name.toLowerCase())),
  ).size;

  const stats = [
    {
      label: "Proyectos open source",
      value: `${totalProjects}+`,
      accent: "text-bitcoin",
    },
    {
      label: "Builders en hackatones",
      value: `${buildersCount}+`,
      accent: "text-nostr",
    },
    {
      label: "Hackatones 2026",
      value: String(HACKATHONS.length),
      accent: "text-cyan",
    },
    {
      label: "Premios totales",
      value: `${formatSats(PROGRAM.totalPrize)} sats`,
      accent: "text-lightning",
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.6 }}
      className="mt-24 grid grid-cols-2 lg:grid-cols-4 gap-px rounded-2xl overflow-hidden bg-border border border-border"
    >
      {stats.map((s) => (
        <div
          key={s.label}
          className="bg-background-elevated/80 backdrop-blur p-6 lg:p-8"
        >
          <div
            className={`font-display text-4xl lg:text-5xl font-bold ${s.accent}`}
          >
            {s.value}
          </div>
          <div className="mt-2 text-sm text-foreground-muted">{s.label}</div>
        </div>
      ))}
    </motion.div>
  );
}
