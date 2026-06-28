import type { Metadata } from "next";
import {
  Calendar,
  Zap,
  Trophy,
  CirclePlay,
  Sparkles,
} from "lucide-react";
import PageHero from "@/components/ui/PageHero";
import {
  HACKATHONS,
  PROGRAM,
  formatSats,
  hackathonSlug,
  hackathonStatus,
  isHackathonInscriptionOpen,
} from "@/lib/hackathons";
import { cn } from "@/lib/cn";
import HackathonTimeline, {
  type TimelineHackathon,
} from "@/app/hackathons/HackathonTimeline";

export const metadata: Metadata = {
  title: "Hackatones",
  description:
    "Lightning Hackathons 2026 — 8 hackatones mensuales, 8M sats en premios. Bitcoin, Lightning, Nostr.",
};

function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

/** Spanish copy that describes when a future hackathon kicks off. Returns
 *  null when the kickoff date is missing or already past. */
function startsInLabel(startISO: string, now: Date): string | null {
  if (!startISO) return null;
  const start = new Date(`${startISO}T00:00:00`);
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const days = daysBetween(today, start);
  if (days < 0) return null;
  if (days === 0) return "Empieza hoy";
  if (days === 1) return "Empieza mañana";
  if (days <= 14) return `Empieza en ${days} días`;
  if (days <= 60) {
    const weeks = Math.round(days / 7);
    return `Empieza en ${weeks} ${weeks === 1 ? "semana" : "semanas"}`;
  }
  return `Empieza en ${Math.round(days / 30)} meses`;
}

/** Builds the serializable timeline payload + the index of the "current"
 *  hackathon (active, else soonest upcoming, else the last one) and the
 *  fraction of the program that has already elapsed (0–100), so the rail can
 *  draw a "today" marker even between two hackathons. */
function buildTimeline(now: Date): {
  items: TimelineHackathon[];
  initialIndex: number;
  todayPct: number;
} {
  const ordered = [...HACKATHONS].sort((a, b) => a.number - b.number);
  const n = ordered.length;
  const today = now.toISOString().slice(0, 10);

  const items: TimelineHackathon[] = ordered.map((h) => {
    const status = hackathonStatus(h, now);
    // Sort dates to match hackathonStatus()/isHackathonInscriptionOpen(), which
    // normalize ordering — keeps every timeline calc on the same boundaries.
    const sortedDates = [...h.dates].sort((a, b) => a.date.localeCompare(b.date));
    const firstISO = sortedDates[0]?.date ?? null;
    const lastISO = sortedDates[sortedDates.length - 1]?.date ?? null;
    return {
      id: h.id,
      slug: hackathonSlug(h),
      number: h.number,
      name: h.name,
      focus: h.focus,
      description: h.description,
      difficulty: h.difficulty,
      stars: h.stars,
      month: h.month,
      monthShort: h.monthShort,
      year: h.year,
      icon: h.icon,
      tags: h.tags,
      topics: h.topics,
      firstDay: firstISO ? firstISO.slice(8, 10) : null,
      lastDay: lastISO ? lastISO.slice(8, 10) : null,
      status,
      inscriptionOpen: isHackathonInscriptionOpen(h, now),
      countdown: status === "upcoming" && firstISO ? startsInLabel(firstISO, now) : null,
      sponsors: (h.sponsors ?? []).map((s) => ({ name: s.name, logo: s.logo })),
    };
  });

  const activeIdx = items.findIndex((x) => x.status === "active");
  const firstUpcomingIdx = items.findIndex((x) => x.status === "upcoming");
  const initialIndex =
    activeIdx >= 0 ? activeIdx : firstUpcomingIdx >= 0 ? firstUpcomingIdx : n - 1;

  // Elapsed fraction: closed nodes count as fully done; the active one is
  // interpolated across its own date span. Each node owns a 1/n slice.
  let todayPct: number;
  if (activeIdx >= 0) {
    const h = ordered[activeIdx];
    const sorted = [...h.dates].sort((a, b) => a.date.localeCompare(b.date));
    const first = sorted[0]?.date ?? today;
    const last = sorted[sorted.length - 1]?.date ?? today;
    const span = new Date(last).getTime() - new Date(first).getTime();
    const into = new Date(today).getTime() - new Date(first).getTime();
    const f = span > 0 ? Math.min(1, Math.max(0, into / span)) : 0.5;
    todayPct = ((activeIdx + f) / n) * 100;
  } else {
    const closedCount = items.filter((x) => x.status === "closed").length;
    todayPct = (closedCount / n) * 100;
  }

  return { items, initialIndex, todayPct: Math.min(100, Math.max(0, todayPct)) };
}

export default async function HackathonsPage() {
  "use cache";
  const now = new Date();
  const { items, initialIndex, todayPct } = buildTimeline(now);

  return (
    <>
      <PageHero
        eyebrow="LIGHTNING HACKATHONS 2026"
        eyebrowIcon={<Zap className="h-3 w-3" />}
        title={
          <>
            8 hackatones ·{" "}
            <span className="text-gradient-bitcoin">
              {formatSats(PROGRAM.totalPrize)} sats
            </span>{" "}
            en premios
          </>
        }
      />

      <section className="py-10 sm:py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
            <StatTile
              icon={<Trophy className="h-4 w-4" />}
              label="Premio total"
              value={`${formatSats(PROGRAM.totalPrize)} sats`}
              accent="text-bitcoin"
            />
            <StatTile
              icon={<Zap className="h-4 w-4" />}
              label="Por hackatón"
              value={`${formatSats(PROGRAM.prizePerHackathon)} sats`}
              accent="text-lightning"
            />
            <StatTile
              icon={<Calendar className="h-4 w-4" />}
              label="Hackatones"
              value={String(HACKATHONS.length)}
              accent="text-cyan"
            />
            <StatTile
              icon={<Sparkles className="h-4 w-4" />}
              label="Primer puesto"
              value={`${formatSats(PROGRAM.prizeDistribution[0]?.sats ?? 0)} sats`}
              accent="text-nostr"
            />
          </div>

          {/* Timeline: navigable past → present → future. */}
          <div className="mb-4 flex items-baseline gap-3">
            <span className="text-[10px] font-mono font-semibold tracking-widest uppercase text-bitcoin">
              Línea de tiempo
            </span>
            <span className="h-px flex-1 bg-gradient-to-r from-border via-border/50 to-transparent" />
            <h3 className="text-sm font-mono text-foreground-muted">
              Marzo → Octubre 2026
            </h3>
          </div>
          <HackathonTimeline
            items={items}
            initialIndex={initialIndex}
            todayPct={todayPct}
          />

          {/* Prize structure */}
          <div className="mt-14 rounded-2xl border border-border bg-background-card p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row gap-6">
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-mono tracking-widest text-foreground-subtle mb-2">
                  ESTRUCTURA DE PREMIOS · POR HACKATÓN
                </div>
                <h3 className="font-display text-xl font-bold mb-1">
                  {formatSats(PROGRAM.prizePerHackathon)} sats repartidos entre
                  los mejores 6 proyectos
                </h3>
                <p className="text-sm text-foreground-muted">
                  Evaluación por jurado AI. Ties se parten según criterio del
                  comité.
                </p>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 self-stretch">
                {PROGRAM.prizeDistribution.map((slot) => (
                  <div
                    key={slot.position}
                    className="rounded-xl border border-border bg-background-elevated/50 p-3 flex flex-col items-center justify-center text-center"
                  >
                    <div className="text-xs font-mono text-foreground-subtle">
                      {slot.position}°
                    </div>
                    <div className="text-sm font-display font-bold tabular-nums mt-1">
                      {formatSats(slot.sats)}
                    </div>
                    <div className="text-[9px] font-mono text-foreground-subtle">
                      sats
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {PROGRAM.youtube && (
              <a
                href={PROGRAM.youtube}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-flex items-center gap-2 text-sm text-foreground-muted hover:text-foreground transition-colors"
              >
                <CirclePlay className="h-4 w-4" />
                Mirá las Community Calls en {PROGRAM.organization} YouTube
              </a>
            )}
          </div>
        </div>
      </section>

      <PilaresSection />
    </>
  );
}

function StatTile({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-background-card p-4">
      <div
        className={cn(
          "inline-flex items-center gap-1 text-[10px] font-mono tracking-widest mb-2",
          accent,
        )}
      >
        {icon}
        {label}
      </div>
      <div className="font-display text-xl font-bold tracking-tight">
        {value}
      </div>
    </div>
  );
}

const PILARES: ReadonlyArray<{
  name: string;
  tag: string;
  description: string;
  image: string;
}> = [
  {
    name: "Lightning",
    tag: "Bitcoin orgánico",
    description:
      "Bitcoin nativo para pagos instantáneos. Sin tokens, sin intermediarios. Solo BTC moviéndose a la velocidad de la luz.",
    image: "/pilares/lightning.svg",
  },
  {
    name: "Nostr",
    tag: "Hermano de Bitcoin",
    description:
      "Nació del mismo espíritu cypherpunk. Comunicación descentralizada, identidad soberana y social sin censura.",
    image: "/pilares/nostr.svg",
  },
  {
    name: "Liquid",
    tag: "Optimizador L2",
    description:
      "Sidechain federada que optimiza Bitcoin como medio de intercambio. Transacciones confidenciales y rápidas.",
    image: "/pilares/liquid.svg",
  },
  {
    name: "RSK",
    tag: "Ethereum killer",
    description:
      "Smart contracts con la seguridad de Bitcoin. Todo lo que Ethereum promete, sobre la red más robusta del mundo.",
    image: "/pilares/rsk.jpg",
  },
  {
    name: "Ark",
    tag: "Optimizador L1",
    description:
      "Optimiza transacciones directamente sobre la capa base. Pagos off-chain sin comprometer la soberanía de L1.",
    image: "/pilares/ark.png",
  },
  {
    name: "Spark",
    tag: "L2 nativo",
    description:
      "L2 de Bitcoin sin bridges ni wrappers. Pagos instantáneos y stablecoins nativos, interoperable con Lightning.",
    image: "/pilares/spark.svg",
  },
  {
    name: "RGB",
    tag: "Stablecoins en Bitcoin",
    description:
      "Smart contracts y emisión de stablecoins sobre Bitcoin y Lightning. Programabilidad sin comprometer privacidad.",
    image: "/pilares/rgb.svg",
  },
  {
    name: "Taproot Assets",
    tag: "Stablecoins federados",
    description:
      "Emisión jerárquica de activos y stablecoins sobre Bitcoin y Lightning. Modelo federado de confianza.",
    image: "/pilares/taproot-assets.png",
  },
];

/** Sits at the bottom of the page on a tinted "elevated" background so it
 *  visually separates from the main hackathon listing. Cards intentionally
 *  use a horizontal icon-then-content layout (instead of the vertical
 *  layout used by HackathonCard / FeaturedHackathon) so the section reads
 *  as supporting context, not as another list of clickable hackathons. */
function PilaresSection() {
  return (
    <section className="relative overflow-hidden border-t border-border bg-[radial-gradient(ellipse_at_top,_rgba(247,147,26,0.10),_transparent_55%),radial-gradient(ellipse_at_bottom,_rgba(168,85,247,0.10),_transparent_55%),linear-gradient(180deg,#0c1024_0%,#0a0d1a_100%)]">
      {/* Subtle ambient glows so the section doesn't read as a flat block. */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-1/4 h-72 w-72 rounded-full bg-bitcoin/[0.10] blur-3xl" />
        <div className="absolute -bottom-24 right-1/4 h-72 w-72 rounded-full bg-nostr/[0.10] blur-3xl" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 h-px w-full max-w-3xl bg-gradient-to-r from-transparent via-bitcoin/60 to-transparent" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <div className="max-w-2xl mb-12">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-mono font-semibold tracking-widest text-bitcoin uppercase">
            <Sparkles className="h-3 w-3" />
            Nuestro enfoque
          </span>
          <h2 className="mt-3 font-display text-3xl sm:text-4xl font-bold tracking-tight">
            Bitcoin como medio de intercambio
          </h2>
          <p className="mt-3 text-foreground-muted leading-relaxed">
            Onchain es reserva de valor. Nosotros optimizamos las transacciones.
            Cada hackatón permite construir con cualquiera de estas tecnologías.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
          {PILARES.map((p) => (
            <PilarCard key={p.name} pilar={p} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PilarCard({
  pilar,
}: {
  pilar: (typeof PILARES)[number];
}) {
  return (
    <div className="group relative flex gap-4 p-4 sm:p-5 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
      <div className="absolute left-0 top-4 bottom-4 w-px bg-gradient-to-b from-bitcoin/0 via-bitcoin/40 to-bitcoin/0 opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="h-12 w-12 sm:h-14 sm:w-14 shrink-0 rounded-xl bg-background-card flex items-center justify-center overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={pilar.image}
          alt={pilar.name}
          className="h-8 w-8 sm:h-9 sm:w-9 object-contain"
          loading="lazy"
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <h3 className="font-display text-lg font-bold tracking-tight">
            {pilar.name}
          </h3>
          <span className="text-[10px] font-mono font-semibold uppercase tracking-widest text-bitcoin/80">
            {pilar.tag}
          </span>
        </div>
        <p className="mt-1.5 text-sm text-foreground-muted leading-relaxed">
          {pilar.description}
        </p>
      </div>
    </div>
  );
}
