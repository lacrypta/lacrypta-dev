import type { Metadata } from "next";
import Link from "next/link";
import {
  Calendar,
  Zap,
  Trophy,
  CirclePlay,
  ArrowRight,
  Sparkles,
  Radio,
  Flame,
  Clock,
} from "lucide-react";
import PageHero from "@/components/ui/PageHero";
import {
  HACKATHONS,
  PROGRAM,
  formatSats,
  hackathonStatus,
} from "@/lib/hackathons";
import { cn } from "@/lib/cn";
import HackathonInscripcionButton from "@/components/HackathonInscripcionButton";

export const metadata: Metadata = {
  title: "Hackatones",
  description:
    "Lightning Hackathons 2026 — 8 hackatones mensuales, 8M sats en premios. Bitcoin, Lightning, Nostr.",
};

const DIFFICULTY_STYLE: Record<string, string> = {
  Beginner: "bg-success/10 text-success border-success/30",
  Intermediate: "bg-cyan/10 text-cyan border-cyan/30",
  Advanced: "bg-nostr/10 text-nostr border-nostr/30",
  Expert: "bg-bitcoin/10 text-bitcoin border-bitcoin/30",
};

const STATUS_STYLE: Record<
  "upcoming" | "active" | "closed",
  { label: string; className: string }
> = {
  upcoming: {
    label: "PRÓXIMO",
    className: "bg-white/5 text-foreground-muted border-border",
  },
  active: {
    label: "EN CURSO",
    className: "bg-success/10 text-success border-success/30",
  },
  closed: {
    label: "CERRADO",
    className: "bg-bitcoin/10 text-bitcoin border-bitcoin/30",
  },
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

export default async function HackathonsPage() {
  "use cache";
  const now = new Date();
  const withStatus = HACKATHONS.map((h) => ({
    h,
    status: hackathonStatus(h, now),
  }));
  const active = withStatus.filter((x) => x.status === "active");
  const upcoming = withStatus
    .filter((x) => x.status === "upcoming")
    .sort((a, b) =>
      (a.h.dates[0]?.date ?? "").localeCompare(b.h.dates[0]?.date ?? ""),
    );
  const closed = withStatus.filter((x) => x.status === "closed");

  // Pick the spotlight card: an active hackathon if any, else the soonest
  // upcoming. The remaining upcoming entries fall into the secondary grid.
  const featured = active[0] ?? upcoming[0] ?? null;
  const otherUpcoming =
    featured && featured.status === "upcoming" ? upcoming.slice(1) : upcoming;

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
        description={`Un hackatón por mes hasta octubre, organizado por ${PROGRAM.organization}. De Lightning básico hasta apps full-stack. Participá solo o en equipo (máx. 4 personas).`}
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

          {/* Spotlight: active hackathon, or the next upcoming one. */}
          {featured && (
            <FeaturedHackathon
              h={featured.h}
              status={featured.status}
              now={now}
            />
          )}

          {/* Other upcoming */}
          {otherUpcoming.length > 0 && (
            <div className="mt-12">
              <SectionHeading
                eyebrow="Próximos"
                title="Lo que viene"
                accent="text-cyan"
              />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {otherUpcoming.map(({ h, status }) => (
                  <HackathonCard key={h.id} h={h} status={status} />
                ))}
              </div>
            </div>
          )}

          {/* Closed */}
          {closed.length > 0 && (
            <div className="mt-12">
              <SectionHeading
                eyebrow="Anteriores"
                title="Hackatones realizados"
                accent="text-foreground-subtle"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 opacity-70 hover:opacity-100 transition-opacity">
                {closed.map(({ h, status }) => (
                  <HackathonCard key={h.id} h={h} status={status} compact />
                ))}
              </div>
            </div>
          )}

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

function SectionHeading({
  eyebrow,
  title,
  accent,
}: {
  eyebrow: string;
  title: string;
  accent: string;
}) {
  return (
    <div className="mb-5 flex items-baseline gap-3">
      <span
        className={cn(
          "text-[10px] font-mono font-semibold tracking-widest uppercase",
          accent,
        )}
      >
        {eyebrow}
      </span>
      <span className="h-px flex-1 bg-gradient-to-r from-border via-border/50 to-transparent" />
      <h3 className="text-sm font-mono text-foreground-muted">{title}</h3>
    </div>
  );
}

/** The big hero-style card for the active or soonest-upcoming hackathon.
 *  Active state uses success-green; upcoming uses bitcoin-orange with a
 *  countdown badge so the next event always feels alive. */
function FeaturedHackathon({
  h,
  status,
  now,
}: {
  h: (typeof HACKATHONS)[number];
  status: "upcoming" | "active" | "closed";
  now: Date;
}) {
  const firstDate = h.dates[0]?.date;
  const lastDate = h.dates[h.dates.length - 1]?.date;
  const isActive = status === "active";
  const countdown = !isActive && firstDate ? startsInLabel(firstDate, now) : null;

  const accent = isActive
    ? {
        ring: "border-success/40 hover:border-success/60",
        glow: "shadow-[0_0_60px_-12px_rgba(34,197,94,0.35)] hover:shadow-[0_0_90px_-8px_rgba(34,197,94,0.5)]",
        gradient: "from-success/[0.10] via-transparent to-bitcoin/[0.05]",
        eyebrow: "text-success",
        eyebrowIcon: <Radio className="h-3.5 w-3.5 animate-pulse" />,
        eyebrowLabel: "Hackatón en curso",
        badge: "border-success/30 bg-success/10 text-success",
        badgeLabel: "● EN CURSO",
      }
    : {
        ring: "border-bitcoin/40 hover:border-bitcoin/60",
        glow: "shadow-[0_0_60px_-12px_rgba(247,147,26,0.45)] hover:shadow-[0_0_100px_-8px_rgba(247,147,26,0.6)]",
        gradient: "from-bitcoin/[0.10] via-transparent to-nostr/[0.06]",
        eyebrow: "text-bitcoin",
        eyebrowIcon: <Flame className="h-3.5 w-3.5" />,
        eyebrowLabel: "Próximo hackatón",
        badge: "border-bitcoin/30 bg-bitcoin/10 text-bitcoin",
        badgeLabel: countdown ?? "PRÓXIMO",
      };

  return (
    <div className="relative">
      <div className="flex items-center gap-2 mb-3">
        <span className={cn("inline-flex items-center", accent.eyebrow)}>
          {accent.eyebrowIcon}
        </span>
        <span
          className={cn(
            "text-xs font-mono font-semibold tracking-widest uppercase",
            accent.eyebrow,
          )}
        >
          {accent.eyebrowLabel}
        </span>
        <span className="h-px flex-1 bg-gradient-to-r from-border via-border/30 to-transparent" />
      </div>

      <Link
        href={`/hackathons/${h.id}`}
        className={cn(
          "group relative block overflow-hidden rounded-3xl border bg-background-card transition-all",
          accent.ring,
          accent.glow,
        )}
      >
        {/* Decorative aurora glow that sits behind the content. */}
        <div className="pointer-events-none absolute inset-0">
          <div
            className={cn(
              "absolute inset-0 bg-gradient-to-br",
              accent.gradient,
            )}
          />
          <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-bitcoin/10 blur-3xl opacity-40 aurora" />
          <div
            className="absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-nostr/10 blur-3xl opacity-30 aurora"
            style={{ animationDelay: "-10s" }}
          />
        </div>

        <div className="relative p-6 sm:p-10 grid gap-6 sm:grid-cols-[1fr_auto] items-start">
          <div className="min-w-0 flex flex-col gap-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-mono tracking-widest text-foreground-subtle">
                #{String(h.number).padStart(2, "0")}
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-mono font-semibold tracking-widest uppercase",
                  accent.badge,
                  isActive && "animate-pulse",
                )}
              >
                {accent.badgeLabel}
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-mono text-foreground-subtle">
                <Calendar className="h-3 w-3" />
                {h.month} {h.year}
                {firstDate && lastDate && (
                  <span>
                    · {firstDate.slice(8, 10)}–{lastDate.slice(8, 10)}
                  </span>
                )}
              </span>
            </div>

            <div>
              <h2 className="font-display text-4xl sm:text-6xl font-bold tracking-tight leading-none">
                {h.name}
              </h2>
              <p className="mt-2 text-sm sm:text-base font-mono text-foreground-muted uppercase tracking-widest">
                {h.focus}
              </p>
            </div>

            <p className="text-base sm:text-lg text-foreground-muted leading-relaxed max-w-2xl">
              {h.description}
            </p>

            {h.topics.length > 0 && (
              <ul className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 max-w-2xl">
                {h.topics.map((t) => (
                  <li
                    key={t}
                    className="px-2.5 py-1.5 rounded-lg border border-border bg-white/[0.02] text-[11px] text-foreground-muted leading-snug"
                  >
                    {t}
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <span
                className={cn(
                  "px-2.5 py-1 rounded-lg border text-xs font-mono font-semibold uppercase tracking-wider",
                  DIFFICULTY_STYLE[h.difficulty] ??
                    "bg-white/5 text-foreground-muted border-border",
                )}
              >
                {"★".repeat(h.stars)} {h.difficulty}
              </span>
              {h.tags.map((t) => (
                <span
                  key={t}
                  className="px-2.5 py-1 rounded-lg border border-border bg-white/[0.03] text-xs font-mono font-semibold uppercase tracking-wider text-foreground-muted"
                >
                  {t}
                </span>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 pt-4 border-t border-border">
              <HackathonInscripcionButton hackathonId={h.id} />
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-foreground-muted group-hover:text-foreground transition-colors">
                Ver detalle
                <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
              </span>
              {countdown && !isActive && (
                <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-widest text-bitcoin">
                  <Clock className="h-3.5 w-3.5" />
                  {countdown}
                </span>
              )}
            </div>

            {h.sponsors && h.sponsors.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 pt-3">
                <span className="text-[10px] font-mono font-semibold uppercase tracking-widest text-foreground-subtle">
                  Sponsor
                </span>
                {h.sponsors.map((s) => (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    key={s.name}
                    src={s.logo}
                    alt={s.name}
                    className="h-14 sm:h-16 w-auto object-contain"
                    loading="lazy"
                  />
                ))}
              </div>
            )}
          </div>

          <div className="text-7xl sm:text-9xl leading-none shrink-0 text-right opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-transform origin-right">
            {h.icon}
          </div>
        </div>
      </Link>
    </div>
  );
}

function HackathonCard({
  h,
  status,
  compact = false,
}: {
  h: (typeof HACKATHONS)[number];
  status: "upcoming" | "active" | "closed";
  compact?: boolean;
}) {
  const statusMeta = STATUS_STYLE[status];
  const firstDate = h.dates[0]?.date;
  const lastDate = h.dates[h.dates.length - 1]?.date;
  return (
    <Link
      href={`/hackathons/${h.id}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-background-card hover:border-border-strong hover:-translate-y-1 transition-all"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-bitcoin/[0.04] via-transparent to-nostr/[0.04] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
      <div className={cn("relative flex flex-col flex-1", compact ? "p-4" : "p-6")}>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono tracking-widest text-foreground-subtle">
              #{String(h.number).padStart(2, "0")}
            </span>
            <span
              className={cn(
                "inline-flex items-center px-2 py-0.5 rounded-full border text-[9px] font-mono font-semibold tracking-widest",
                statusMeta.className,
              )}
            >
              {statusMeta.label}
            </span>
          </div>
          <div className={cn("leading-none", compact ? "text-2xl" : "text-3xl")}>
            {h.icon}
          </div>
        </div>

        <div>
          <h2
            className={cn(
              "font-display font-bold tracking-tight",
              compact ? "text-lg" : "text-2xl",
            )}
          >
            {h.name}
          </h2>
          <p className="mt-0.5 text-xs font-mono text-foreground-muted uppercase tracking-widest">
            {h.focus}
          </p>
        </div>

        {!compact && (
          <p className="mt-3 text-sm text-foreground-muted leading-relaxed line-clamp-3 flex-1">
            {h.description}
          </p>
        )}

        {!compact && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            <span
              className={cn(
                "px-2 py-0.5 rounded-md border text-[10px] font-mono font-semibold uppercase tracking-wider",
                DIFFICULTY_STYLE[h.difficulty] ??
                  "bg-white/5 text-foreground-muted border-border",
              )}
            >
              {"★".repeat(h.stars)} {h.difficulty}
            </span>
            {h.tags.map((t) => (
              <span
                key={t}
                className="px-2 py-0.5 rounded-md border border-border bg-white/[0.03] text-[10px] font-mono font-semibold uppercase tracking-wider text-foreground-muted"
              >
                {t}
              </span>
            ))}
          </div>
        )}

        <div
          className={cn(
            "border-t border-border flex items-center justify-between text-xs",
            compact ? "mt-3 pt-3" : "mt-6 pt-5",
          )}
        >
          <div className="flex items-center gap-1.5 text-foreground-muted">
            <Calendar className="h-3.5 w-3.5" />
            <span>
              {h.monthShort} {h.year}
            </span>
            {!compact && firstDate && lastDate && (
              <span className="text-foreground-subtle">
                · {firstDate.slice(8, 10)}–{lastDate.slice(8, 10)}
              </span>
            )}
          </div>
          <ArrowRight className="h-4 w-4 text-foreground-muted group-hover:text-bitcoin group-hover:translate-x-0.5 transition-all" />
        </div>
      </div>
    </Link>
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
