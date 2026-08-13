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
import { HACKATHONS } from "@/lib/hackathons";

type Feature = {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
};

type Pillar = {
  src: string;
  label: string;
};

type Section = {
  id: string;
  number: string;
  label: string;
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
  stats?: { value: string; label: string }[];
  showProjectCount?: boolean;
  showMarquee?: boolean;
};

const SECTIONS: Section[] = [
  {
    id: "hackathons",
    number: "01",
    label: "Hackatones",
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
      { value: `${PROJECTS.length}+`, label: "Proyectos concursados" },
      { value: String(HACKATHONS.length), label: "Hackatones" },
    ],
  },
  {
    id: "projects",
    number: "02",
    label: "Proyectos",
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
    showProjectCount: true,
    showMarquee: true,
  },
  {
    id: "tech",
    number: "03",
    label: "Tecnologías",
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

export default function HomeScroll() {
  return (
    <section className="relative overflow-hidden bg-[#05070e]">
      <div className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth">
        {SECTIONS.map((section) => (
          <div
            key={section.id}
            id={`home-${section.id}`}
            className="w-full shrink-0 snap-start"
          >
            <SlidePanel section={section} />
          </div>
        ))}
      </div>
      <nav
        className="flex items-center justify-center gap-3 pb-12 pt-2"
        aria-label="Secciones"
      >
        {SECTIONS.map((section) => (
          <a
            key={section.id}
            href={`#home-${section.id}`}
            aria-label={`Ir a ${section.label}`}
            className="group flex min-h-11 min-w-11 items-center justify-center"
          >
            <span
              className={cn(
                "block h-2.5 w-2.5 rounded-full transition-colors",
                section.dotBgClass,
                "opacity-40 group-hover:opacity-100",
              )}
            />
          </a>
        ))}
      </nav>
    </section>
  );
}

function SlidePanel({ section }: { section: Section }) {
  const Icon = section.icon;
  return (
    <div className="relative flex min-h-[600px] h-[86vh] max-h-[940px] flex-col justify-center overflow-hidden px-6 sm:px-12 lg:px-20">
      <div
        className={cn(
          "relative z-10 mx-auto w-full",
          section.id === "tech" ? "max-w-4xl" : "max-w-2xl lg:max-w-3xl",
        )}
      >
        <div className="mb-6 flex items-center gap-3">
          <span
            className={cn(
              "text-[11px] font-mono uppercase tracking-[0.2em]",
              section.colorClass,
            )}
          >
            {section.number} / 0{SECTIONS.length}
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
          <p className="mb-6 max-w-2xl text-base leading-relaxed text-foreground-muted sm:text-lg">
            {section.description}
          </p>
        )}

        {section.showProjectCount && (
          <div className="mb-8 flex items-end gap-4">
            <span className="font-display font-black tabular-nums leading-[0.85] text-7xl sm:text-8xl xl:text-9xl text-gradient-nostr">
              {PROJECTS.length}
            </span>
            <div className="pb-2 sm:pb-3">
              <div className="text-[10px] font-mono font-bold uppercase tracking-[0.25em] text-nostr">
                Proyectos
              </div>
              <div className="mt-1 text-sm sm:text-base text-foreground-muted">
                construidos por la comunidad
              </div>
            </div>
          </div>
        )}

        {section.pillars ? (
          <ul className="mb-6 grid grid-cols-4 gap-3 sm:gap-4">
            {section.pillars.map((pillar) => (
              <li
                key={pillar.label}
                className="flex flex-col items-center gap-2 rounded-2xl border border-cyan/25 bg-background-card/40 px-2 py-3"
              >
                <Image
                  src={pillar.src}
                  alt=""
                  width={40}
                  height={40}
                  className="h-10 w-10 object-contain"
                />
                <span className="text-[10px] font-mono uppercase tracking-wider text-foreground-muted text-center">
                  {pillar.label}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="mb-8 space-y-3.5">
            {section.features?.map((feature) => {
              const FIcon = feature.icon;
              return (
                <li key={feature.title} className="flex items-start gap-3">
                  <span
                    className={cn(
                      "mt-0.5 shrink-0 rounded-lg border p-1.5",
                      section.bgClass,
                      section.borderClass,
                    )}
                  >
                    <FIcon className={cn("h-3.5 w-3.5", section.colorClass)} />
                  </span>
                  <div className="text-sm font-semibold sm:text-base">
                    {feature.title}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {section.stats && (
          <div className="mb-8 grid max-w-md grid-cols-2 gap-3 sm:gap-4">
            {section.stats.map((stat) => (
              <div
                key={stat.label}
                className={cn(
                  "relative overflow-hidden rounded-2xl border bg-background-card/40 px-4 py-3.5",
                  section.borderClass,
                )}
              >
                <div className="font-display text-3xl font-black tracking-tight tabular-nums leading-none">
                  {stat.value}
                </div>
                <div className="mt-1.5 text-[10px] font-mono uppercase tracking-[0.18em] text-foreground-muted">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        )}

        {section.showMarquee && (
          <div className="relative mb-8 overflow-hidden rounded-2xl border border-nostr/25 bg-background-card/40 py-4">
            <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-background-card to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-background-card to-transparent" />
            <div className="flex w-max gap-3 whitespace-nowrap animate-marquee">
              {[...PROJECTS, ...PROJECTS].map((project, i) => (
                <span
                  key={`${project.id}-${i}`}
                  className="inline-flex shrink-0 items-center gap-2 rounded-full border border-nostr/30 bg-nostr/[0.06] px-4 py-1.5 text-xs font-mono font-bold uppercase tracking-[0.18em] text-nostr"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-nostr" />
                  {project.name}
                </span>
              ))}
            </div>
          </div>
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
