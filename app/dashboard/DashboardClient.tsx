"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Copy,
  Check,
  LogOut,
  Key,
  Shield,
  Globe,
  Zap,
  Calendar,
  AtSign,
  BadgeCheck,
  Radio,
  Loader2,
  ExternalLink,
  FolderGit2,
  ArrowRight,
  Award,
} from "lucide-react";
import { useAuth, clearAuth, type Auth } from "@/lib/auth";
import {
  useNostrProfile,
  DEFAULT_PROFILE_RELAYS,
  type NostrProfile as BaseNostrProfile,
} from "@/lib/nostrProfile";
import {
  useUserBadges,
  useProfileBadges,
  type AwardedBadge,
  type ProfileBadges,
} from "@/lib/nostrBadges";
import { cn } from "@/lib/cn";
import BadgesModal from "./BadgesModal";

type DashboardProfile = BaseNostrProfile & {
  pubkey: string;
  createdAt?: number;
};

export default function DashboardClient() {
  const router = useRouter();
  const { auth, ready } = useAuth();
  const [npub, setNpub] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const relays = useMemo(() => {
    const out = new Set<string>(DEFAULT_PROFILE_RELAYS);
    if (auth?.bunker?.relays) {
      auth.bunker.relays.forEach((r) => out.add(r));
    }
    return [...out];
  }, [auth]);

  const {
    profile: baseProfile,
    cached,
    loading,
  } = useNostrProfile(auth?.pubkey, relays);

  const { badges, loading: badgesLoading } = useUserBadges(auth?.pubkey);
  const { profileBadges, override: setProfileBadges } = useProfileBadges(
    auth?.pubkey,
  );
  const [badgesModalOpen, setBadgesModalOpen] = useState(false);

  // Badges the user has chosen to wear — intersect profile_badges with actually
  // resolved awards so we never render a broken tile.
  const wornBadges = useMemo<AwardedBadge[]>(() => {
    if (!profileBadges) return [];
    const byATag = new Map(badges.map((b) => [b.aTag, b]));
    return profileBadges.aTags
      .map((a) => byATag.get(a))
      .filter((b): b is AwardedBadge => Boolean(b));
  }, [profileBadges, badges]);

  const wornATags = useMemo(
    () => new Set(wornBadges.map((b) => b.aTag)),
    [wornBadges],
  );
  const unwornBadges = useMemo(
    () => badges.filter((b) => !wornATags.has(b.aTag)),
    [badges, wornATags],
  );

  const profile: DashboardProfile | null = useMemo(() => {
    if (!auth) return null;
    if (!baseProfile) return { pubkey: auth.pubkey };
    return {
      ...baseProfile,
      pubkey: auth.pubkey,
      createdAt: cached?.eventCreatedAt,
    };
  }, [auth, baseProfile, cached]);

  const relaysUsed = cached?.relaysUsed ?? [];

  useEffect(() => {
    if (!ready) return;
    if (!auth) {
      router.replace("/");
    }
  }, [ready, auth, router]);

  useEffect(() => {
    if (!auth) {
      setNpub(null);
      return;
    }
    (async () => {
      try {
        const { nip19 } = await import("nostr-tools");
        setNpub(nip19.npubEncode(auth.pubkey));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error obteniendo npub");
      }
    })();
  }, [auth]);

  function logout() {
    clearAuth();
    router.push("/");
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-foreground-muted" />
      </div>
    );
  }

  if (!auth) return null;

  return (
    <div className="relative min-h-screen">
      <ProfileBanner banner={profile?.banner} />
      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 -mt-24 sm:-mt-32 pb-20">
        <ProfileHeader
          auth={auth}
          profile={profile}
          loading={loading}
          onLogout={logout}
          wornBadges={wornBadges}
          onOpenBadges={() => setBadgesModalOpen(true)}
          hasAnyBadge={badges.length > 0}
        />

        {error && (
          <div className="mt-6 px-4 py-3 rounded-xl bg-danger/10 border border-danger/30 text-sm text-danger">
            {error}
          </div>
        )}

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            {profile?.about && (
              <Card title="Bio" icon={<AtSign className="h-4 w-4" />}>
                <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                  {profile.about}
                </p>
              </Card>
            )}

            <BadgesCard
              badges={unwornBadges}
              loading={badgesLoading}
              onManage={() => setBadgesModalOpen(true)}
              totalCount={badges.length}
              wornCount={wornBadges.length}
            />

            <Link
              href="/dashboard/projects"
              className="group relative block overflow-hidden rounded-2xl border border-bitcoin/30 bg-gradient-to-br from-bitcoin/10 to-nostr/10 p-6 hover:border-bitcoin/60 transition-all"
            >
              <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-bitcoin/20 blur-3xl group-hover:bg-bitcoin/30 transition-colors pointer-events-none" />
              <div className="relative flex items-start gap-4">
                <div className="shrink-0 h-11 w-11 rounded-xl bg-bitcoin/20 border border-bitcoin/40 flex items-center justify-center">
                  <FolderGit2 className="h-5 w-5 text-bitcoin" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="inline-flex items-center gap-1 text-[10px] font-mono tracking-widest text-bitcoin mb-1">
                    NIP-78 · FIRMADOS POR VOS
                  </div>
                  <div className="font-display font-bold text-lg leading-tight">
                    Mis proyectos
                  </div>
                  <div className="text-sm text-foreground-muted mt-1">
                    Creá y editá tu portfolio. Se guarda firmado en relays
                    Nostr — vos sos dueño de tu data.
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-bitcoin shrink-0 group-hover:translate-x-0.5 transition-transform mt-1" />
              </div>
            </Link>

            <Card title="Identidad" icon={<Key className="h-4 w-4" />}>
              <div className="grid grid-cols-1 gap-3">
                <InfoRow label="npub" value={npub ?? "…"} copy mono />
                <InfoRow label="pubkey (hex)" value={auth.pubkey} copy mono />
                {profile?.nip05 && (
                  <InfoRow
                    label="NIP-05"
                    value={profile.nip05}
                    accent="text-cyan"
                    icon={<BadgeCheck className="h-3.5 w-3.5" />}
                  />
                )}
                {profile?.lud16 && (
                  <InfoRow
                    label="Lightning"
                    value={profile.lud16}
                    accent="text-lightning"
                    icon={<Zap className="h-3.5 w-3.5" />}
                  />
                )}
                {profile?.website && (
                  <InfoRow
                    label="Sitio"
                    value={profile.website}
                    accent="text-bitcoin"
                    icon={<Globe className="h-3.5 w-3.5" />}
                    link
                  />
                )}
              </div>
            </Card>
          </div>

          <div className="space-y-4">
            <Card title="Sesión" icon={<Shield className="h-4 w-4" />}>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-foreground-muted">Método</span>
                  <span className="inline-flex items-center gap-1.5 font-semibold">
                    {auth.method === "nip07" ? (
                      <>
                        <Key className="h-3.5 w-3.5 text-nostr" />
                        NIP-07
                      </>
                    ) : (
                      <>
                        <Shield className="h-3.5 w-3.5 text-cyan" />
                        NIP-46
                      </>
                    )}
                  </span>
                </div>
                {auth.method === "nip46" && auth.bunker?.pubkey && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-foreground-muted">Bunker</span>
                    <span className="font-mono text-xs text-foreground truncate">
                      {shorten(auth.bunker.pubkey)}
                    </span>
                  </div>
                )}
                {profile?.createdAt && (
                  <div className="flex items-center justify-between">
                    <span className="text-foreground-muted inline-flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />
                      Perfil actualizado
                    </span>
                    <span className="font-mono text-xs text-foreground-muted">
                      {new Date(profile.createdAt * 1000).toLocaleDateString(
                        "es-AR",
                        { day: "2-digit", month: "short", year: "numeric" },
                      )}
                    </span>
                  </div>
                )}
              </div>
              <button
                onClick={logout}
                className="mt-5 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.03] border border-border hover:bg-danger/10 hover:border-danger/30 hover:text-danger text-sm font-semibold transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Cerrar sesión
              </button>
            </Card>

            <Card title="Relays" icon={<Radio className="h-4 w-4" />}>
              <ul className="space-y-1.5">
                {relaysUsed.map((r) => (
                  <li
                    key={r}
                    className="flex items-center gap-2 text-xs font-mono text-foreground-muted"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-success shrink-0" />
                    <span className="truncate">{r.replace("wss://", "")}</span>
                  </li>
                ))}
                {relaysUsed.length === 0 && (
                  <li className="text-xs text-foreground-subtle">
                    Conectando…
                  </li>
                )}
              </ul>
            </Card>

            <Link
              href="/projects"
              className="block group rounded-2xl border border-border bg-background-card p-5 hover:border-bitcoin/30 hover:bg-bitcoin/5 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-display font-bold text-sm mb-1">
                    Explorá proyectos
                  </div>
                  <div className="text-xs text-foreground-muted">
                    Descubrí lo que construye la comunidad
                  </div>
                </div>
                <ExternalLink className="h-4 w-4 text-foreground-muted group-hover:text-bitcoin transition-colors" />
              </div>
            </Link>
          </div>
        </div>
      </div>

      <BadgesModal
        open={badgesModalOpen}
        onClose={() => setBadgesModalOpen(false)}
        auth={auth}
        badges={badges}
        loading={badgesLoading}
        profileBadges={profileBadges}
        onProfileBadgesUpdated={(pb) => setProfileBadges(pb)}
      />
    </div>
  );
}

function ProfileBanner({ banner }: { banner?: string }) {
  return (
    <div className="relative h-48 sm:h-64 w-full overflow-hidden bg-background-elevated">
      {banner ? (
        <img
          src={banner}
          alt=""
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-bitcoin/20 via-nostr/15 to-cyan/15" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
      <div className="absolute inset-0 bg-grid opacity-20" />
    </div>
  );
}

function ProfileHeader({
  auth,
  profile,
  loading,
  onLogout,
  wornBadges,
  onOpenBadges,
  hasAnyBadge,
}: {
  auth: Auth;
  profile: DashboardProfile | null;
  loading: boolean;
  onLogout: () => void;
  wornBadges: AwardedBadge[];
  onOpenBadges: () => void;
  hasAnyBadge: boolean;
}) {
  const displayName =
    profile?.display_name || profile?.name || shorten(auth.pubkey);
  const handle = profile?.name ?? shorten(auth.pubkey);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6"
    >
      <button
        type="button"
        onClick={onOpenBadges}
        className="relative shrink-0 group rounded-2xl"
        aria-label="Ver mis badges"
      >
        <div className="h-32 w-32 sm:h-40 sm:w-40 rounded-2xl overflow-hidden border-4 border-background bg-background-card ring-1 ring-border-strong group-hover:ring-2 group-hover:ring-nostr/50 transition-all">
          {profile?.picture ? (
            <img
              src={profile.picture}
              alt={displayName}
              className="w-full h-full object-cover"
              onError={(e) => {
                const img = e.currentTarget as HTMLImageElement;
                img.style.display = "none";
              }}
            />
          ) : loading ? (
            <div className="w-full h-full bg-background-elevated shimmer" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-bitcoin/30 to-nostr/30 text-4xl font-display font-bold">
              {displayName.slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>
        {hasAnyBadge && (
          <div className="absolute -bottom-2 -right-2 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-nostr text-white text-[10px] font-mono font-bold tracking-wider shadow-lg shadow-nostr/40 opacity-0 group-hover:opacity-100 transition-opacity">
            <Award className="h-3 w-3" />
            BADGES
          </div>
        )}
      </button>

      <div className="flex-1 min-w-0 sm:pb-2">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          {loading && !profile?.name ? (
            <div className="h-8 w-48 bg-white/5 rounded shimmer" />
          ) : (
            <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight truncate">
              {displayName}
            </h1>
          )}
          {profile?.nip05 && (
            <span className="inline-flex items-center gap-1 text-cyan">
              <BadgeCheck className="h-5 w-5" />
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-foreground-muted">
          {profile?.name && <span>@{handle}</span>}
          {profile?.nip05 && (
            <span className="inline-flex items-center gap-1 text-cyan">
              <AtSign className="h-3.5 w-3.5" />
              {profile.nip05}
            </span>
          )}
          {auth.method === "nip07" ? (
            <span className="inline-flex items-center gap-1 text-nostr">
              <Key className="h-3.5 w-3.5" />
              NIP-07
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-cyan">
              <Shield className="h-3.5 w-3.5" />
              NIP-46
            </span>
          )}
        </div>

        {/* Badges worn in profile */}
        {(wornBadges.length > 0 || hasAnyBadge) && (
          <div className="mt-3">
            <WornBadgesRow
              badges={wornBadges}
              onOpen={onOpenBadges}
              empty={wornBadges.length === 0}
            />
          </div>
        )}
      </div>

      <div className="hidden sm:block">
        <button
          onClick={onLogout}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.03] border border-border hover:bg-danger/10 hover:border-danger/30 hover:text-danger text-sm font-semibold transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Salir
        </button>
      </div>
    </motion.div>
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
    <div className="rounded-2xl border border-border bg-background-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-foreground-muted">{icon}</span>
        <h2 className="font-display font-bold text-sm uppercase tracking-widest text-foreground-muted">
          {title}
        </h2>
      </div>
      {children}
    </div>
  );
}

function InfoRow({
  label,
  value,
  copy,
  mono,
  accent,
  icon,
  link,
}: {
  label: string;
  value: string;
  copy?: boolean;
  mono?: boolean;
  accent?: string;
  icon?: React.ReactNode;
  link?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  }
  const valueEl = link ? (
    <a
      href={value}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("truncate", accent ?? "text-foreground", mono && "font-mono text-xs")}
    >
      {value}
    </a>
  ) : (
    <span
      className={cn(
        "truncate",
        accent ?? "text-foreground",
        mono && "font-mono text-xs",
      )}
    >
      {value}
    </span>
  );

  return (
    <div className="flex items-center gap-3 justify-between">
      <div className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-foreground-subtle shrink-0">
        {icon}
        {label}
      </div>
      <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
        {valueEl}
        {copy && (
          <button
            type="button"
            onClick={onCopy}
            aria-label="Copiar"
            className="p-1 rounded text-foreground-subtle hover:text-foreground hover:bg-white/5 transition-colors shrink-0"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-success" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function shorten(pubkey: string) {
  return `${pubkey.slice(0, 8)}…${pubkey.slice(-6)}`;
}

function BadgesCard({
  badges,
  loading,
  onManage,
  totalCount,
  wornCount,
}: {
  badges: AwardedBadge[];
  loading: boolean;
  onManage: () => void;
  totalCount: number;
  wornCount: number;
}) {
  if (!loading && totalCount === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-background-card p-5">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-foreground-muted">
            <Award className="h-4 w-4" />
          </span>
          <h2 className="font-display font-bold text-sm uppercase tracking-widest text-foreground-muted">
            Otros badges
          </h2>
          {totalCount > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-nostr/10 border border-nostr/30 text-[10px] font-mono tracking-wider text-nostr whitespace-nowrap">
              NIP-58 · {totalCount}
              {wornCount > 0 && <> · {wornCount} en perfil</>}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {loading && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-foreground-muted" />
          )}
          <button
            onClick={onManage}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-white/[0.03] hover:bg-white/[0.06] text-xs font-semibold transition-colors"
          >
            Administrar
          </button>
        </div>
      </div>

      {badges.length === 0 ? (
        <div className="py-6 text-center text-xs text-foreground-subtle">
          {totalCount > 0
            ? "Todos tus badges están en el perfil."
            : "Buscando badges en relays…"}
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
          {badges.map((b) => (
            <BadgeTile key={b.awardId} badge={b} onClick={onManage} />
          ))}
        </div>
      )}
    </div>
  );
}

function WornBadgesRow({
  badges,
  onOpen,
  empty,
}: {
  badges: AwardedBadge[];
  onOpen: () => void;
  empty: boolean;
}) {
  const visible = badges.slice(0, 6);
  const extra = badges.length - visible.length;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group inline-flex items-center gap-2 rounded-full border border-nostr/30 bg-nostr/5 px-2 py-1.5 hover:bg-nostr/10 hover:border-nostr/50 transition-colors"
      aria-label="Administrar badges"
    >
      {empty ? (
        <span className="inline-flex items-center gap-1.5 px-1.5 text-[11px] font-semibold text-nostr">
          <Award className="h-3.5 w-3.5" />
          Usar badges en perfil
        </span>
      ) : (
        <>
          <div className="flex -space-x-1.5">
            {visible.map((b) => (
              <ProfileBadgeChip key={b.awardId} badge={b} />
            ))}
          </div>
          {extra > 0 && (
            <span className="text-[10px] font-mono text-foreground-muted">
              +{extra}
            </span>
          )}
          <span className="hidden sm:inline text-[11px] font-semibold text-foreground-muted group-hover:text-foreground transition-colors pr-1">
            administrar
          </span>
        </>
      )}
    </button>
  );
}

function ProfileBadgeChip({ badge }: { badge: AwardedBadge }) {
  const [imgOk, setImgOk] = useState(true);
  const def = badge.definition;
  const image = imgOk ? (def?.thumb ?? def?.image) : null;
  const name = def?.name || def?.d || "Badge";
  return (
    <span
      className="relative h-6 w-6 rounded-full overflow-hidden border border-background-card bg-gradient-to-br from-nostr/20 to-bitcoin/10 ring-1 ring-nostr/30"
      title={name}
    >
      {image ? (
        <img
          src={image}
          alt={name}
          className="absolute inset-0 w-full h-full object-cover"
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setImgOk(false)}
        />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-nostr">
          <Award className="h-3 w-3" />
        </span>
      )}
    </span>
  );
}

function BadgeTile({
  badge,
  onClick,
}: {
  badge: AwardedBadge;
  onClick?: () => void;
}) {
  const def = badge.definition;
  const [imgOk, setImgOk] = useState(true);
  const image = imgOk ? (def?.thumb ?? def?.image) : null;
  const name = def?.name || def?.d || "Badge";

  const Tag: React.ElementType = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className="group relative flex flex-col items-center gap-1.5 text-center"
      title={
        def?.description ||
        `${name} · por ${badge.issuer.slice(0, 10)}…${badge.issuer.slice(-4)}`
      }
    >
      <div className="relative aspect-square w-full rounded-xl overflow-hidden border border-border bg-gradient-to-br from-nostr/10 via-transparent to-bitcoin/5 group-hover:border-nostr/40 transition-colors">
        {image ? (
          <img
            src={image}
            alt={name}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgOk(false)}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-nostr">
            <Award className="h-6 w-6" />
          </div>
        )}
        <div className="absolute inset-0 pointer-events-none ring-1 ring-inset ring-white/5" />
      </div>
      <div className="text-[11px] font-semibold leading-tight line-clamp-2">
        {name}
      </div>
      <div className="text-[9px] font-mono text-foreground-subtle tabular-nums">
        {new Date(badge.awardedAt * 1000).toLocaleDateString("es-AR", {
          month: "short",
          year: "numeric",
        })}
      </div>
    </Tag>
  );
}
