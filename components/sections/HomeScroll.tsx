"use client";

import { useRef, useState, useCallback } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useMotionValueEvent,
  type MotionValue,
} from "framer-motion";
import Link from "next/link";
import {
  Trophy,
  FolderKanban,
  Globe,
  ArrowRight,
  Code2,
  Zap,
  Award,
  Users,
  Radio,
  Cpu,
  GitBranch,
} from "lucide-react";
import { cn } from "@/lib/cn";

type Feature = {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
};

type Section = {
  id: string;
  number: string;
  label: string;
  tagline: string;
  description: string;
  colorClass: string;
  bgClass: string;
  borderClass: string;
  dotBgClass: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  cta: string;
  features: Feature[];
};

const SECTIONS: Section[] = [
  {
    id: "hackathons",
    number: "01",
    label: "Hackatones",
    tagline: "Aprendé construyendo",
    description:
      "Cada mes, un desafío real. Construís, iterás con feedback y ganás sats por participar. No necesitás experiencia previa.",
    colorClass: "text-bitcoin",
    bgClass: "bg-bitcoin/10",
    borderClass: "border-bitcoin/30",
    dotBgClass: "bg-bitcoin",
    icon: Trophy,
    href: "/hackathons",
    cta: "Ver hackatones",
    features: [
      {
        icon: Code2,
        title: "Aprendé haciendo",
        description:
          "Instrucciones claras y feedback real en cada etapa del proceso.",
      },
      {
        icon: Zap,
        title: "Vibecoding",
        description:
          "Sin experiencia previa en programación. Solo ganas de construir.",
      },
      {
        icon: Award,
        title: "Ganás por participar",
        description: "Premios en sats reales para todos los proyectos presentados.",
      },
    ],
  },
  {
    id: "projects",
    number: "02",
    label: "Proyectos",
    tagline: "Lo que construye la comunidad",
    description:
      "Proyectos reales, open source, usables hoy. Apps, servicios y herramientas construidas sobre Bitcoin, Lightning y Nostr.",
    colorClass: "text-nostr",
    bgClass: "bg-nostr/10",
    borderClass: "border-nostr/30",
    dotBgClass: "bg-nostr",
    icon: FolderKanban,
    href: "/projects",
    cta: "Ver proyectos",
    features: [
      {
        icon: Users,
        title: "Hechos por la comunidad",
        description: "Builders de toda Latinoamérica construyen juntos.",
      },
      {
        icon: GitBranch,
        title: "Open source",
        description: "Todo el código es público y auditable. Sin secretos.",
      },
      {
        icon: Zap,
        title: "Productos y servicios reales",
        description: "Apps y herramientas que se pueden usar hoy mismo.",
      },
    ],
  },
  {
    id: "infrastructure",
    number: "03",
    label: "Infra pública",
    tagline: "Infraestructura abierta",
    description:
      "Nodos, relays y cómputo disponibles para toda la comunidad. Sin permisos, sin registro.",
    colorClass: "text-cyan",
    bgClass: "bg-cyan/10",
    borderClass: "border-cyan/30",
    dotBgClass: "bg-cyan",
    icon: Globe,
    href: "/infrastructure",
    cta: "Ver infra",
    features: [
      {
        icon: Zap,
        title: "Bitcoin + Lightning",
        description: "Nodo propio con canales activos de Lightning Network.",
      },
      {
        icon: Radio,
        title: "Nostr & Blossom",
        description: "Relay de Nostr y almacenamiento distribuido con Blossom.",
      },
      {
        icon: Cpu,
        title: "Cómputo AI",
        description: "Tokens para usar modelos de inteligencia artificial.",
      },
    ],
  },
];

const N = SECTIONS.length;

export default function HomeScroll() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: containerRef });
  const [activeSection, setActiveSection] = useState(0);

  useMotionValueEvent(scrollYProgress, "change", (v) => {
    const idx = Math.min(Math.floor(v * N), N - 1);
    setActiveSection(idx);
  });

  const scrollToSection = useCallback((index: number) => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const maxScroll = container.offsetHeight - window.innerHeight + container.offsetTop;
    // Land ~20% into the section so features start revealing
    const target = ((index + 0.2) / N) * maxScroll;
    window.scrollTo({ top: target, behavior: "smooth" });
  }, []);

  return (
    <>
      {/* ── Desktop ─────────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        style={{ height: `${N * 200}vh` }}
        className="hidden lg:block"
      >
        <div className="sticky top-16 h-[calc(100vh-4rem)] flex overflow-hidden">
          {/* Ambient glow */}
          <div className="absolute inset-0 pointer-events-none -z-10">
            {SECTIONS.map((s, i) => (
              <div
                key={s.id}
                className={cn(
                  "absolute inset-0 blur-[180px] opacity-0 transition-opacity duration-1000",
                  i === activeSection && "opacity-[0.13]",
                  i === 0 && "bg-bitcoin",
                  i === 1 && "bg-nostr",
                  i === 2 && "bg-cyan",
                )}
              />
            ))}
          </div>

          {/* Section content panels — all absolutely stacked */}
          <div className="flex-1 relative">
            {SECTIONS.map((section, i) => (
              <SectionPanel
                key={section.id}
                section={section}
                index={i}
                scrollYProgress={scrollYProgress}
              />
            ))}
          </div>

          {/* Timeline */}
          <Timeline
            activeSection={activeSection}
            scrollYProgress={scrollYProgress}
            onNavigate={scrollToSection}
          />
        </div>
      </div>

      {/* ── Mobile ──────────────────────────────────────────────────── */}
      <div className="lg:hidden">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <section
              key={s.id}
              className="min-h-[80vh] flex flex-col justify-center px-6 py-24 border-b border-border last:border-0"
            >
              <div
                className={cn(
                  "text-[10px] font-mono tracking-[0.2em] uppercase mb-5",
                  s.colorClass,
                )}
              >
                {s.number} / 0{N}
              </div>
              <div
                className={cn(
                  "p-3 rounded-2xl border w-fit mb-6",
                  s.bgClass,
                  s.borderClass,
                )}
              >
                <Icon className={cn("h-7 w-7", s.colorClass)} />
              </div>
              <h2 className="font-display text-4xl font-bold tracking-tight mb-3">
                {s.label}
              </h2>
              <p className="text-foreground-muted leading-relaxed mb-8">
                {s.description}
              </p>
              <ul className="space-y-4 mb-8">
                {s.features.map((f) => {
                  const FIcon = f.icon;
                  return (
                    <li key={f.title} className="flex items-start gap-3">
                      <span
                        className={cn(
                          "p-1.5 rounded-lg border shrink-0 mt-0.5",
                          s.bgClass,
                          s.borderClass,
                        )}
                      >
                        <FIcon className={cn("h-3.5 w-3.5", s.colorClass)} />
                      </span>
                      <div>
                        <div className="font-semibold text-sm">{f.title}</div>
                        <div className="text-sm text-foreground-muted mt-0.5">
                          {f.description}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <Link
                href={s.href}
                className={cn(
                  "inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm border w-fit transition-all hover:scale-[1.02]",
                  s.bgClass,
                  s.borderClass,
                  s.colorClass,
                )}
              >
                {s.cta} <ArrowRight className="h-4 w-4" />
              </Link>
            </section>
          );
        })}
      </div>
    </>
  );
}

/* ── Section panel ────────────────────────────────────────────────────── */
function SectionPanel({
  section,
  index,
  scrollYProgress,
}: {
  section: Section;
  index: number;
  scrollYProgress: MotionValue<number>;
}) {
  const span = 1 / N;
  const start = index * span;
  const end = start + span;

  // Whole-panel opacity: fade in quickly, stay, fade out at end
  const opacity = useTransform(
    scrollYProgress,
    [start, start + span * 0.07, end - span * 0.07, end],
    [0, 1, 1, 0],
  );
  const yShift = useTransform(
    scrollYProgress,
    [start, start + span * 0.07],
    [36, 0],
  );

  // Feature reveals — staggered across 15%-65% of the section's range
  const featurePcts = [0.15, 0.32, 0.49];
  const featureOpacities = featurePcts.map((pct) =>
    useTransform(
      scrollYProgress,
      [start + span * pct, start + span * (pct + 0.12)],
      [0, 1],
    ),
  );
  const featureYs = featurePcts.map((pct) =>
    useTransform(
      scrollYProgress,
      [start + span * pct, start + span * (pct + 0.12)],
      [18, 0],
    ),
  );
  const ctaOpacity = useTransform(
    scrollYProgress,
    [start + span * 0.66, start + span * 0.76],
    [0, 1],
  );

  // Only the visible panel should capture clicks. Without this, faded panels
  // stacked on top (later in DOM order) intercept pointer events and block
  // the active panel's CTA.
  const panelPointerEvents = useTransform(opacity, (o) =>
    o > 0.5 ? "auto" : "none",
  );

  const Icon = section.icon;

  return (
    <motion.div
      style={{ opacity, y: yShift }}
      className="absolute inset-0 flex items-center px-12 xl:px-20 py-12 pointer-events-none"
    >
      <motion.div
        className="w-full max-w-lg"
        style={{ pointerEvents: panelPointerEvents }}
      >
        {/* Number + icon row */}
        <div className="flex items-center gap-3 mb-7">
          <span
            className={cn(
              "text-[11px] font-mono tracking-[0.2em] uppercase",
              section.colorClass,
            )}
          >
            {section.number} / 0{N}
          </span>
          <div
            className={cn(
              "p-2 rounded-xl border",
              section.bgClass,
              section.borderClass,
            )}
          >
            <Icon className={cn("h-4 w-4", section.colorClass)} />
          </div>
        </div>

        {/* Title */}
        <h2 className="font-display text-5xl xl:text-6xl 2xl:text-7xl font-bold tracking-tight mb-5 leading-[0.95]">
          {section.label}
        </h2>

        {/* Description */}
        <p className="text-base xl:text-lg text-foreground-muted leading-relaxed mb-10">
          {section.description}
        </p>

        {/* Features — scroll-driven stagger */}
        <ul className="space-y-4 mb-10">
          {section.features.map((f, fi) => {
            const FIcon = f.icon;
            return (
              <motion.li
                key={f.title}
                style={{
                  opacity: featureOpacities[fi],
                  y: featureYs[fi],
                }}
                className="flex items-start gap-4"
              >
                <span
                  className={cn(
                    "p-2 rounded-xl border shrink-0 mt-0.5",
                    section.bgClass,
                    section.borderClass,
                  )}
                >
                  <FIcon className={cn("h-4 w-4", section.colorClass)} />
                </span>
                <div>
                  <div className="font-semibold text-sm text-foreground">
                    {f.title}
                  </div>
                  <div className="text-sm text-foreground-muted mt-0.5">
                    {f.description}
                  </div>
                </div>
              </motion.li>
            );
          })}
        </ul>

        {/* CTA */}
        <motion.div style={{ opacity: ctaOpacity }}>
          <Link
            href={section.href}
            className={cn(
              "group inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm",
              "border transition-all hover:scale-[1.03] active:scale-[0.98]",
              section.bgClass,
              section.borderClass,
              section.colorClass,
            )}
          >
            {section.cta}
            <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

/* ── Timeline ─────────────────────────────────────────────────────────── */
function Timeline({
  activeSection,
  scrollYProgress,
  onNavigate,
}: {
  activeSection: number;
  scrollYProgress: MotionValue<number>;
  onNavigate: (index: number) => void;
}) {
  // Fill line goes from dot 0 to dot N-1 as scrollYProgress goes 0 → (N-1)/N
  const fillPct = useTransform(
    scrollYProgress,
    [0, (N - 1) / N],
    ["0%", "100%"],
  );

  return (
    <div className="w-48 xl:w-56 shrink-0 flex flex-col justify-center items-start py-16 pr-10 xl:pr-16">
      {/* Track + dots container — centred vertically, 55% of panel height */}
      <div className="relative w-full" style={{ height: "55%" }}>
        {/* Background track */}
        <div className="absolute left-[7px] top-3 bottom-3 w-[2px] rounded-full bg-border" />

        {/* Filled track */}
        <motion.div
          className="absolute left-[7px] top-3 w-[2px] rounded-full origin-top"
          style={{
            height: fillPct,
            background:
              "linear-gradient(to bottom, #f7931a 0%, #a855f7 50%, #22d3ee 100%)",
          }}
        />

        {/* Dots + labels at top / middle / bottom */}
        <div className="absolute inset-0 flex flex-col justify-between">
          {SECTIONS.map((s, i) => {
            const isActive = i === activeSection;
            const isPast = i < activeSection;

            return (
              <button
                key={s.id}
                onClick={() => onNavigate(i)}
                className="flex items-center gap-3.5 group text-left"
                aria-label={`Ir a ${s.label}`}
              >
                {/* Dot */}
                <div
                  className={cn(
                    "relative h-[14px] w-[14px] rounded-full border-2 shrink-0 transition-all duration-500",
                    isActive
                      ? cn("border-current scale-125", s.colorClass)
                      : isPast
                        ? cn("border-current", s.colorClass)
                        : "border-foreground-subtle bg-background",
                  )}
                >
                  {/* Inner fill */}
                  {(isActive || isPast) && (
                    <span
                      className={cn(
                        "absolute inset-0 m-auto rounded-full transition-all duration-500",
                        isActive ? "h-[5px] w-[5px] animate-pulse" : "h-[4px] w-[4px]",
                        s.dotBgClass,
                      )}
                    />
                  )}

                  {/* Active glow ring */}
                  {isActive && (
                    <span
                      className={cn(
                        "absolute -inset-1.5 rounded-full opacity-25 animate-ping",
                        s.dotBgClass,
                      )}
                    />
                  )}
                </div>

                {/* Label */}
                <div>
                  <p
                    className={cn(
                      "text-[11px] font-mono tracking-[0.15em] uppercase leading-none transition-all duration-300",
                      isActive
                        ? cn("font-bold", s.colorClass)
                        : isPast
                          ? "text-foreground-muted"
                          : "text-foreground-subtle group-hover:text-foreground-muted",
                    )}
                  >
                    {s.label}
                  </p>
                  <p
                    className={cn(
                      "text-[10px] leading-snug mt-0.5 transition-all duration-300",
                      isActive
                        ? "text-foreground-subtle"
                        : "text-transparent group-hover:text-foreground-subtle",
                    )}
                  >
                    {s.tagline}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
