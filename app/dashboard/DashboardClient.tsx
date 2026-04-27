"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import {
  Copy,
  Check,
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
  Pencil,
  Save,
  X,
  Plus,
  Trash2,
  ArrowDownUp,
  ArrowDown,
  ArrowUp,
} from "lucide-react";
import { useAuth, type Auth } from "@/lib/auth";
import {
  useNostrProfile,
  publishNostrProfile,
  DEFAULT_PROFILE_RELAYS,
  type NostrProfile as BaseNostrProfile,
} from "@/lib/nostrProfile";
import {
  useRelayList,
  publishRelayList,
  normalizeRelayUrl,
  SUGGESTED_RELAYS,
  type RelayEntry,
  type RelayMarker,
} from "@/lib/nostrRelays";
import {
  useUserBadges,
  useProfileBadges,
  type AwardedBadge,
  type ProfileBadges,
} from "@/lib/nostrBadges";
import { getSigner } from "@/lib/nostrSigner";
import {
  uploadToBlossom,
  fetchBlobWithProgress,
  DEFAULT_BLOSSOM_SERVERS,
  type UploadProgress,
} from "@/lib/blossom";
import { useToast } from "@/components/Toast";
import { useScrollLock } from "@/lib/useScrollLock";
import { cn } from "@/lib/cn";
import BadgesModal from "./BadgesModal";
import ImageCropModal, { type CropResult } from "@/components/ImageCropModal";
import {
  AvatarUploader,
  BannerUploader,
  type UploadReveal,
} from "@/components/ImageUploader";

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
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [relaysEditorOpen, setRelaysEditorOpen] = useState(false);

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
          wornBadges={wornBadges}
          onOpenBadges={() => setBadgesModalOpen(true)}
          onEditProfile={() => setProfileEditorOpen(true)}
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
            <RelaysCard
              pubkey={auth.pubkey}
              fallbackRelays={relaysUsed}
              onEdit={() => setRelaysEditorOpen(true)}
            />

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

      <ProfileEditorModal
        open={profileEditorOpen}
        onClose={() => setProfileEditorOpen(false)}
        auth={auth}
        current={baseProfile}
        relays={relays}
      />

      <RelaysEditorModal
        open={relaysEditorOpen}
        onClose={() => setRelaysEditorOpen(false)}
        auth={auth}
        publishRelays={relays}
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
  wornBadges,
  onOpenBadges,
  onEditProfile,
  hasAnyBadge,
}: {
  auth: Auth;
  profile: DashboardProfile | null;
  loading: boolean;
  wornBadges: AwardedBadge[];
  onOpenBadges: () => void;
  onEditProfile: () => void;
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
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={onEditProfile}
          className="block relative group rounded-2xl"
          aria-label="Editar perfil"
          title="Editar perfil"
        >
          <div className="relative h-32 w-32 sm:h-40 sm:w-40 rounded-2xl overflow-hidden border-4 border-background bg-background-card ring-1 ring-border-strong group-hover:ring-2 group-hover:ring-bitcoin/60 transition-all">
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
            {/* Hover overlay — hints that the whole tile is clickable */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/55 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="flex flex-col items-center gap-1 text-white">
                <Pencil className="h-5 w-5" />
                <span className="text-[10px] font-mono tracking-widest">
                  EDITAR
                </span>
              </div>
            </div>
          </div>
        </button>
      </div>

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
          <button
            type="button"
            onClick={onEditProfile}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border bg-white/[0.03] hover:bg-white/[0.08] hover:border-border-strong text-[10px] font-mono tracking-widest text-foreground-muted hover:text-foreground transition-colors"
            aria-label="Editar perfil"
          >
            <Pencil className="h-3 w-3" />
            EDITAR
          </button>
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
          ) : auth.method === "local" ? (
            <span className="inline-flex items-center gap-1 text-bitcoin">
              <Key className="h-3.5 w-3.5" />
              LOCAL
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
        <BadgeStrip badges={badges} onManage={onManage} />
      )}
    </div>
  );
}

/** Compact horizontal row of badge chips. Shows up to `MAX_VISIBLE` badges;
 *  the rest collapse into a "+N" overflow chip that opens the manage modal. */
function BadgeStrip({
  badges,
  onManage,
  maxVisible = 8,
}: {
  badges: AwardedBadge[];
  onManage: () => void;
  maxVisible?: number;
}) {
  const visible = badges.slice(0, maxVisible);
  const extra = badges.length - visible.length;
  return (
    <div className="flex flex-wrap gap-2">
      {visible.map((b) => (
        <CompactBadgeTile key={b.awardId} badge={b} onClick={onManage} />
      ))}
      {extra > 0 && (
        <button
          type="button"
          onClick={onManage}
          className="h-14 w-14 rounded-xl border border-dashed border-nostr/40 bg-nostr/5 hover:bg-nostr/10 hover:border-nostr/70 flex items-center justify-center text-[11px] font-mono font-bold tabular-nums text-nostr transition-colors"
          title={`Ver ${extra} badges más`}
          aria-label={`Ver ${extra} badges más`}
        >
          +{extra}
        </button>
      )}
    </div>
  );
}

function CompactBadgeTile({
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
  const date = new Date(badge.awardedAt * 1000).toLocaleDateString("es-AR", {
    month: "short",
    year: "numeric",
  });
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${name} · ${date}`}
      aria-label={name}
      className="relative h-14 w-14 rounded-xl overflow-hidden border border-border bg-gradient-to-br from-nostr/10 via-transparent to-bitcoin/5 hover:border-nostr/40 hover:-translate-y-0.5 transition-all shrink-0"
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
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
          <Award className="h-5 w-5" />
        </div>
      )}
      <div className="absolute inset-0 pointer-events-none ring-1 ring-inset ring-white/5" />
    </button>
  );
}

/**
 * Worn-badges strip.
 *
 * Flow:
 *  1. All badges render as skeletons stacked on the right side of the pill.
 *  2. Each image is preloaded via a hidden <img>; as it fires `onLoad` the
 *     badge hops to the left-stack (via Framer Motion `layoutId` tweens).
 *  3. Every badge selected for the profile is shown — no arbitrary slice.
 *
 * Size is doubled (h-6 → h-12) so the details of each badge are legible.
 */
function WornBadgesRow({
  badges,
  onOpen,
  empty,
}: {
  badges: AwardedBadge[];
  onOpen: () => void;
  empty: boolean;
}) {
  const [loadedIds, setLoadedIds] = useState<Set<string>>(new Set());
  const [brokenIds, setBrokenIds] = useState<Set<string>>(new Set());

  function markLoaded(id: string) {
    setLoadedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }
  function markBroken(id: string) {
    setBrokenIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    // Still "resolve" the badge so it doesn't sit in the skeleton column
    // forever — we'll render the fallback Award icon in the left stack.
    markLoaded(id);
  }

  // Mark badges without any image immediately as "loaded" (they show a
  // fallback icon so there's nothing to wait for).
  useEffect(() => {
    for (const b of badges) {
      const src = b.definition?.thumb ?? b.definition?.image;
      if (!src) markLoaded(b.awardId);
    }
  }, [badges]);

  if (empty) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="group inline-flex items-center gap-2 rounded-full border border-nostr/30 bg-nostr/5 px-3 py-1.5 hover:bg-nostr/10 hover:border-nostr/50 transition-colors"
        aria-label="Administrar badges"
      >
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-nostr">
          <Award className="h-3.5 w-3.5" />
          Usar badges en perfil
        </span>
      </button>
    );
  }

  const loaded = badges.filter((b) => loadedIds.has(b.awardId));
  const loading = badges.filter((b) => !loadedIds.has(b.awardId));

  return (
    <div className="relative">
      {/* Hidden preloaders — they trigger onLoad once the browser caches the
          blob, which is the signal to flip the chip into the loaded column. */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none overflow-hidden"
        style={{ width: 0, height: 0 }}
      >
        {badges.map((b) => {
          const src = b.definition?.thumb ?? b.definition?.image;
          if (!src || loadedIds.has(b.awardId)) return null;
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`preload-${b.awardId}`}
              src={src}
              alt=""
              referrerPolicy="no-referrer"
              onLoad={() => markLoaded(b.awardId)}
              onError={() => markBroken(b.awardId)}
            />
          );
        })}
      </div>

      <button
        type="button"
        onClick={onOpen}
        className="group inline-flex items-center gap-3 rounded-full border border-nostr/30 bg-nostr/5 px-2.5 py-2 hover:bg-nostr/10 hover:border-nostr/50 transition-colors"
        aria-label="Administrar badges"
      >
        <LayoutGroup>
          <div className="flex items-center gap-2">
            {/* Left stack — loaded badges */}
            <motion.div layout className="flex -space-x-3">
              <AnimatePresence initial={false}>
                {loaded.map((b) => (
                  <BadgePill
                    key={b.awardId}
                    badge={b}
                    state={brokenIds.has(b.awardId) ? "broken" : "loaded"}
                  />
                ))}
              </AnimatePresence>
            </motion.div>

            {/* Right stack — skeletons (still loading).
                Smaller gap because each pill is 25% size and `-space-x-3`
                would overlap them entirely. */}
            {loading.length > 0 && (
              <motion.div layout className="flex items-center gap-1">
                <AnimatePresence initial={false}>
                  {loading.map((b) => (
                    <BadgePill key={b.awardId} badge={b} state="loading" />
                  ))}
                </AnimatePresence>
              </motion.div>
            )}
          </div>
        </LayoutGroup>
      </button>
    </div>
  );
}

function BadgePill({
  badge,
  state,
}: {
  badge: AwardedBadge;
  state: "loading" | "loaded" | "broken";
}) {
  const def = badge.definition;
  const name = def?.name || def?.d || "Badge";
  const image = state === "loaded" ? (def?.thumb ?? def?.image) : null;
  // Two sizes: ~12px (25% of final) while fetching the image, 48px once the
  // badge has settled (loaded or irrecoverably broken). Framer's `layout`
  // handles the size transition; we tune the spring so the growth feels
  // *bouncy* when the image finally lands.
  const isSettled = state !== "loading";
  return (
    <motion.span
      layout
      layoutId={`worn-badge-${badge.awardId}`}
      initial={{ opacity: 0, scale: 0.4 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.4 }}
      transition={{
        // Bouncy when settling (the "pop" effect the user asked for).
        // Calmer spring otherwise so reorder / fresh-entry don't overshoot.
        layout: isSettled
          ? { type: "spring", damping: 11, stiffness: 220, mass: 0.9 }
          : { type: "spring", damping: 24, stiffness: 320 },
        default: { type: "spring", damping: 22, stiffness: 320 },
      }}
      className={cn(
        "relative rounded-full overflow-hidden ring-1 ring-nostr/30 bg-gradient-to-br from-nostr/30 to-bitcoin/15 shrink-0",
        isSettled
          ? "h-12 w-12 border-2 border-background-card"
          : "h-3 w-3 border border-background-card",
      )}
      title={name}
    >
      {image ? (
        <motion.img
          key="img"
          initial={{ opacity: 0, scale: 1.2 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          src={image}
          alt={name}
          className="absolute inset-0 w-full h-full object-cover"
          referrerPolicy="no-referrer"
          loading="lazy"
        />
      ) : state === "broken" ? (
        <span className="absolute inset-0 flex items-center justify-center text-nostr">
          <Award className="h-5 w-5" />
        </span>
      ) : (
        // Skeleton dot — shimmer only (no watermark icon at 12px, too busy)
        <span className="absolute inset-0 shimmer" />
      )}
    </motion.span>
  );
}

/* ──────────────────────── Profile editor modal ─────────────────────── */

type ProfileForm = {
  display_name: string;
  name: string;
  about: string;
  picture: string;
  banner: string;
  nip05: string;
  lud16: string;
  website: string;
};

function emptyProfileForm(): ProfileForm {
  return {
    display_name: "",
    name: "",
    about: "",
    picture: "",
    banner: "",
    nip05: "",
    lud16: "",
    website: "",
  };
}

function profileToForm(p: BaseNostrProfile | null): ProfileForm {
  if (!p) return emptyProfileForm();
  return {
    display_name: p.display_name ?? "",
    name: p.name ?? "",
    about: p.about ?? "",
    picture: p.picture ?? "",
    banner: p.banner ?? "",
    nip05: p.nip05 ?? "",
    lud16: p.lud16 ?? "",
    website: p.website ?? "",
  };
}

type Phase = "idle" | "uploading-avatar" | "uploading-banner" | "signing" | "publishing" | "done";

function ProfileEditorModal({
  open,
  onClose,
  auth,
  current,
  relays,
}: {
  open: boolean;
  onClose: () => void;
  auth: Auth;
  current: BaseNostrProfile | null;
  relays: string[];
}) {
  const { push: pushToast } = useToast();
  const [form, setForm] = useState<ProfileForm>(() => profileToForm(current));
  const [phase, setPhase] = useState<Phase>("idle");
  const [phaseDetail, setPhaseDetail] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<{
    target: "picture" | "banner" | null;
    server: string;
    state: UploadProgress["state"];
    error?: string;
  }>({ target: null, server: "", state: "ok" });
  const [error, setError] = useState<string | null>(null);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  // The file picker feeds into a crop step first — we open the crop modal
  // with the selected file + target aspect, and only after the user
  // confirms the crop do we actually hit Blossom.
  const [cropSource, setCropSource] = useState<{
    target: "picture" | "banner";
    file: File;
  } | null>(null);

  // Live upload overlay: while bytes are flying to Blossom we show the
  // local cropped blob progressively revealing the preview L→R using the
  // real upload percent. Once the upload finishes we fade the overlay out
  // (so the swap to the remote URL never flashes), then unmount.
  const [uploadReveal, setUploadReveal] = useState<{
    target: "picture" | "banner";
    localUrl: string;
    /** 0..100 */
    percent: number;
    /** When true the overlay fades to opacity 0 via CSS transition
     *  instead of just unmounting instantly. */
    fading?: boolean;
  } | null>(null);

  // Ref mirror of cropSource so side-effect callbacks (handleCropConfirm)
  // can read the latest value without relying on functional setter
  // closures — which get double-invoked under React Strict Mode, causing
  // `doUpload` to fire twice and clobber its own cleanup.
  const cropSourceRef = useRef(cropSource);
  useEffect(() => {
    cropSourceRef.current = cropSource;
  }, [cropSource]);

  useScrollLock(open);

  // Re-hydrate the form from current profile every time the modal opens.
  useEffect(() => {
    if (!open) return;
    setForm(profileToForm(current));
    setPhase("idle");
    setPhaseDetail(null);
    setError(null);
    setUploadState({ target: null, server: "", state: "ok" });
  }, [open, current]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && phase === "idle") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, phase]);

  // Belt-and-suspenders: if the modal unmounts mid-upload, make sure we
  // don't leak the blob URL used for the live reveal.
  useEffect(() => {
    return () => {
      setUploadReveal((prev) => {
        if (prev) URL.revokeObjectURL(prev.localUrl);
        return null;
      });
    };
  }, []);

  const busy = phase !== "idle";

  function pickedFile(target: "picture" | "banner", file: File) {
    if (!file.type.startsWith("image/")) {
      pushToast({
        kind: "error",
        title: "Archivo inválido",
        description: "Solo imágenes (JPG, PNG, WebP, GIF).",
      });
      return;
    }
    // Open the crop modal; actual upload happens in onConfirm below.
    setCropSource({ target, file });
  }

  function handleCropConfirm(result: CropResult) {
    const current = cropSourceRef.current;
    setCropSource(null);
    if (!current) return;
    const cropped = new File([result.blob], result.filename, {
      type: result.type,
    });
    doUpload(current.target, cropped);
  }

  async function doUpload(target: "picture" | "banner", file: File) {
    setError(null);
    setPhase(target === "picture" ? "uploading-avatar" : "uploading-banner");
    setPhaseDetail("firmando autorización Blossom…");
    setUploadState({
      target,
      server: DEFAULT_BLOSSOM_SERVERS[0],
      state: "signing",
    });
    // Kick off the live-reveal overlay: the cropped blob is available
    // locally immediately, so we can start showing it at percent=0 before
    // a single byte has left the browser.
    const localUrl = URL.createObjectURL(file);
    setUploadReveal({ target, localUrl, percent: 0 });
    let signer: Awaited<ReturnType<typeof getSigner>> | null = null;
    try {
      signer = await getSigner(auth, {
        onAuthUrl: (url) => {
          pushToast({
            kind: "info",
            title: "Autorizá la firma en tu bunker",
            description: url,
            duration: 20000,
          });
          try {
            window.open(url, "_blank", "noopener,noreferrer");
          } catch {
            /* popup blocked */
          }
        },
      });
      // The reveal bar represents the full "image is ready" experience:
      //   · 0–65%  = bytes being uploaded to Blossom (real XHR progress)
      //   · 65–100 = bytes being downloaded back from the CDN so the
      //              preview has actually landed on the user's browser
      // Splitting it this way means the user sees one continuous sweep
      // from crop → visible-remote image.
      const UPLOAD_SHARE = 65;
      const desc = await uploadToBlossom(file, signer, {
        onProgress: (p) => {
          setUploadState({ target, ...p });
          if (p.state === "uploading") {
            setPhaseDetail(`subiendo a ${p.server.replace("https://", "")}`);
            if (typeof p.percent === "number") {
              setUploadReveal((prev) =>
                prev && prev.target === target
                  ? {
                      ...prev,
                      percent: Math.min(
                        UPLOAD_SHARE,
                        Math.round(p.percent! * UPLOAD_SHARE),
                      ),
                    }
                  : prev,
              );
            }
          } else if (p.state === "error") {
            setPhaseDetail(
              `falló ${p.server.replace("https://", "")}, probando siguiente…`,
            );
          }
        },
      });
      // Upload phase done — pin the reveal to the hand-off line.
      setUploadReveal((prev) =>
        prev && prev.target === target
          ? { ...prev, percent: UPLOAD_SHARE }
          : prev,
      );
      setPhaseDetail(
        `bajando desde ${desc.server.replace("https://", "")}…`,
      );
      setUploadState({
        target,
        server: desc.server,
        state: "uploading",
      });

      // Phase 2: fetch the remote blob so progress reflects real wait time.
      // Best-effort — if the server blocks CORS or the connection hiccups
      // we still treat the upload as a success (the URL is published
      // either way). The HTTP cache warms up during this phase, so when
      // the preview `<img>` switches to the remote URL right after, it
      // renders instantly with no flicker.
      try {
        await fetchBlobWithProgress(desc.url, (p) => {
          if (typeof p.percent === "number") {
            const ui =
              UPLOAD_SHARE + Math.round(p.percent * (100 - UPLOAD_SHARE));
            setUploadReveal((prev) =>
              prev && prev.target === target
                ? { ...prev, percent: ui }
                : prev,
            );
          }
        });
      } catch (e) {
        console.warn("[labs] remote image download progress failed", e);
      }

      // Snap to 100% so the reveal visibly completes even if we bailed
      // out of the fetch progress early. The overlay is now fully
      // covering the preview (clip-path inset = 0 on all sides).
      setUploadReveal((prev) =>
        prev && prev.target === target ? { ...prev, percent: 100 } : prev,
      );

      // Pre-decode the remote URL into an <img> before we swap the form's
      // src so the swap lands on already-painted pixels (no flash of
      // the previous image while the new one loads). The HTTP cache was
      // primed by the fetch above, so this usually resolves in a few ms.
      await new Promise<void>((resolve) => {
        const pre = new Image();
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        pre.onload = done;
        pre.onerror = done;
        // Fail-safe: don't hang forever if the decode stalls.
        window.setTimeout(done, 4000);
        pre.src = desc.url;
      });

      setForm((prev) => ({ ...prev, [target]: desc.url }));
      pushToast({
        kind: "success",
        title:
          target === "picture" ? "Avatar subido" : "Banner subido",
        description: `Guardado en ${desc.server.replace("https://", "")}.`,
      });

      // Give React one commit + the browser a beat to paint the new
      // `<img src>` under the overlay, then start a CSS opacity fade.
      // This sequence guarantees no "flash of old image" during swap:
      //   · overlay at percent=100 covers everything
      //   · setForm swaps the bg <img> src (preloaded, so instant)
      //   · overlay fades opacity 1→0 over 350ms
      //   · at the end we unmount
      await new Promise<void>((res) => window.setTimeout(res, 80));
      setUploadReveal((prev) =>
        prev && prev.target === target ? { ...prev, fading: true } : prev,
      );
      await new Promise<void>((res) => window.setTimeout(res, 380));
      setUploadReveal((prev) =>
        prev && prev.target === target ? null : prev,
      );
      URL.revokeObjectURL(localUrl);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      pushToast({
        kind: "error",
        title: "No se pudo subir la imagen",
        description: msg.split("\n")[0],
        duration: 12000,
      });
      setUploadReveal((prev) =>
        prev && prev.target === target ? null : prev,
      );
      URL.revokeObjectURL(localUrl);
    } finally {
      signer?.close?.().catch(() => {});
      setPhase("idle");
      setPhaseDetail(null);
    }
  }

  function pickFile(target: "picture" | "banner") {
    const ref = target === "picture" ? avatarInputRef : bannerInputRef;
    ref.current?.click();
  }

  async function handleSave() {
    setError(null);
    setPhase("signing");
    setPhaseDetail(null);
    let signer: Awaited<ReturnType<typeof getSigner>> | null = null;
    try {
      signer = await getSigner(auth, {
        onAuthUrl: (url) => {
          pushToast({
            kind: "info",
            title: "Autorizá la firma en tu bunker",
            description: url,
            duration: 20000,
          });
          try {
            window.open(url, "_blank", "noopener,noreferrer");
          } catch {
            /* popup blocked */
          }
        },
      });
      setPhase("publishing");
      setPhaseDetail(`${relays.length} relays`);
      const res = await publishNostrProfile(signer, form, relays);
      const okCount = res.relays.filter((r) => r.ok).length;
      setPhase("done");
      setPhaseDetail(`${okCount}/${res.relays.length} relays`);
      pushToast({
        kind: "success",
        title: "Perfil actualizado",
        description: `Publicado en ${okCount}/${res.relays.length} relays.`,
      });
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      pushToast({
        kind: "error",
        title: "No se pudo guardar el perfil",
        description: msg.split("\n")[0],
        duration: 12000,
      });
    } finally {
      signer?.close?.().catch(() => {});
      setPhase("idle");
      setPhaseDetail(null);
    }
  }

  const saveLabel =
    phase === "signing"
      ? "Esperando firma…"
      : phase === "publishing"
        ? `Publicando${phaseDetail ? ` en ${phaseDetail}` : "…"}`
        : phase === "uploading-avatar"
          ? "Subiendo avatar…"
          : phase === "uploading-banner"
            ? "Subiendo banner…"
            : phase === "done"
              ? `Publicado ${phaseDetail ?? ""}`
              : "Guardar";

  return (
    <>
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !busy && onClose()}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative w-full max-w-xl glass-strong rounded-2xl border border-border-strong overflow-hidden"
          >
            <div className="absolute -top-px left-1/2 -translate-x-1/2 w-[40%] h-px bg-gradient-to-r from-transparent via-bitcoin to-transparent" />

            <div className="relative px-6 pt-6 pb-5 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="font-display font-bold text-xl">Editar perfil</h2>
                <p className="text-xs text-foreground-muted mt-0.5">
                  Kind:0 firmado y replicado en {relays.length} relays · imágenes
                  en Blossom
                </p>
              </div>
              <button
                type="button"
                onClick={() => !busy && onClose()}
                disabled={busy}
                className="p-2 rounded-lg text-foreground-muted hover:text-foreground hover:bg-white/5 transition-colors disabled:opacity-50"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="relative max-h-[70vh] overflow-y-auto">
              {/* Banner upload area */}
              <BannerUploader
                src={form.banner}
                uploading={phase === "uploading-banner"}
                disabled={busy}
                onPick={() => pickFile("banner")}
                reveal={
                  uploadReveal?.target === "banner"
                    ? {
                        localUrl: uploadReveal.localUrl,
                        percent: uploadReveal.percent,
                        fading: uploadReveal.fading,
                      }
                    : null
                }
              />
              <input
                ref={bannerInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.currentTarget.value = "";
                  if (file) pickedFile("banner", file);
                }}
              />

              <div className="px-6 py-5 space-y-4">
                {/* Avatar upload */}
                <div className="flex items-start gap-4 -mt-16 relative z-10">
                  <AvatarUploader
                    src={form.picture}
                    name={
                      form.display_name || form.name || shorten(auth.pubkey)
                    }
                    uploading={phase === "uploading-avatar"}
                    disabled={busy}
                    onPick={() => pickFile("picture")}
                    reveal={
                      uploadReveal?.target === "picture"
                        ? {
                            localUrl: uploadReveal.localUrl,
                            percent: uploadReveal.percent,
                            fading: uploadReveal.fading,
                          }
                        : null
                    }
                  />

                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.currentTarget.value = "";
                      if (file) pickedFile("picture", file);
                    }}
                  />
                  <div className="flex-1 pt-6">
                    {uploadState.target && uploadState.state !== "ok" && (
                      <div className="text-[10px] font-mono text-foreground-subtle">
                        {uploadState.state === "signing"
                          ? "firmando autorización…"
                          : uploadState.state === "uploading"
                            ? `subiendo a ${uploadState.server.replace("https://", "")}`
                            : uploadState.state === "error"
                              ? `✗ ${uploadState.server.replace("https://", "")}: ${uploadState.error?.slice(0, 80)}`
                              : ""}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <TextField
                    label="Nombre"
                    value={form.display_name}
                    onChange={(v) =>
                      setForm((p) => ({ ...p, display_name: v }))
                    }
                    placeholder="Satoshi N."
                    disabled={busy}
                  />
                  <TextField
                    label="Handle"
                    hint="para @menciones"
                    value={form.name}
                    onChange={(v) => setForm((p) => ({ ...p, name: v }))}
                    placeholder="satoshi"
                    disabled={busy}
                  />
                </div>

                <TextField
                  label="Bio"
                  value={form.about}
                  onChange={(v) => setForm((p) => ({ ...p, about: v }))}
                  placeholder="Construyendo sobre Bitcoin, Lightning y Nostr…"
                  disabled={busy}
                  multiline
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <TextField
                    label="NIP-05"
                    value={form.nip05}
                    onChange={(v) => setForm((p) => ({ ...p, nip05: v }))}
                    placeholder="vos@dominio.com"
                    disabled={busy}
                    mono
                  />
                  <TextField
                    label="Lightning"
                    value={form.lud16}
                    onChange={(v) => setForm((p) => ({ ...p, lud16: v }))}
                    placeholder="vos@getalby.com"
                    disabled={busy}
                    mono
                  />
                </div>

                <TextField
                  label="Sitio web"
                  value={form.website}
                  onChange={(v) => setForm((p) => ({ ...p, website: v }))}
                  placeholder="https://…"
                  disabled={busy}
                  mono
                />

                <details className="rounded-lg border border-border bg-white/[0.02] overflow-hidden">
                  <summary className="px-3 py-2 text-[11px] font-mono uppercase tracking-widest text-foreground-muted cursor-pointer hover:bg-white/[0.04]">
                    URLs avanzadas
                  </summary>
                  <div className="px-3 py-3 border-t border-border space-y-3">
                    <TextField
                      label="Avatar (URL)"
                      value={form.picture}
                      onChange={(v) => setForm((p) => ({ ...p, picture: v }))}
                      placeholder="https://…"
                      disabled={busy}
                      mono
                    />
                    <TextField
                      label="Banner (URL)"
                      value={form.banner}
                      onChange={(v) => setForm((p) => ({ ...p, banner: v }))}
                      placeholder="https://…"
                      disabled={busy}
                      mono
                    />
                  </div>
                </details>

                {error && (
                  <div className="rounded-lg bg-danger/10 border border-danger/30 px-3 py-2 text-xs text-danger">
                    {error.split("\n")[0]}
                  </div>
                )}
              </div>
            </div>

            <div className="relative px-6 py-4 bg-black/30 border-t border-border flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-foreground-muted hover:text-foreground hover:bg-white/5 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={busy}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-bitcoin to-yellow-500 text-black disabled:opacity-70 disabled:cursor-progress"
              >
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {saveLabel}
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Guardar
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    {/* Sibling to the outer AnimatePresence, not a child. Only mount the
        crop modal while we actually have a source file — keeps Framer's
        internal AnimatePresence from ever getting stuck in a stale
        "present but opacity:0" state between uploads. */}
    {cropSource && (
      <ImageCropModal
        key={cropSource.target}
        open
        file={cropSource.file}
        aspect={cropSource.target === "banner" ? 3 : 1}
        title={
          cropSource.target === "banner"
            ? "Recortar banner"
            : "Recortar avatar"
        }
        hint={cropSource.target === "banner" ? "Banner 3:1" : "Avatar 1:1"}
        maxOutputPx={cropSource.target === "banner" ? 1500 : 1024}
        outputType="image/jpeg"
        onConfirm={handleCropConfirm}
        onCancel={() => setCropSource(null)}
      />
    )}
    </>
  );
}


function TextField({
  label,
  hint,
  value,
  onChange,
  placeholder,
  disabled,
  multiline,
  mono,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  multiline?: boolean;
  mono?: boolean;
}) {
  const inputClass = cn(
    "w-full px-3 py-2.5 rounded-lg bg-white/[0.03] border border-border focus:border-bitcoin/50 focus:bg-white/[0.05] transition-colors text-sm placeholder:text-foreground-subtle",
    mono && "font-mono",
    multiline && "resize-none",
  );
  return (
    <label className="block">
      <span className="flex items-center justify-between text-xs font-medium text-foreground-muted mb-1.5">
        <span>{label}</span>
        {hint && (
          <span className="text-[10px] text-foreground-subtle">{hint}</span>
        )}
      </span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          rows={3}
          className={inputClass}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          spellCheck={false}
          className={inputClass}
        />
      )}
    </label>
  );
}

/* ───────────────────────── Relays card + editor ───────────────────────── */

function RelaysCard({
  pubkey,
  fallbackRelays,
  onEdit,
}: {
  pubkey: string;
  fallbackRelays: string[];
  onEdit: () => void;
}) {
  const { entries, loading, hasPublished } = useRelayList(pubkey);
  const showEntries: RelayEntry[] =
    entries.length > 0
      ? entries
      : fallbackRelays.map((url) => ({ url, marker: "both" as RelayMarker }));

  return (
    <div className="rounded-2xl border border-border bg-background-card p-5">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-foreground-muted">
            <Radio className="h-4 w-4" />
          </span>
          <h2 className="font-display font-bold text-sm uppercase tracking-widest text-foreground-muted">
            Relays
          </h2>
          <span
            className={cn(
              "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-mono tracking-wider whitespace-nowrap",
              hasPublished
                ? "bg-nostr/10 border-nostr/30 text-nostr"
                : "bg-white/5 border-border text-foreground-subtle",
            )}
          >
            {hasPublished ? "NIP-65" : "sin NIP-65"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {loading && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-foreground-muted" />
          )}
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-white/[0.03] hover:bg-white/[0.06] text-xs font-semibold transition-colors"
            aria-label="Editar relays"
          >
            <Pencil className="h-3.5 w-3.5" />
            Editar
          </button>
        </div>
      </div>

      {showEntries.length === 0 ? (
        <div className="text-xs text-foreground-subtle py-2">Conectando…</div>
      ) : (
        <ul className="space-y-1.5">
          {showEntries.map((e) => (
            <li
              key={e.url}
              className="flex items-center gap-2 text-xs font-mono text-foreground-muted"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-success shrink-0" />
              <span className="truncate flex-1">
                {e.url.replace(/^wss?:\/\//, "")}
              </span>
              <RelayMarkerPill marker={e.marker} />
            </li>
          ))}
        </ul>
      )}

      {!hasPublished && (
        <p className="mt-3 text-[10px] font-mono text-foreground-subtle leading-relaxed">
          Aún no publicaste tu lista de relays (NIP-65). Editala para que otros
          clientes sepan dónde escribirte.
        </p>
      )}
    </div>
  );
}

function RelayMarkerPill({ marker }: { marker: RelayMarker }) {
  if (marker === "both") {
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white/5 border border-border text-[9px] font-mono tracking-wider text-foreground-subtle">
        <ArrowDownUp className="h-2.5 w-2.5" />
        R/W
      </span>
    );
  }
  if (marker === "read") {
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-cyan/10 border border-cyan/30 text-[9px] font-mono tracking-wider text-cyan">
        <ArrowDown className="h-2.5 w-2.5" />
        READ
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-bitcoin/10 border border-bitcoin/30 text-[9px] font-mono tracking-wider text-bitcoin">
      <ArrowUp className="h-2.5 w-2.5" />
      WRITE
    </span>
  );
}

type RelayRow = {
  key: string;
  url: string;
  read: boolean;
  write: boolean;
};

function newRelayKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function entriesToRows(entries: RelayEntry[]): RelayRow[] {
  return entries.map((e) => ({
    key: newRelayKey(),
    url: e.url,
    read: e.marker !== "write",
    write: e.marker !== "read",
  }));
}

function rowsToEntries(rows: RelayRow[]): RelayEntry[] {
  const out: RelayEntry[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const url = normalizeRelayUrl(r.url);
    if (!url || seen.has(url)) continue;
    if (!r.read && !r.write) continue; // ignore all-off rows
    seen.add(url);
    const marker: RelayMarker =
      r.read && r.write ? "both" : r.read ? "read" : "write";
    out.push({ url, marker });
  }
  return out;
}

function RelaysEditorModal({
  open,
  onClose,
  auth,
  publishRelays,
}: {
  open: boolean;
  onClose: () => void;
  auth: Auth;
  publishRelays: string[];
}) {
  const { push: pushToast } = useToast();
  const { entries } = useRelayList(auth.pubkey);
  const [rows, setRows] = useState<RelayRow[]>([]);
  const [draft, setDraft] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [phase, setPhase] = useState<
    "idle" | "signing" | "publishing" | "done"
  >("idle");
  const [phaseDetail, setPhaseDetail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useScrollLock(open);

  // Hydrate once on each open transition (false → true). We deliberately
  // don't depend on `entries` so that a background refresh landing while
  // the modal is open won't clobber the user's in-progress edits.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!open) {
      hydratedRef.current = false;
      return;
    }
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    if (entries.length > 0) {
      setRows(entriesToRows(entries));
    } else {
      setRows(
        SUGGESTED_RELAYS.slice(0, 5).map((url) => ({
          key: newRelayKey(),
          url,
          read: true,
          write: true,
        })),
      );
    }
    setDraft("");
    setPhase("idle");
    setPhaseDetail(null);
    setError(null);
  }, [open, entries]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !publishing) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, publishing]);

  function updateRow(i: number, patch: Partial<RelayRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }
  function addFromDraft() {
    const url = normalizeRelayUrl(draft);
    if (!url) {
      setError(`"${draft}" no parece una URL wss válida.`);
      return;
    }
    if (rows.some((r) => normalizeRelayUrl(r.url) === url)) {
      setError("Ese relay ya está en la lista.");
      return;
    }
    setRows((prev) => [
      ...prev,
      { key: newRelayKey(), url, read: true, write: true },
    ]);
    setDraft("");
    setError(null);
  }

  async function handleSave() {
    const entries = rowsToEntries(rows);
    if (entries.length === 0) {
      setError("Agregá al menos un relay con read o write activo.");
      return;
    }
    setError(null);
    setPublishing(true);
    setPhase("signing");
    setPhaseDetail(null);
    let signer: Awaited<ReturnType<typeof getSigner>> | null = null;
    try {
      signer = await getSigner(auth, {
        onAuthUrl: (url) => {
          pushToast({
            kind: "info",
            title: "Autorizá la firma en tu bunker",
            description: url,
            duration: 20000,
          });
          try {
            window.open(url, "_blank", "noopener,noreferrer");
          } catch {
            /* popup blocked */
          }
        },
      });
      // Broadcast the new list to the user's *current* publish relays plus
      // the write-capable relays in the fresh list — so discovery relays
      // pick up the change even if the user is pruning their list.
      const writeUrls = entries
        .filter((e) => e.marker !== "read")
        .map((e) => e.url);
      const relaysToBroadcast = Array.from(
        new Set([...publishRelays, ...writeUrls]),
      );
      setPhase("publishing");
      setPhaseDetail(`${relaysToBroadcast.length} relays`);
      const res = await publishRelayList(signer, entries, relaysToBroadcast);
      const okCount = res.relays.filter((r) => r.ok).length;
      setPhase("done");
      setPhaseDetail(`${okCount}/${res.relays.length} relays`);
      pushToast({
        kind: "success",
        title: "Lista de relays actualizada",
        description: `NIP-65 publicado en ${okCount}/${res.relays.length} relays.`,
      });
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      pushToast({
        kind: "error",
        title: "No se pudo guardar la lista",
        description: msg.split("\n")[0],
        duration: 12000,
      });
    } finally {
      signer?.close?.().catch(() => {});
      setPublishing(false);
      setPhase("idle");
      setPhaseDetail(null);
    }
  }

  const saveLabel =
    phase === "signing"
      ? "Esperando firma…"
      : phase === "publishing"
        ? `Publicando${phaseDetail ? ` en ${phaseDetail}` : "…"}`
        : phase === "done"
          ? `Publicado ${phaseDetail ?? ""}`
          : "Guardar";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !publishing && onClose()}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative w-full max-w-lg glass-strong rounded-2xl border border-border-strong overflow-hidden"
          >
            <div className="absolute -top-px left-1/2 -translate-x-1/2 w-[40%] h-px bg-gradient-to-r from-transparent via-nostr to-transparent" />

            <div className="relative px-6 pt-6 pb-5 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="font-display font-bold text-xl">
                  Editar relays
                </h2>
                <p className="text-xs text-foreground-muted mt-0.5">
                  NIP-65 (kind:10002) · marcá qué relays usás para leer o
                  escribir
                </p>
              </div>
              <button
                type="button"
                onClick={() => !publishing && onClose()}
                disabled={publishing}
                className="p-2 rounded-lg text-foreground-muted hover:text-foreground hover:bg-white/5 transition-colors disabled:opacity-50"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="relative px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
              <div className="space-y-2">
                {rows.length === 0 && (
                  <div className="text-xs text-foreground-subtle py-3 text-center rounded-lg border border-dashed border-border">
                    Sin relays. Agregá al menos uno abajo.
                  </div>
                )}
                {rows.map((row, i) => (
                  <div
                    key={row.key}
                    className="flex items-center gap-2 rounded-lg border border-border bg-white/[0.02] px-2 py-1.5"
                  >
                    <input
                      type="text"
                      value={row.url}
                      onChange={(e) => updateRow(i, { url: e.target.value })}
                      disabled={publishing}
                      spellCheck={false}
                      autoComplete="off"
                      placeholder="wss://relay.example.com"
                      className="flex-1 min-w-0 px-2 py-1.5 rounded bg-transparent border border-transparent focus:border-bitcoin/40 focus:bg-white/[0.03] text-xs font-mono"
                    />
                    <MarkerToggle
                      label="READ"
                      icon={<ArrowDown className="h-3 w-3" />}
                      active={row.read}
                      accent="cyan"
                      disabled={publishing}
                      onToggle={() => updateRow(i, { read: !row.read })}
                    />
                    <MarkerToggle
                      label="WRITE"
                      icon={<ArrowUp className="h-3 w-3" />}
                      active={row.write}
                      accent="bitcoin"
                      disabled={publishing}
                      onToggle={() => updateRow(i, { write: !row.write })}
                    />
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      disabled={publishing}
                      className="p-1.5 rounded text-foreground-subtle hover:text-danger hover:bg-danger/10 disabled:opacity-30 transition-colors shrink-0"
                      aria-label="Quitar relay"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    if (error) setError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addFromDraft();
                    }
                  }}
                  disabled={publishing}
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="wss://relay.example.com"
                  className="flex-1 px-3 py-2 rounded-lg bg-white/[0.03] border border-border focus:border-bitcoin/50 focus:bg-white/[0.05] transition-colors text-xs font-mono placeholder:text-foreground-subtle"
                />
                <button
                  type="button"
                  onClick={addFromDraft}
                  disabled={publishing || !draft.trim()}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-border bg-white/[0.03] hover:bg-white/[0.06] text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Agregar
                </button>
              </div>

              {error && (
                <div className="rounded-lg bg-danger/10 border border-danger/30 px-3 py-2 text-xs text-danger">
                  {error.split("\n")[0]}
                </div>
              )}

              <SuggestedRelays
                alreadyIn={new Set(
                  rows
                    .map((r) => normalizeRelayUrl(r.url))
                    .filter((u): u is string => !!u),
                )}
                disabled={publishing}
                onAdd={(url) =>
                  setRows((prev) => [
                    ...prev,
                    { key: newRelayKey(), url, read: true, write: true },
                  ])
                }
              />
            </div>

            <div className="relative px-6 py-4 bg-black/30 border-t border-border flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={publishing}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-foreground-muted hover:text-foreground hover:bg-white/5 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={publishing || rows.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-nostr to-cyan text-white disabled:opacity-70 disabled:cursor-progress"
              >
                {publishing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {saveLabel}
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Guardar
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function MarkerToggle({
  label,
  icon,
  active,
  accent,
  disabled,
  onToggle,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  accent: "cyan" | "bitcoin";
  disabled?: boolean;
  onToggle: () => void;
}) {
  const accentClass =
    accent === "cyan"
      ? active
        ? "bg-cyan/15 border-cyan/40 text-cyan"
        : "bg-white/[0.02] border-border text-foreground-subtle hover:border-cyan/30 hover:text-cyan/70"
      : active
        ? "bg-bitcoin/15 border-bitcoin/40 text-bitcoin"
        : "bg-white/[0.02] border-border text-foreground-subtle hover:border-bitcoin/30 hover:text-bitcoin/70";
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-0.5 px-1.5 py-1 rounded border text-[9px] font-mono tracking-wider transition-colors disabled:opacity-50",
        accentClass,
      )}
      aria-pressed={active}
      aria-label={`${label} ${active ? "on" : "off"}`}
    >
      {icon}
      {label}
    </button>
  );
}

function SuggestedRelays({
  alreadyIn,
  onAdd,
  disabled,
}: {
  alreadyIn: Set<string>;
  onAdd: (url: string) => void;
  disabled?: boolean;
}) {
  const candidates = SUGGESTED_RELAYS.filter(
    (url) => !alreadyIn.has(url),
  ).slice(0, 8);
  if (candidates.length === 0) return null;
  return (
    <div>
      <div className="text-[10px] font-mono uppercase tracking-widest text-foreground-subtle mb-2">
        Sugeridos
      </div>
      <div className="flex flex-wrap gap-1.5">
        {candidates.map((url) => (
          <button
            key={url}
            type="button"
            onClick={() => onAdd(url)}
            disabled={disabled}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border bg-white/[0.02] hover:bg-white/[0.05] hover:border-border-strong text-[10px] font-mono text-foreground-muted transition-colors disabled:opacity-50"
          >
            <Plus className="h-2.5 w-2.5" />
            {url.replace(/^wss?:\/\//, "")}
          </button>
        ))}
      </div>
    </div>
  );
}
