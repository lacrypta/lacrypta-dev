"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  useMotionValueEvent,
  type MotionValue,
} from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import {
  Trophy,
  FolderKanban,
  Layers,
  ArrowRight,
  Code2,
  Zap,
  Award,
  Users,
  GitBranch,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { PROJECTS } from "@/lib/projects";

type Feature = {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
};

type Pillar = {
  src: string;
  label: string;
};

type Stat = {
  value: number;
  label: string;
  suffix?: string;
};

type Section = {
  id: string;
  number: string;
  label: string;
  tagline: string;
  description?: string;
  colorClass: string;
  bgClass: string;
  borderClass: string;
  dotBgClass: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  cta: string;
  features?: Feature[];
  pillars?: Pillar[];
  techTags?: string[];
  stats?: Stat[];
};

const SECTIONS: Section[] = [
  {
    id: "hackathons",
    number: "01",
    label: "Hackatones",
    tagline: "Desafío mensual",
    description: "Un finde. Un build. Premios reales.",
    colorClass: "text-bitcoin",
    bgClass: "bg-bitcoin/10",
    borderClass: "border-bitcoin/30",
    dotBgClass: "bg-bitcoin",
    icon: Trophy,
    href: "/hackathons",
    cta: "Ver hackatones",
    features: [
      { icon: Code2, title: "Aprendé haciendo" },
      { icon: Sparkles, title: "Sin experiencia técnica" },
      { icon: Award, title: "Ganá premios por participar" },
    ],
    techTags: ["Lightning", "Nostr", "NWC"],
    stats: [
      { value: 26, label: "Proyectos concursados" },
      { value: 2, label: "Hackatones" },
    ],
  },
  {
    id: "projects",
    number: "02",
    label: "Proyectos",
    tagline: "Lo que construye la comunidad",
    colorClass: "text-nostr",
    bgClass: "bg-nostr/10",
    borderClass: "border-nostr/30",
    dotBgClass: "bg-nostr",
    icon: FolderKanban,
    href: "/projects",
    cta: "Ver proyectos",
    features: [
      { icon: Users, title: "HECHOS por la comunidad" },
      { icon: GitBranch, title: "100% Open Source" },
      { icon: Zap, title: "Apps funcionales" },
    ],
  },
  {
    id: "tech",
    number: "03",
    label: "Tecnologías",
    tagline: "El stack abierto",
    description:
      "Las 8 piezas con las que se construye en cada hackatón. Bitcoin layer 2s, Nostr y assets nativos sobre cadenas afines.",
    colorClass: "text-cyan",
    bgClass: "bg-cyan/10",
    borderClass: "border-cyan/30",
    dotBgClass: "bg-cyan",
    icon: Layers,
    href: "/infrastructure",
    cta: "Usá nuestra infra",
    pillars: [
      { src: "/pilares/lightning.svg", label: "Lightning" },
      { src: "/pilares/nostr.svg", label: "Nostr" },
      { src: "/pilares/liquid.svg", label: "Liquid" },
      { src: "/pilares/rgb.svg", label: "RGB" },
      { src: "/pilares/taproot-assets.png", label: "Taproot Assets" },
      { src: "/pilares/spark.svg", label: "Spark" },
      { src: "/pilares/ark.png", label: "Ark" },
      { src: "/pilares/rsk.jpg", label: "Rootstock" },
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
              className="relative overflow-hidden min-h-[80vh] flex flex-col justify-center px-6 py-24 border-b border-border last:border-0"
            >
              {s.id === "hackathons" && <FloatingTechIcons variant="mobile" />}
              {s.id === "projects" && (
                <Link
                  href={s.href}
                  className="absolute top-20 right-6 z-20 inline-flex items-center gap-3 px-7 py-4 rounded-2xl font-display font-black text-xl uppercase tracking-wide border-2 bg-nostr/15 border-nostr/60 text-nostr shadow-[0_0_50px_rgba(168,85,247,0.40)] hover:scale-[1.04] active:scale-[0.97] transition-all"
                >
                  {s.cta}
                  <ArrowRight className="h-6 w-6" />
                </Link>
              )}
              <div
                className={cn(
                  "relative z-10 text-[10px] font-mono tracking-[0.2em] uppercase mb-5",
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
              <h2 className="font-display text-4xl font-bold tracking-tight mb-3 relative z-10">
                {s.label}
              </h2>
              {s.description && (
                <p className="text-foreground-muted leading-relaxed mb-8 relative z-10">
                  {s.description}
                </p>
              )}
              {s.id === "projects" && (
                <BigProjectCount count={PROJECTS.length} className="mb-8" />
              )}
              {s.pillars ? (
                <TechMatrix pillars={s.pillars} className="mb-8" />
              ) : (
                <ul className="space-y-4 mb-8">
                  {s.features?.map((f, fi) => {
                    const FIcon = f.icon;
                    return (
                      <motion.li
                        key={f.title}
                        initial={{ opacity: 0, x: -12 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true, margin: "-40px" }}
                        transition={{ duration: 0.45, delay: fi * 0.08, ease: "easeOut" }}
                        className="flex items-start gap-3"
                      >
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
                          {f.description && (
                            <div className="text-sm text-foreground-muted mt-0.5">
                              {f.description}
                            </div>
                          )}
                        </div>
                      </motion.li>
                    );
                  })}
                </ul>
              )}
              {s.id !== "hackathons" && s.techTags && (
                <TechChips
                  tags={s.techTags}
                  colorClass={s.colorClass}
                  bgClass={s.bgClass}
                  borderClass={s.borderClass}
                  className="mb-8"
                />
              )}
              {s.stats && (
                <StatsRow
                  stats={s.stats}
                  colorClass={s.colorClass}
                  borderClass={s.borderClass}
                  className="mb-8"
                />
              )}
              {s.id === "projects" && (
                <ProjectMarquee
                  names={PROJECTS.map((p) => p.name)}
                  className="mb-8"
                />
              )}
              {s.id !== "projects" && (
                <Link
                  href={s.href}
                  className={cn(
                    "inline-flex items-center gap-3 px-7 py-4 rounded-2xl font-display font-black text-xl uppercase tracking-wide border-2 w-fit transition-all hover:scale-[1.04] active:scale-[0.97]",
                    s.bgClass,
                    s.borderClass,
                    s.colorClass,
                  )}
                >
                  {s.cta} <ArrowRight className="h-6 w-6" />
                </Link>
              )}
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
      {section.id === "hackathons" && <FloatingTechIcons variant="desktop" />}
      {section.id === "projects" && (
        <motion.div
          style={{ opacity: ctaOpacity, pointerEvents: panelPointerEvents }}
          className="absolute top-16 xl:top-24 right-12 xl:right-20 z-20"
        >
          <Link
            href={section.href}
            className="group inline-flex items-center gap-3 rounded-2xl border-2 border-nostr/60 bg-nostr/15 px-10 py-6 font-display font-black text-2xl xl:text-3xl uppercase tracking-wide text-nostr shadow-[0_0_60px_rgba(168,85,247,0.45)] hover:scale-[1.04] active:scale-[0.97] transition-all"
          >
            {section.cta}
            <ArrowRight className="h-7 w-7 group-hover:translate-x-1 transition-transform" />
          </Link>
        </motion.div>
      )}
      <motion.div
        className={cn(
          "relative z-10 w-full",
          section.id === "tech" ? "max-w-3xl" : "max-w-lg",
        )}
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
        {section.description && (
          <p className="text-base xl:text-lg text-foreground-muted leading-relaxed mb-10">
            {section.description}
          </p>
        )}

        {section.id === "projects" && (
          <BigProjectCount count={PROJECTS.length} className="mb-10" />
        )}

        {section.pillars ? (
          <TechMatrix pillars={section.pillars} className="mb-10" />
        ) : (
          <ul className="space-y-4 mb-10">
            {section.features?.map((f, fi) => {
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
                    {f.description && (
                      <div className="text-sm text-foreground-muted mt-0.5">
                        {f.description}
                      </div>
                    )}
                  </div>
                </motion.li>
              );
            })}
          </ul>
        )}

        {section.stats && (
          <StatsRow
            stats={section.stats}
            colorClass={section.colorClass}
            borderClass={section.borderClass}
            className="mb-10"
          />
        )}

        {section.id === "projects" && (
          <ProjectMarquee
            names={PROJECTS.map((p) => p.name)}
            className="mb-10"
          />
        )}

        {/* CTA — hidden for projects (rendered top-right) */}
        {section.id !== "projects" && (
          <motion.div style={{ opacity: ctaOpacity }}>
            <Link
              href={section.href}
              className={cn(
                "group inline-flex items-center gap-3 px-8 py-5 rounded-2xl font-display font-black text-xl xl:text-2xl uppercase tracking-wide",
                "border-2 transition-all hover:scale-[1.04] active:scale-[0.97]",
                section.bgClass,
                section.borderClass,
                section.colorClass,
              )}
            >
              {section.cta}
              <ArrowRight className="h-6 w-6 xl:h-7 xl:w-7 group-hover:translate-x-1 transition-transform" />
            </Link>
          </motion.div>
        )}
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

/* ── Tech chips ───────────────────────────────────────────────────────── */
function TechChips({
  tags,
  colorClass,
  bgClass,
  borderClass,
  className,
  orientation = "horizontal",
}: {
  tags: string[];
  colorClass: string;
  bgClass: string;
  borderClass: string;
  className?: string;
  orientation?: "horizontal" | "vertical";
}) {
  return (
    <div
      className={cn(
        orientation === "vertical"
          ? "flex flex-col gap-2 items-start"
          : "flex flex-wrap gap-2",
        className,
      )}
    >
      {tags.map((t, i) => (
        <motion.span
          key={t}
          initial={{ opacity: 0, scale: 0.85, x: orientation === "vertical" ? 12 : 0, y: orientation === "vertical" ? 0 : 6 }}
          whileInView={{ opacity: 1, scale: 1, x: 0, y: 0 }}
          viewport={{ once: true, margin: "-30px" }}
          transition={{
            duration: 0.4,
            delay: 0.05 + i * 0.08,
            ease: [0.22, 1, 0.36, 1],
          }}
          whileHover={{ y: -2, transition: { duration: 0.2 } }}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-mono font-bold tracking-[0.18em] uppercase",
            bgClass,
            borderClass,
            colorClass,
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full animate-pulse", colorClass.replace("text-", "bg-"))} />
          {t}
        </motion.span>
      ))}
    </div>
  );
}

/* ── Stats row ────────────────────────────────────────────────────────── */
function StatsRow({
  stats,
  colorClass,
  borderClass,
  className,
}: {
  stats: Stat[];
  colorClass: string;
  borderClass: string;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:gap-4", className)}>
      {stats.map((s, i) => (
        <AnimatedStat
          key={s.label}
          stat={s}
          delay={i * 0.12}
          colorClass={colorClass}
          borderClass={borderClass}
        />
      ))}
    </div>
  );
}

function AnimatedStat({
  stat,
  delay,
  colorClass,
  borderClass,
}: {
  stat: Stat;
  delay: number;
  colorClass: string;
  borderClass: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduced = useReducedMotion();
  const display = useMotionValue(0);
  const [shown, setShown] = useState("0");

  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setShown(String(stat.value));
      return;
    }
    const controls = animate(display, stat.value, {
      duration: 1.4,
      delay,
      ease: "easeOut",
      onUpdate: (v) => setShown(Math.round(v).toString()),
    });
    return () => controls.stop();
  }, [inView, reduced, stat.value, delay, display]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-background-card/40 backdrop-blur-sm px-4 py-3.5",
        borderClass,
      )}
    >
      <div className="font-display text-3xl font-black tracking-tight tabular-nums leading-none">
        {shown}
        {stat.suffix && <span className={colorClass}>{stat.suffix}</span>}
      </div>
      <div className="mt-1.5 text-[10px] font-mono uppercase tracking-[0.18em] text-foreground-subtle">
        {stat.label}
      </div>
    </motion.div>
  );
}

/* ── Floating tech icons (Lightning · Nostr · NWC) ────────────────────── */
type FloatingItem =
  | {
      kind: "image";
      src: string;
      label: string;
      x: string;
      y: string;
      size: number;
      drift: number;
      tone: "bitcoin" | "nostr" | "cyan";
    }
  | {
      kind: "text";
      label: string;
      x: string;
      y: string;
      size: number;
      drift: number;
      tone: "bitcoin" | "nostr" | "cyan";
    };

function FloatingTechIcons({ variant }: { variant: "desktop" | "mobile" }) {
  const reduced = useReducedMotion();
  const desktop = variant === "desktop";

  const items: FloatingItem[] = desktop
    ? [
        { kind: "image", src: "/pilares/lightning.svg", label: "Lightning", x: "30%", y: "18%", size: 76, drift: 9, tone: "bitcoin" },
        { kind: "image", src: "/pilares/nostr.svg", label: "Nostr", x: "78%", y: "48%", size: 68, drift: 11, tone: "nostr" },
        { kind: "text", label: "NWC", x: "38%", y: "78%", size: 64, drift: 7, tone: "cyan" },
      ]
    : [
        { kind: "image", src: "/pilares/lightning.svg", label: "Lightning", x: "78%", y: "12%", size: 52, drift: 8, tone: "bitcoin" },
        { kind: "image", src: "/pilares/nostr.svg", label: "Nostr", x: "88%", y: "44%", size: 48, drift: 10, tone: "nostr" },
        { kind: "text", label: "NWC", x: "72%", y: "76%", size: 46, drift: 6, tone: "cyan" },
      ];

  const toneStyles: Record<
    "bitcoin" | "nostr" | "cyan",
    { border: string; ring: string; text: string; shadow: string; line: string }
  > = {
    bitcoin: {
      border: "border-bitcoin/45",
      ring: "border-bitcoin/30",
      text: "text-bitcoin",
      shadow: "shadow-[0_0_30px_rgba(247,147,26,0.30)]",
      line: "text-bitcoin/20",
    },
    nostr: {
      border: "border-nostr/45",
      ring: "border-nostr/30",
      text: "text-nostr",
      shadow: "shadow-[0_0_30px_rgba(168,85,247,0.30)]",
      line: "text-nostr/20",
    },
    cyan: {
      border: "border-cyan/45",
      ring: "border-cyan/30",
      text: "text-cyan",
      shadow: "shadow-[0_0_30px_rgba(34,211,238,0.30)]",
      line: "text-cyan/20",
    },
  };

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* ambient glow */}
      <motion.div
        aria-hidden
        className={cn(
          "absolute rounded-full blur-3xl bg-bitcoin/[0.10]",
          desktop
            ? "right-[10%] top-1/2 -translate-y-1/2 h-[520px] w-[520px]"
            : "right-[-20%] top-1/2 -translate-y-1/2 h-[360px] w-[360px]",
        )}
        animate={reduced ? undefined : { scale: [1, 1.12, 1], opacity: [0.45, 0.75, 0.45] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* connecting lines between icons */}
      <svg
        className="absolute inset-0 h-full w-full pointer-events-none"
        aria-hidden
      >
        {items.flatMap((it, i) =>
          items.slice(i + 1).map((other, j) => (
            <motion.line
              key={`${i}-${j}`}
              x1={it.x}
              y1={it.y}
              x2={other.x}
              y2={other.y}
              stroke="currentColor"
              strokeWidth="1"
              strokeDasharray="3 6"
              className={toneStyles[it.tone].line}
              initial={{ pathLength: 0, opacity: 0 }}
              whileInView={{ pathLength: 1, opacity: 1 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{
                duration: 1.0,
                delay: 0.45 + (i + j) * 0.08,
                ease: "easeOut",
              }}
            />
          )),
        )}
      </svg>

      {items.map((it, i) => {
        const t = toneStyles[it.tone];
        return (
          <motion.div
            key={it.label}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: it.x, top: it.y }}
            initial={{ opacity: 0, scale: 0.4, y: 26 }}
            whileInView={{ opacity: 1, scale: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{
              duration: 0.7,
              delay: 0.2 + i * 0.18,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            <motion.div
              animate={reduced ? undefined : { y: [0, -it.drift, 0] }}
              transition={{
                duration: 4 + i * 0.7,
                repeat: Infinity,
                ease: "easeInOut",
                delay: i * 0.4,
              }}
              className="flex flex-col items-center"
            >
              <div
                className={cn(
                  "relative inline-flex items-center justify-center rounded-2xl border bg-background-card/80 backdrop-blur-sm",
                  t.border,
                  t.shadow,
                )}
                style={{ width: it.size, height: it.size }}
              >
                {it.kind === "image" ? (
                  <Image
                    src={it.src}
                    alt={it.label}
                    width={Math.round(it.size * 0.55)}
                    height={Math.round(it.size * 0.55)}
                    className="object-contain"
                  />
                ) : (
                  <span
                    className={cn(
                      "font-display font-black tracking-tight",
                      t.text,
                    )}
                    style={{ fontSize: Math.round(it.size * 0.32) }}
                  >
                    {it.label}
                  </span>
                )}
                {/* outer pinging ring */}
                <span
                  aria-hidden
                  className={cn(
                    "absolute -inset-1.5 rounded-2xl border opacity-25 animate-ping",
                    t.ring,
                  )}
                />
              </div>
              <span
                className={cn(
                  "mt-2 text-[9px] font-mono font-bold uppercase tracking-[0.2em]",
                  t.text,
                  "opacity-80",
                )}
              >
                {it.label}
              </span>
            </motion.div>
          </motion.div>
        );
      })}
    </div>
  );
}

/* ── Big project count ────────────────────────────────────────────────── */
function BigProjectCount({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-30px" });
  const reduced = useReducedMotion();
  const display = useMotionValue(0);
  const [shown, setShown] = useState("0");

  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setShown(String(count));
      return;
    }
    const controls = animate(display, count, {
      duration: 1.5,
      ease: "easeOut",
      onUpdate: (v) => setShown(Math.round(v).toString()),
    });
    return () => controls.stop();
  }, [inView, reduced, count, display]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-30px" }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className={cn("flex items-end gap-4", className)}
    >
      <span className="font-display font-black tabular-nums leading-[0.85] text-7xl sm:text-8xl xl:text-9xl text-gradient-nostr">
        {shown}
      </span>
      <div className="pb-2 sm:pb-3">
        <div className="text-[10px] font-mono font-bold uppercase tracking-[0.25em] text-nostr">
          Proyectos
        </div>
        <div className="mt-1 text-sm sm:text-base text-foreground-muted">
          construidos por la comunidad
        </div>
      </div>
    </motion.div>
  );
}

/* ── Project marquee ──────────────────────────────────────────────────── */
function ProjectMarquee({
  names,
  className,
}: {
  names: string[];
  className?: string;
}) {
  const reduced = useReducedMotion();
  // Quadruple to guarantee a wider-than-viewport row at any width — the
  // -50% shift loops seamlessly because each half is identical.
  const row = [...names, ...names, ...names, ...names];

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-nostr/25 bg-background-card/40 backdrop-blur-sm py-4",
        className,
      )}
    >
      {/* edge fades */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-background-card to-transparent z-10" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-background-card to-transparent z-10" />

      <motion.div
        className="flex gap-3 whitespace-nowrap"
        animate={reduced ? undefined : { x: ["0%", "-50%"] }}
        transition={{ duration: 27, repeat: Infinity, ease: "linear" }}
      >
        {row.map((name, i) => (
          <span
            key={`${name}-${i}`}
            className="inline-flex items-center gap-2 rounded-full border border-nostr/30 bg-nostr/[0.06] px-4 py-1.5 text-xs font-mono font-bold uppercase tracking-[0.18em] text-nostr/90 shrink-0"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-nostr animate-pulse" />
            {name}
          </span>
        ))}
      </motion.div>
    </div>
  );
}

/* ── Tech matrix (Tecnologías) ────────────────────────────────────────── */
type CloudLayout = { x: number; y: number; depth: 0 | 1 | 2; drift: number; delay: number };

// Hex-packed grid: 3-2-3 (rows offset by half a column)
const TECH_LAYOUT: CloudLayout[] = [
  // Row 1
  { x: 22, y: 22, depth: 1, drift: 6, delay: 0.0 },
  { x: 50, y: 22, depth: 1, drift: 7, delay: 0.05 },
  { x: 78, y: 22, depth: 1, drift: 6, delay: 0.1 },
  // Row 2 (offset)
  { x: 36, y: 50, depth: 1, drift: 5, delay: 0.15 },
  { x: 64, y: 50, depth: 1, drift: 8, delay: 0.2 },
  // Row 3
  { x: 22, y: 78, depth: 1, drift: 6, delay: 0.25 },
  { x: 50, y: 78, depth: 1, drift: 7, delay: 0.3 },
  { x: 78, y: 78, depth: 1, drift: 5, delay: 0.35 },
];

function TechMatrix({
  pillars,
  className,
}: {
  pillars: Pillar[];
  className?: string;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 60, damping: 20 });
  const sy = useSpring(my, { stiffness: 60, damping: 20 });

  const nodes = pillars.slice(0, TECH_LAYOUT.length).map((p, i) => ({
    ...p,
    ...TECH_LAYOUT[i],
  }));

  function handleMove(e: React.MouseEvent) {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width - 0.5);
    my.set((e.clientY - r.top) / r.height - 0.5);
  }

  function handleLeave() {
    mx.set(0);
    my.set(0);
  }

  return (
    <div
      ref={ref}
      onMouseMove={reduced ? undefined : handleMove}
      onMouseLeave={reduced ? undefined : handleLeave}
      className={cn(
        "relative w-full h-[460px] sm:h-[520px] rounded-3xl border border-cyan/25 overflow-hidden",
        className,
      )}
      style={{
        background:
          "radial-gradient(ellipse at 30% 30%, rgba(34,211,238,0.16) 0%, rgba(168,85,247,0.10) 35%, rgba(5,7,14,0.98) 75%)",
      }}
    >
      <MatrixBackground reduced={!!reduced} />
      <ConnectionLines nodes={nodes} sx={sx} sy={sy} />
      {nodes.map((node, i) => (
        <TechNode
          key={node.label}
          node={node}
          index={i}
          sx={sx}
          sy={sy}
          reduced={!!reduced}
        />
      ))}
      {/* vignette */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 55%, rgba(5,7,14,0.85) 100%)",
        }}
      />
    </div>
  );
}

// Background network of small nodes connected by faint lines, with neuron-like
// pulses on a subset to suggest constant signal traffic.
const BG_NODES = (() => {
  // Deterministic pseudo-random scatter so SSR matches client.
  const rng = mulberry32Local(7);
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < 28; i++) {
    out.push({ x: 4 + rng() * 92, y: 6 + rng() * 88 });
  }
  return out;
})();

function mulberry32Local(seed: number) {
  let t = seed;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const BG_LINKS: { a: number; b: number }[] = (() => {
  const out: { a: number; b: number }[] = [];
  for (let i = 0; i < BG_NODES.length; i++) {
    const distances = BG_NODES.map((m, j) => ({
      j,
      d: Math.hypot(BG_NODES[i].x - m.x, BG_NODES[i].y - m.y),
    }))
      .filter((m) => m.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, 3);
    distances.forEach(({ j }) => {
      const a = Math.min(i, j);
      const b = Math.max(i, j);
      if (!out.find((l) => l.a === a && l.b === b)) out.push({ a, b });
    });
  }
  return out;
})();

function MatrixBackground({ reduced }: { reduced: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* corner gradient blobs */}
      <motion.div
        aria-hidden
        className="absolute -top-24 -left-24 h-80 w-80 rounded-full bg-cyan/15 blur-3xl"
        animate={
          reduced ? undefined : { scale: [1, 1.15, 1], opacity: [0.35, 0.65, 0.35] }
        }
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-nostr/15 blur-3xl"
        animate={
          reduced ? undefined : { scale: [1, 1.15, 1], opacity: [0.3, 0.6, 0.3] }
        }
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
      />

      {/* network of small nodes + connecting lines */}
      <svg className="absolute inset-0 w-full h-full">
        {BG_LINKS.map((l, i) => (
          <line
            key={`bgl-${i}`}
            x1={`${BG_NODES[l.a].x}%`}
            y1={`${BG_NODES[l.a].y}%`}
            x2={`${BG_NODES[l.b].x}%`}
            y2={`${BG_NODES[l.b].y}%`}
            stroke="rgba(34,211,238,0.10)"
            strokeWidth="0.6"
          />
        ))}
        {BG_NODES.map((n, i) => (
          <motion.circle
            key={`bgn-${i}`}
            cx={`${n.x}%`}
            cy={`${n.y}%`}
            r="1.4"
            fill="rgba(34,211,238,0.55)"
            animate={
              reduced ? undefined : { opacity: [0.25, 0.85, 0.25] }
            }
            transition={{
              duration: 3 + (i % 4),
              repeat: Infinity,
              ease: "easeInOut",
              delay: (i * 0.17) % 4,
            }}
          />
        ))}
        {/* Subset of background pulses */}
        {BG_LINKS.filter((_, i) => i % 4 === 0).map((l, i) => (
          <NeuronPulse
            key={`bgp-${i}`}
            from={BG_NODES[l.a]}
            to={BG_NODES[l.b]}
            delay={(i * 0.7) % 6}
            reverse={i % 2 === 0}
          />
        ))}
      </svg>

      {/* slow horizontal scan line — reads as a neural sweep */}
      <motion.div
        aria-hidden
        className="absolute left-0 right-0 h-[1px]"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(34,211,238,0.6), rgba(168,85,247,0.6), transparent)",
        }}
        animate={reduced ? undefined : { y: ["0%", "100%", "0%"] }}
        transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

function ConnectionLines({
  nodes,
  sx,
  sy,
}: {
  nodes: (Pillar & CloudLayout)[];
  sx: MotionValue<number>;
  sy: MotionValue<number>;
}) {
  // Full mesh — every node connects to every other node
  const links: { a: number; b: number }[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      links.push({ a: i, b: j });
    }
  }

  // Subtle parallax for connections (less than nodes themselves)
  const tx = useTransform(sx, (v) => -v * 8);
  const ty = useTransform(sy, (v) => -v * 8);

  return (
    <motion.svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ x: tx, y: ty }}
    >
      {links.map((l, i) => {
        const a = nodes[l.a];
        const b = nodes[l.b];
        return (
          <motion.line
            key={`line-${i}`}
            x1={`${a.x}%`}
            y1={`${a.y}%`}
            x2={`${b.x}%`}
            y2={`${b.y}%`}
            stroke="currentColor"
            strokeWidth="0.8"
            strokeDasharray="3 6"
            className="text-cyan/20"
            initial={{ pathLength: 0, opacity: 0 }}
            whileInView={{ pathLength: 1, opacity: 1 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{
              duration: 1.2,
              delay: 0.3 + i * 0.03,
              ease: "easeOut",
            }}
          />
        );
      })}
      {/* Neuron-like signals travelling between nodes */}
      {links.map((l, i) => (
        <NeuronPulse
          key={`pulse-${i}`}
          from={nodes[l.a]}
          to={nodes[l.b]}
          delay={(i * 0.45) % 7}
          reverse={i % 3 === 0}
        />
      ))}
    </motion.svg>
  );
}

function NeuronPulse({
  from,
  to,
  delay,
  reverse,
}: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  delay: number;
  reverse: boolean;
}) {
  const t = useMotionValue(0);
  const a = reverse ? to : from;
  const b = reverse ? from : to;

  useEffect(() => {
    const controls = animate(t, 1, {
      duration: 1.8,
      delay,
      ease: "easeInOut",
      repeat: Infinity,
      repeatDelay: 4 + (delay % 3),
    });
    return () => controls.stop();
  }, [t, delay]);

  const cx = useTransform(t, (v) => `${a.x + (b.x - a.x) * v}%`);
  const cy = useTransform(t, (v) => `${a.y + (b.y - a.y) * v}%`);
  const opacity = useTransform(t, [0, 0.1, 0.85, 1], [0, 1, 1, 0]);

  return (
    <motion.circle
      cx={cx}
      cy={cy}
      r="3"
      fill="rgba(34,211,238,0.95)"
      style={{
        opacity,
        filter: "drop-shadow(0 0 6px rgba(34,211,238,0.95))",
      }}
    />
  );
}

function TechNode({
  node,
  index,
  sx,
  sy,
  reduced,
}: {
  node: Pillar & CloudLayout;
  index: number;
  sx: MotionValue<number>;
  sy: MotionValue<number>;
  reduced: boolean;
}) {
  // Uniform parallax for the hex grid
  const depthFactor = 30;
  const tx = useTransform(sx, (v) => -v * depthFactor);
  const ty = useTransform(sy, (v) => -v * depthFactor);

  const baseScale = 1;
  const blur = 0;
  const targetOpacity = 1;
  const sizePx = 68;

  return (
    <motion.div
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{
        left: `${node.x}%`,
        top: `${node.y}%`,
        x: tx,
        y: ty,
        filter: `blur(${blur}px)`,
      }}
      initial={{ opacity: 0, scale: 0.4 }}
      whileInView={{ opacity: targetOpacity, scale: 1 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{
        duration: 0.7,
        delay: node.delay,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      <motion.div
        animate={reduced ? undefined : { y: [0, -node.drift, 0] }}
        transition={{
          duration: 4 + index * 0.4,
          repeat: Infinity,
          ease: "easeInOut",
          delay: index * 0.3,
        }}
        whileHover={{ scale: baseScale * 1.18 }}
        style={{ scale: baseScale }}
        className="flex flex-col items-center gap-2 group cursor-pointer"
      >
        <div
          className="relative inline-flex items-center justify-center rounded-full border border-cyan/45 bg-background-card/85 backdrop-blur-sm shadow-[0_0_28px_rgba(34,211,238,0.32)] group-hover:shadow-[0_0_55px_rgba(34,211,238,0.7)] group-hover:border-cyan/80 transition-all"
          style={{ width: sizePx, height: sizePx }}
        >
          <Image
            src={node.src}
            alt={node.label}
            width={Math.round(sizePx * 0.55)}
            height={Math.round(sizePx * 0.55)}
            className="object-contain"
          />
          <span
            aria-hidden
            className="absolute -inset-1.5 rounded-full border border-cyan/45 opacity-0 group-hover:opacity-100 animate-ping transition-opacity"
          />
        </div>
        <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-cyan/85 whitespace-nowrap">
          {node.label}
        </span>
      </motion.div>
    </motion.div>
  );
}
