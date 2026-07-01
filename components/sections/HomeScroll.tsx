"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
    stats: [
      { value: 48, label: "Proyectos concursados" },
      { value: 4, label: "Hackatones" },
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
    href: "/infra",
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
  const [index, setIndex] = useState(0);
  const swipeStartX = useRef<number | null>(null);

  const go = useCallback(
    (i: number) => setIndex(Math.max(0, Math.min(N - 1, i))),
    [],
  );

  return (
    <section
      className="relative overflow-hidden bg-[#05070e]"
      aria-roledescription="carrusel"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") go(index - 1);
        else if (e.key === "ArrowRight") go(index + 1);
      }}
    >
      {/* Ambient glow tinted by the active section */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        {SECTIONS.map((s, i) => (
          <div
            key={s.id}
            className={cn(
              "absolute inset-0 blur-[170px] transition-opacity duration-700",
              i === index ? "opacity-[0.13]" : "opacity-0",
              i === 0 && "bg-bitcoin",
              i === 1 && "bg-nostr",
              i === 2 && "bg-cyan",
            )}
          />
        ))}
      </div>

      <div
        className="relative overflow-hidden"
        onPointerDown={(e) => {
          swipeStartX.current = e.clientX;
        }}
        onPointerUp={(e) => {
          const start = swipeStartX.current;
          swipeStartX.current = null;
          if (start == null) return;
          const dx = e.clientX - start;
          if (dx < -50 && index < N - 1) go(index + 1);
          else if (dx > 50 && index > 0) go(index - 1);
        }}
      >
        <div
          className="flex transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{
            width: `${N * 100}%`,
            transform: `translateX(-${(100 / N) * index}%)`,
          }}
        >
          {SECTIONS.map((s, i) => (
            <div
              key={s.id}
              className="shrink-0"
              style={{ width: `${100 / N}%` }}
              aria-hidden={i !== index}
            >
              <SlidePanel section={s} />
            </div>
          ))}
        </div>

        {/* Arrows */}
        <button
          type="button"
          onClick={() => go(index - 1)}
          disabled={index === 0}
          aria-label="Sección anterior"
          className="absolute left-3 top-1/2 z-20 hidden -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background-card/70 p-2.5 text-foreground-muted backdrop-blur-sm transition-colors hover:border-border-strong hover:text-foreground disabled:pointer-events-none disabled:opacity-0 sm:flex lg:left-6"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <button
          type="button"
          onClick={() => go(index + 1)}
          disabled={index === N - 1}
          aria-label="Sección siguiente"
          className="absolute right-3 top-1/2 z-20 hidden -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background-card/70 p-2.5 text-foreground-muted backdrop-blur-sm transition-colors hover:border-border-strong hover:text-foreground disabled:pointer-events-none disabled:opacity-0 sm:flex lg:right-6"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      </div>

      {/* Dots */}
      <div className="flex items-center justify-center gap-3 pb-12 pt-2">
        {SECTIONS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => go(i)}
            aria-label={`Ir a ${s.label}`}
            aria-current={i === index}
            className="group py-2"
          >
            <span
              className={cn(
                "block h-2.5 rounded-full transition-all duration-300",
                i === index
                  ? cn("w-8", s.dotBgClass)
                  : "w-2.5 bg-foreground-subtle/40 group-hover:bg-foreground-subtle",
              )}
            />
          </button>
        ))}
      </div>
    </section>
  );
}

/* ── Slide panel ──────────────────────────────────────────────────────── */
function SlidePanel({ section }: { section: Section }) {
  const Icon = section.icon;
  return (
    <div className="relative flex h-[86vh] min-h-[600px] max-h-[940px] flex-col justify-center overflow-hidden px-6 sm:px-12 lg:px-20">
      <div
        className={cn(
          "relative z-10 mx-auto w-full",
          section.id === "tech" ? "max-w-4xl" : "max-w-2xl lg:max-w-3xl",
        )}
      >
        {/* Number + icon */}
        <div className="mb-6 flex items-center gap-3">
          <span
            className={cn(
              "text-[11px] font-mono uppercase tracking-[0.2em]",
              section.colorClass,
            )}
          >
            {section.number} / 0{N}
          </span>
          <div
            className={cn(
              "rounded-xl border p-2",
              section.bgClass,
              section.borderClass,
            )}
          >
            <Icon className={cn("h-4 w-4", section.colorClass)} />
          </div>
        </div>

        <h2 className="mb-4 font-display text-4xl font-bold leading-[0.95] tracking-tight sm:text-5xl lg:text-6xl">
          {section.label}
        </h2>

        {section.description && (
          <p className="mb-8 max-w-2xl text-base leading-relaxed text-foreground-muted sm:text-lg">
            {section.description}
          </p>
        )}

        {section.id === "projects" && (
          <BigProjectCount count={PROJECTS.length} className="mb-8" />
        )}

        {section.pillars ? (
          <TechMatrix pillars={section.pillars} className="mb-8" />
        ) : (
          <ul className="mb-8 space-y-3.5">
            {section.features?.map((f, fi) => {
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
                      "mt-0.5 shrink-0 rounded-lg border p-1.5",
                      section.bgClass,
                      section.borderClass,
                    )}
                  >
                    <FIcon className={cn("h-3.5 w-3.5", section.colorClass)} />
                  </span>
                  <div>
                    <div className="text-sm font-semibold sm:text-base">
                      {f.title}
                    </div>
                    {f.description && (
                      <div className="mt-0.5 text-sm text-foreground-muted">
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
            className="mb-8 max-w-md"
          />
        )}

        {section.id === "projects" && (
          <ProjectMarquee names={PROJECTS.map((p) => p.name)} className="mb-8" />
        )}

        <Link
          href={section.href}
          className={cn(
            "group inline-flex w-fit items-center gap-3 rounded-2xl border-2 px-7 py-4 font-display text-lg font-black uppercase tracking-wide transition-all hover:scale-[1.04] active:scale-[0.97] sm:text-xl",
            section.bgClass,
            section.borderClass,
            section.colorClass,
          )}
        >
          {section.cta}
          <ArrowRight className="h-6 w-6 transition-transform group-hover:translate-x-1" />
        </Link>
      </div>
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
  const reduced = useReducedMotion();
  const t = useMotionValue(0);
  const a = reverse ? to : from;
  const b = reverse ? from : to;

  useEffect(() => {
    if (reduced) return;
    const controls = animate(t, 1, {
      duration: 1.8,
      delay,
      ease: "easeInOut",
      repeat: Infinity,
      repeatDelay: 4 + (delay % 3),
    });
    return () => controls.stop();
  }, [t, delay, reduced]);

  const cx = useTransform(t, (v) => `${a.x + (b.x - a.x) * v}%`);
  const cy = useTransform(t, (v) => `${a.y + (b.y - a.y) * v}%`);
  const opacity = useTransform(t, [0, 0.1, 0.85, 1], [0, 1, 1, 0]);

  // Reduced motion: render the pulse at rest on its midpoint, faded
  // out, so the SVG composition stays balanced without continuous
  // motion.
  if (reduced) return null;

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
