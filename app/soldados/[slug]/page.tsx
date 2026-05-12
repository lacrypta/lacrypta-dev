import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { nip19 } from "nostr-tools";
import {
  ArrowLeft,
  AtSign,
  Award,
  ExternalLink,
  Globe,
  Trophy,
  Zap,
} from "lucide-react";
import { GithubIcon } from "@/components/BrandIcons";
import { HACKATHON_LABELS } from "@/lib/projects";
import {
  getSoldierBySlug,
  getSoldiers,
  type Soldier,
  type SoldierProjectRef,
} from "@/lib/soldiers";
import { getCachedNostrProfile } from "@/lib/nostrProfileCache";
import { cn } from "@/lib/cn";

type RouteParams = { slug: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const s = await getSoldierBySlug(slug);
  if (!s) return { title: "Soldado", robots: { index: false } };
  return {
    title: `${s.name} — Soldados`,
    description: `Builder de La Crypta · ${s.projects.length} proyecto(s) · score ${s.score}.`,
  };
}

function avatarSrc(s: Soldier, profilePicture?: string): string | null {
  if (profilePicture) return profilePicture;
  if (s.picture) return s.picture;
  if (s.github) return `https://github.com/${s.github}.png?size=320`;
  return null;
}

function initials(name: string): string {
  const parts = name
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .trim()
    .split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

function medal(position?: number): string {
  if (position === 1) return "🥇";
  if (position === 2) return "🥈";
  if (position === 3) return "🥉";
  return "";
}

function hackathonLabel(id: string): string {
  if (id in HACKATHON_LABELS) {
    return HACKATHON_LABELS[id as keyof typeof HACKATHON_LABELS];
  }
  return id;
}

function safeNpub(pubkey?: string): string | null {
  if (!pubkey) return null;
  try {
    return nip19.npubEncode(pubkey);
  } catch {
    return null;
  }
}

export default async function SoldierProfilePage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { slug } = await params;
  const soldier = await getSoldierBySlug(slug);
  if (!soldier) notFound();

  // Live Nostr profile (kind 0) for richer data when we know a pubkey.
  const profile = soldier.pubkey
    ? await getCachedNostrProfile(soldier.pubkey)
    : null;

  const displayName =
    profile?.display_name || profile?.name || soldier.name;
  const banner = profile?.banner;
  const avatar = avatarSrc(soldier, profile?.picture);
  const npub = safeNpub(soldier.pubkey);
  const lud16 = profile?.lud16;
  const website = profile?.website;
  const nip05 = profile?.nip05 ?? soldier.nip05;
  const about = profile?.about;

  const hackathons = new Set<string>();
  for (const p of soldier.projects) if (p.hackathonId) hackathons.add(p.hackathonId);

  const sortedProjects = [...soldier.projects].sort((a, b) => {
    const pa = a.position ?? 999;
    const pb = b.position ?? 999;
    if (pa !== pb) return pa - pb;
    return a.projectName.localeCompare(b.projectName);
  });

  return (
    <div className="relative min-h-screen pb-24">
      <ProfileBanner banner={banner} />

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 -mt-24 sm:-mt-32">
        <Link
          href="/soldados"
          className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-widest text-foreground-subtle hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Soldados
        </Link>

        <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-end gap-5">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatar}
              alt={displayName}
              className="h-32 w-32 sm:h-36 sm:w-36 rounded-full object-cover ring-4 ring-background-card bg-background-card shrink-0"
            />
          ) : (
            <span className="h-32 w-32 sm:h-36 sm:w-36 rounded-full ring-4 ring-background-card bg-gradient-to-br from-bitcoin/30 to-nostr/30 inline-flex items-center justify-center font-display font-black text-4xl shrink-0">
              {initials(displayName)}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-3xl sm:text-4xl font-black tracking-tight leading-tight flex items-center gap-2 flex-wrap">
              <span className="break-words">{displayName}</span>
              {soldier.hasNostr && (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-nostr/15 border border-nostr/40 text-nostr text-[10px] font-mono font-bold uppercase tracking-widest"
                  title="Verificado en Nostr"
                >
                  <Zap className="h-3 w-3" strokeWidth={3} />
                  Nostr
                </span>
              )}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-mono text-foreground-muted">
              {nip05 && (
                <span className="inline-flex items-center gap-1">
                  <AtSign className="h-3 w-3 text-foreground-subtle" />
                  {nip05}
                </span>
              )}
              {soldier.github && (
                <a
                  href={`https://github.com/${soldier.github}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                >
                  <GithubIcon className="h-3 w-3" />
                  {soldier.github}
                </a>
              )}
              {website && (
                <a
                  href={website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                >
                  <Globe className="h-3 w-3" />
                  {website.replace(/^https?:\/\//, "")}
                </a>
              )}
              {lud16 && (
                <span className="inline-flex items-center gap-1 text-lightning">
                  <Zap className="h-3 w-3" />
                  {lud16}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Score banner */}
        <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <ScoreCell
            label="Score"
            value={soldier.score}
            tone="bitcoin"
            big
          />
          <ScoreCell
            label="Hackatones"
            value={hackathons.size}
            sub={`+${soldier.scoreBreakdown.hackathons} pts`}
          />
          <ScoreCell
            label="Proyectos"
            value={soldier.projects.length}
            sub={`+${soldier.scoreBreakdown.projects} pts`}
          />
          <ScoreCell
            label="Posiciones"
            value={`+${soldier.scoreBreakdown.positions}`}
            sub="podio"
          />
        </div>

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            {about && (
              <Card title="Bio" icon={<AtSign className="h-4 w-4" />}>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">
                  {about}
                </p>
              </Card>
            )}

            <Card
              title={`Proyectos (${soldier.projects.length})`}
              icon={<Trophy className="h-4 w-4 text-bitcoin" />}
            >
              <ul className="divide-y divide-border -my-2">
                {sortedProjects.map((p, i) => (
                  <ProjectRow key={`${p.projectId}-${i}`} project={p} />
                ))}
              </ul>
            </Card>
          </div>

          <div className="space-y-4">
            {hackathons.size > 0 && (
              <Card
                title="Hackatones"
                icon={<Award className="h-4 w-4 text-bitcoin" />}
              >
                <ul className="space-y-2">
                  {[...hackathons].map((h) => (
                    <li key={h}>
                      <Link
                        href={`/hackathons/${h}`}
                        className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-bitcoin/30 bg-bitcoin/[0.06] text-bitcoin text-xs font-mono uppercase tracking-widest hover:bg-bitcoin/[0.12] transition-colors"
                      >
                        <Trophy className="h-3 w-3" />
                        {hackathonLabel(h)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {npub && (
              <Card title="Nostr" icon={<Zap className="h-4 w-4 text-nostr" />}>
                <div className="space-y-2 text-xs font-mono break-all">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-foreground-subtle mb-0.5">
                      npub
                    </div>
                    <a
                      href={`https://njump.me/${npub}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-nostr hover:text-nostr/80 transition-colors break-all inline-flex items-start gap-1"
                    >
                      <span>{npub}</span>
                      <ExternalLink className="h-3 w-3 shrink-0 mt-0.5" />
                    </a>
                  </div>
                  {soldier.pubkey && (
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-foreground-subtle mb-0.5">
                        pubkey (hex)
                      </div>
                      <span className="text-foreground-muted">
                        {soldier.pubkey}
                      </span>
                    </div>
                  )}
                </div>
              </Card>
            )}

            {soldier.roles.length > 0 && (
              <Card title="Roles" icon={<Award className="h-4 w-4" />}>
                <div className="flex flex-wrap gap-1.5">
                  {soldier.roles.map((r) => (
                    <span
                      key={r}
                      className="inline-flex items-center px-2.5 py-1 rounded-full border border-border bg-white/[0.03] text-[10px] font-mono uppercase tracking-widest text-foreground-muted"
                    >
                      {r}
                    </span>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfileBanner({ banner }: { banner?: string }) {
  if (banner) {
    return (
      <div
        className="relative h-48 sm:h-64 w-full bg-cover bg-center"
        style={{ backgroundImage: `url(${banner})` }}
        aria-hidden
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/40 to-background" />
      </div>
    );
  }
  return (
    <div className="relative h-48 sm:h-64 w-full overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-bitcoin/20 via-nostr/15 to-cyan/10" />
      <div className="absolute inset-0 bg-grid bg-grid-fade opacity-30" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" />
    </div>
  );
}

function ScoreCell({
  label,
  value,
  sub,
  tone,
  big,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "bitcoin";
  big?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-background-card/50 backdrop-blur-sm p-4",
        tone === "bitcoin"
          ? "border-bitcoin/40 shadow-[0_0_30px_-15px_rgba(247,147,26,0.55)]"
          : "border-border",
      )}
    >
      <div className="text-[10px] font-mono uppercase tracking-widest text-foreground-subtle">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 font-display font-black tabular-nums leading-none",
          big ? "text-4xl text-bitcoin" : "text-2xl",
        )}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-1 text-[10px] font-mono text-foreground-subtle">
          {sub}
        </div>
      )}
    </div>
  );
}

function Card({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background-card/50 backdrop-blur-sm p-5">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h2 className="font-display font-bold text-sm uppercase tracking-widest text-foreground-muted">
          {title}
        </h2>
      </div>
      {children}
    </div>
  );
}

function projectHref(project: SoldierProjectRef): string {
  // 1. Hackathon-scoped project → /hackathons/<h>/<projectId>
  if (project.hackathonId) {
    return `/hackathons/${project.hackathonId}/${project.projectId}`;
  }
  // 2. Nostr-only project with known author → /projects/<author>/<projectId>
  if (project.source === "nostr" && project.authorPubkey) {
    return `/projects/${project.authorPubkey}/${project.projectId}`;
  }
  // 3. Curated non-hackathon project → /projects/<projectId> (dispatched
  //    by /projects/[pubkey]/page.tsx, which detects curated ids).
  return `/projects/${project.projectId}`;
}

function ProjectRow({ project }: { project: SoldierProjectRef }) {
  const href = projectHref(project);
  return (
    <li className="py-2.5">
      <Link
        href={href}
        className="flex items-center justify-between gap-3 group/proj"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            {project.position && project.position <= 3 && (
              <span className="text-base shrink-0">
                {medal(project.position)}
              </span>
            )}
            <span className="font-semibold text-sm group-hover/proj:text-bitcoin transition-colors truncate">
              {project.projectName}
            </span>
          </div>
          <div className="mt-0.5 text-[11px] font-mono text-foreground-subtle uppercase tracking-widest">
            {project.role}
            {project.hackathonId && (
              <>
                {" · "}
                {hackathonLabel(project.hackathonId)}
              </>
            )}
            {project.position && (
              <>
                {" · "}
                {project.position}°
              </>
            )}
          </div>
        </div>
        {project.positionPoints > 0 && (
          <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full border border-bitcoin/30 bg-bitcoin/[0.06] text-bitcoin text-[10px] font-mono font-bold tabular-nums">
            +{project.positionPoints}
          </span>
        )}
      </Link>
    </li>
  );
}
