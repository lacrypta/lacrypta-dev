"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Award,
  Compass,
  FolderGit2,
  Loader2,
  Radio,
  Rocket,
  Shield,
  Sparkles,
  Trophy,
  UserRound,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { isDevMode } from "@/lib/devMode";
import { useNostrProfile } from "@/lib/nostrProfile";
import {
  useUserHackathons,
  hackathonName,
  type HackathonGroup,
} from "@/lib/useUserHackathons";
import {
  HACKATHONS,
  getHackathon,
  hackathonSlugForId,
  hackathonStatus,
  type Hackathon,
} from "@/lib/hackathons";
import { projectHref } from "@/lib/projectLinks";
import NewsletterCTA from "@/components/sections/NewsletterCTA";
import { cn } from "@/lib/cn";

function shorten(pubkey: string) {
  return `${pubkey.slice(0, 8)}…${pubkey.slice(-6)}`;
}

/** The hackathon to nudge the user toward: the one running now, else the next
 *  one that hasn't started (earliest date), else the most recent by number. */
function pickFeatured(now: Date): Hackathon | null {
  const active = HACKATHONS.find((h) => hackathonStatus(h, now) === "active");
  if (active) return active;
  const upcoming = HACKATHONS.filter(
    (h) => hackathonStatus(h, now) === "upcoming",
  )
    .map((h) => ({
      h,
      first: [...h.dates].map((d) => d.date).sort()[0] ?? "9999",
    }))
    .sort((a, b) => a.first.localeCompare(b.first));
  if (upcoming.length > 0) return upcoming[0].h;
  return [...HACKATHONS].sort((a, b) => b.number - a.number)[0] ?? null;
}

export default function HomeDashboard() {
  const { auth } = useAuth();

  // In dev, an impersonated session reads the impersonated user's data.
  const readPubkey =
    isDevMode() && auth?.impersonating ? auth.impersonating : auth?.pubkey;

  const { profile } = useNostrProfile(readPubkey);
  const { projects, groups, loading } = useUserHackathons(readPubkey);

  const now = useMemo(() => new Date(), []);
  const featured = useMemo(() => pickFeatured(now), [now]);

  const displayName =
    profile?.display_name ||
    profile?.name ||
    (readPubkey ? shorten(readPubkey) : "constructor");

  const hackathonCount = groups.length;
  const projectCount = projects.length;

  const featuredGroup = featured
    ? groups.find((g) => g.hackathonId === featured.id)
    : undefined;
  const participatesInFeatured = Boolean(
    featuredGroup && featuredGroup.projects.length > 0,
  );

  const subtitle =
    hackathonCount > 0
      ? `Participaste en ${hackathonCount} ${hackathonCount === 1 ? "hackatón" : "hackatones"} con ${projectCount} ${projectCount === 1 ? "proyecto" : "proyectos"}.`
      : "Todavía no participaste en un hackatón. Es un buen momento para empezar.";

  return (
    <div className="relative min-h-screen">
      {/* Greeting band */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-gradient-to-br from-bitcoin/15 via-nostr/10 to-cyan/10" />
        <div className="absolute inset-0 bg-grid opacity-20" />
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-bitcoin/10 blur-3xl pointer-events-none" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 sm:pt-32 pb-10">
          <div className="flex items-center gap-4 sm:gap-5">
            <Avatar picture={profile?.picture} name={displayName} />
            <div className="min-w-0">
              <div className="text-[11px] font-mono uppercase tracking-widest text-foreground-muted">
                Tu panel
                {isDevMode() && auth?.impersonating && (
                  <span className="ml-1 text-bitcoin">· impersonado</span>
                )}
              </div>
              <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight truncate">
                Hola, {displayName}
              </h1>
              <p className="mt-1 text-sm text-foreground-muted max-w-xl">
                {subtitle}
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Stat
              label="Hackatones"
              value={hackathonCount}
              icon={<Award className="h-4 w-4 text-bitcoin" />}
            />
            <Stat
              label="Proyectos"
              value={projectCount}
              icon={<FolderGit2 className="h-4 w-4 text-nostr" />}
            />
          </div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-10">
        {/* Primary engagement CTA */}
        {featured && (
          <FeaturedActionCard
            hackathon={featured}
            status={hackathonStatus(featured, now)}
            participates={participatesInFeatured}
          />
        )}

        {/* Mis hackatones */}
        <section>
          <div className="flex items-end justify-between gap-3 mb-4">
            <h2 className="font-display text-xl font-bold tracking-tight">
              Mis hackatones
            </h2>
            {hackathonCount > 0 && (
              <Link
                href="/dashboard/hackathones"
                className="inline-flex items-center gap-1 text-sm text-foreground-muted hover:text-bitcoin transition-colors"
              >
                Ver todos
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>

          {loading && hackathonCount === 0 ? (
            <div className="flex items-center gap-2 text-sm text-foreground-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando tus participaciones…
            </div>
          ) : hackathonCount === 0 ? (
            <EmptyHackathons featured={featured} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {groups.map((g) => (
                <HackathonCard key={g.hackathonId} group={g} now={now} />
              ))}
            </div>
          )}
        </section>

        {/* Quick actions */}
        <section>
          <h2 className="font-display text-xl font-bold tracking-tight mb-4">
            Seguí construyendo
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <ActionTile
              href="/dashboard/projects"
              title="Mis proyectos"
              description="Creá y editá tu portfolio"
              icon={<FolderGit2 className="h-5 w-5" />}
              accent="bitcoin"
            />
            <ActionTile
              href="/dashboard"
              title="Mi perfil"
              description="Avatar, badges y relays"
              icon={<UserRound className="h-5 w-5" />}
              accent="nostr"
            />
            <ActionTile
              href="/projects"
              title="Explorar proyectos"
              description="Lo que construye la comunidad"
              icon={<Compass className="h-5 w-5" />}
              accent="cyan"
            />
            <ActionTile
              href="/soldados"
              title="Soldados"
              description="Ranking de la comunidad"
              icon={<Shield className="h-5 w-5" />}
              accent="lightning"
            />
          </div>
        </section>
      </div>

      <NewsletterCTA />
    </div>
  );
}

function Avatar({ picture, name }: { picture?: string; name: string }) {
  return (
    <div className="shrink-0 h-16 w-16 sm:h-20 sm:w-20 rounded-2xl overflow-hidden border border-border-strong bg-background-card ring-1 ring-border">
      {picture ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={picture}
          alt={name}
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-bitcoin/30 to-nostr/30 text-xl sm:text-2xl font-display font-bold">
          {name.slice(0, 2).toUpperCase()}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-background-card/80 backdrop-blur px-4 py-3">
      {icon}
      <div>
        <div className="font-display text-2xl font-bold leading-none tabular-nums">
          {value}
        </div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-foreground-subtle mt-1">
          {label}
        </div>
      </div>
    </div>
  );
}

const STATUS_META: Record<
  ReturnType<typeof hackathonStatus>,
  { label: string; className: string; icon: React.ReactNode }
> = {
  active: {
    label: "En vivo",
    className: "border-danger/40 bg-danger/10 text-danger",
    icon: <Radio className="h-3 w-3" />,
  },
  upcoming: {
    label: "Próximo",
    className: "border-cyan/40 bg-cyan/10 text-cyan",
    icon: <Sparkles className="h-3 w-3" />,
  },
  closed: {
    label: "Cerrado",
    className: "border-border text-foreground-muted",
    icon: <Trophy className="h-3 w-3" />,
  },
};

function StatusBadge({
  status,
}: {
  status: ReturnType<typeof hackathonStatus>;
}) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest",
        meta.className,
      )}
    >
      {meta.icon}
      {meta.label}
    </span>
  );
}

function FeaturedActionCard({
  hackathon,
  status,
  participates,
}: {
  hackathon: Hackathon;
  status: ReturnType<typeof hackathonStatus>;
  participates: boolean;
}) {
  const slug = hackathonSlugForId(hackathon.id);
  const hackathonHref = `/hackathons/${slug}`;

  let eyebrow: string;
  let title: string;
  let description: string;
  let primary: { label: string; href: string };
  let secondary: { label: string; href: string } | null;

  if (status === "active" && participates) {
    eyebrow = "Estás participando";
    title = `Seguí puliendo tu proyecto en ${hackathon.name}`;
    description =
      "El hackatón está activo — podés editar tu proyecto hasta el cierre.";
    primary = { label: "Editar mi proyecto", href: "/dashboard/projects" };
    secondary = { label: "Ver el hackatón", href: hackathonHref };
  } else if (status === "active") {
    eyebrow = "Hackatón en marcha";
    title = `${hackathon.name} está activo — sumate`;
    description = `${hackathon.focus}. Presentá tu proyecto antes del cierre y competí por premios en sats.`;
    primary = { label: "Crear mi proyecto", href: "/dashboard/projects" };
    secondary = { label: "Ver el hackatón", href: hackathonHref };
  } else if (status === "upcoming") {
    eyebrow = "Se viene";
    title = `${hackathon.name} · ${hackathon.month}`;
    description = `${hackathon.focus}. Conocé las reglas y preparate para participar.`;
    primary = { label: "Ver el hackatón", href: hackathonHref };
    secondary = { label: "Ir a mis proyectos", href: "/dashboard/projects" };
  } else {
    eyebrow = "Mantené el ritmo";
    title = "El próximo hackatón está por venir";
    description =
      "Mientras tanto, creá un proyecto o explorá lo que construye la comunidad.";
    primary = { label: "Crear un proyecto", href: "/dashboard/projects" };
    secondary = { label: "Explorar proyectos", href: "/projects" };
  }

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-bitcoin/30 bg-gradient-to-br from-bitcoin/10 via-background-card to-nostr/10 p-6 sm:p-8">
      <div className="absolute -top-16 -right-16 h-56 w-56 rounded-full bg-bitcoin/15 blur-3xl pointer-events-none" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl leading-none" aria-hidden>
              {hackathon.icon}
            </span>
            <span className="text-[11px] font-mono uppercase tracking-widest text-bitcoin">
              {eyebrow}
            </span>
            <StatusBadge status={status} />
          </div>
          <h3 className="font-display text-xl sm:text-2xl font-bold tracking-tight">
            {title}
          </h3>
          <p className="mt-2 text-sm text-foreground-muted max-w-xl">
            {description}
          </p>
        </div>

        <div className="flex flex-col gap-2 shrink-0 sm:items-end">
          <Link
            href={primary.href}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-bitcoin to-yellow-500 px-5 py-3 text-sm font-bold text-black hover:opacity-90 transition-opacity"
          >
            <Rocket className="h-4 w-4" />
            {primary.label}
          </Link>
          {secondary && (
            <Link
              href={secondary.href}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-white/[0.03] px-5 py-2.5 text-sm font-semibold text-foreground-muted hover:text-foreground hover:border-border-strong transition-colors"
            >
              {secondary.label}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function HackathonCard({ group, now }: { group: HackathonGroup; now: Date }) {
  const hackathon = getHackathon(group.hackathonId);
  const slug = hackathonSlugForId(group.hackathonId);
  const status = hackathon ? hackathonStatus(hackathon, now) : null;

  return (
    <section className="rounded-2xl border border-border bg-background-card overflow-hidden">
      <Link
        href={`/hackathons/${slug}`}
        className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
      >
        <span className="inline-flex items-center gap-2 min-w-0">
          <span className="text-lg leading-none" aria-hidden>
            {hackathon?.icon ?? "🏆"}
          </span>
          <span className="min-w-0">
            <span className="block font-display font-bold text-bitcoin truncate">
              {hackathonName(group.hackathonId)}
            </span>
            {hackathon?.focus && (
              <span className="block text-[11px] text-foreground-subtle truncate">
                {hackathon.focus}
              </span>
            )}
          </span>
        </span>
        {status && <StatusBadge status={status} />}
      </Link>
      <ul className="divide-y divide-border/60">
        {group.projects.map((p) => (
          <li key={p.id}>
            <Link
              href={projectHref(p)}
              className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-white/[0.03] transition-colors group/row"
            >
              <div className="min-w-0">
                <div className="font-semibold text-sm group-hover/row:text-bitcoin transition-colors truncate">
                  {p.name}
                </div>
                {p.description && (
                  <div className="text-xs text-foreground-subtle truncate max-w-md">
                    {p.description}
                  </div>
                )}
              </div>
              <span className="shrink-0 text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full border border-border text-foreground-muted">
                {p.status}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function EmptyHackathons({ featured }: { featured: Hackathon | null }) {
  const featuredHref = featured
    ? `/hackathons/${hackathonSlugForId(featured.id)}`
    : "/hackathons";
  return (
    <div className="rounded-2xl border border-border bg-background-card p-8 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-bitcoin/40 bg-bitcoin/10">
        <Trophy className="h-5 w-5 text-bitcoin" />
      </div>
      <p className="text-sm text-foreground-muted max-w-md mx-auto">
        Todavía no participaste en ningún hackatón. Presentá un proyecto Nostr y
        aparecerá acá — firmado por vos.
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/dashboard/projects"
          className="inline-flex items-center gap-2 rounded-lg border border-bitcoin/40 bg-bitcoin/10 px-4 py-2 text-sm font-semibold text-bitcoin hover:bg-bitcoin/20 transition-colors"
        >
          <FolderGit2 className="h-4 w-4" />
          Crear mi primer proyecto
        </Link>
        <Link
          href={featuredHref}
          className="inline-flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground transition-colors"
        >
          {featured ? `Conocer ${featured.name}` : "Ver hackatones"}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}

const ACCENT: Record<
  "bitcoin" | "nostr" | "cyan" | "lightning",
  { text: string; border: string; bg: string }
> = {
  bitcoin: {
    text: "text-bitcoin",
    border: "hover:border-bitcoin/50",
    bg: "bg-bitcoin/10 border-bitcoin/30",
  },
  nostr: {
    text: "text-nostr",
    border: "hover:border-nostr/50",
    bg: "bg-nostr/10 border-nostr/30",
  },
  cyan: {
    text: "text-cyan",
    border: "hover:border-cyan/50",
    bg: "bg-cyan/10 border-cyan/30",
  },
  lightning: {
    text: "text-lightning",
    border: "hover:border-lightning/50",
    bg: "bg-lightning/10 border-lightning/30",
  },
};

function ActionTile({
  href,
  title,
  description,
  icon,
  accent,
}: {
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  accent: keyof typeof ACCENT;
}) {
  const a = ACCENT[accent];
  return (
    <Link
      href={href}
      className={cn(
        "group flex flex-col gap-3 rounded-2xl border border-border bg-background-card p-5 transition-colors",
        a.border,
      )}
    >
      <span
        className={cn(
          "inline-flex h-10 w-10 items-center justify-center rounded-xl border",
          a.bg,
          a.text,
        )}
      >
        {icon}
      </span>
      <div>
        <div className="font-display font-bold text-sm flex items-center gap-1">
          {title}
          <ArrowRight
            className={cn(
              "h-3.5 w-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all",
              a.text,
            )}
          />
        </div>
        <div className="text-xs text-foreground-muted mt-0.5">
          {description}
        </div>
      </div>
    </Link>
  );
}
