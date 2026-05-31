"use client";

import type { ComponentType } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Award,
  BadgeCheck,
  Brush,
  CheckCircle2,
  Flame,
  Gem,
  Heart,
  Loader2,
  Medal,
  Mic2,
  Rocket,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Trophy,
  UploadCloud,
  XCircle,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useAuth } from "@/lib/auth";
import { getSigner } from "@/lib/nostrSigner";
import {
  DEFAULT_HACKATHON_BADGES,
  type HackathonBadgeCatalog,
  type HackathonBadgeCatalogBadge,
  type HackathonBadgeCategoryId,
  type HackathonBadgeTone,
} from "@/lib/hackathonBadges";
import {
  fetchLacryptaBadgePubkeys,
  fetchHackathonBadgeCatalog,
  publishSignedEventsToRelays,
  requestBadgeBootstrap,
} from "@/lib/hackathonBadgeClient";

type CatalogState =
  | { status: "loading"; catalog: null; error: null }
  | { status: "missing"; catalog: null; error: null }
  | { status: "ready"; catalog: HackathonBadgeCatalog; error: null }
  | { status: "error"; catalog: null; error: string };

type BootstrapState =
  | { phase: "idle"; message: string; ok: number; total: number }
  | { phase: "signing"; message: string; ok: number; total: number }
  | { phase: "generating"; message: string; ok: number; total: number }
  | { phase: "publishing"; message: string; ok: number; total: number }
  | { phase: "done"; message: string; ok: number; total: number }
  | { phase: "error"; message: string; ok: number; total: number };

const GROUP_ORDER: HackathonBadgeCategoryId[] = [
  "ranking",
  "favorites",
  "specials",
  "streaks",
];

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  award: Award,
  brush: Brush,
  flame: Flame,
  gem: Gem,
  heart: Heart,
  medal: Medal,
  mic: Mic2,
  rocket: Rocket,
  send: Send,
  "shield-check": ShieldCheck,
  sparkles: Sparkles,
  star: Star,
  trophy: Trophy,
};

const TONE_STYLE: Record<
  HackathonBadgeTone,
  {
    ring: string;
    icon: string;
    glow: string;
    chip: string;
    preview: string;
  }
> = {
  gold: {
    ring: "border-yellow-300/45 bg-yellow-300/10",
    icon: "text-yellow-200",
    glow: "bg-yellow-300/20",
    chip: "border-yellow-300/35 bg-yellow-300/10 text-yellow-100",
    preview: "from-yellow-200 via-bitcoin to-yellow-600",
  },
  silver: {
    ring: "border-slate-200/35 bg-slate-200/10",
    icon: "text-slate-100",
    glow: "bg-slate-200/15",
    chip: "border-slate-200/30 bg-slate-200/10 text-slate-100",
    preview: "from-slate-100 via-slate-300 to-slate-500",
  },
  bronze: {
    ring: "border-orange-400/40 bg-orange-400/10",
    icon: "text-orange-200",
    glow: "bg-orange-400/18",
    chip: "border-orange-400/30 bg-orange-400/10 text-orange-100",
    preview: "from-orange-200 via-orange-500 to-amber-800",
  },
  bitcoin: {
    ring: "border-bitcoin/40 bg-bitcoin/10",
    icon: "text-bitcoin",
    glow: "bg-bitcoin/20",
    chip: "border-bitcoin/30 bg-bitcoin/10 text-bitcoin",
    preview: "from-bitcoin via-lightning to-yellow-300",
  },
  nostr: {
    ring: "border-nostr/40 bg-nostr/10",
    icon: "text-nostr",
    glow: "bg-nostr/20",
    chip: "border-nostr/30 bg-nostr/10 text-nostr",
    preview: "from-nostr via-fuchsia-400 to-cyan",
  },
  cyan: {
    ring: "border-cyan/40 bg-cyan/10",
    icon: "text-cyan",
    glow: "bg-cyan/20",
    chip: "border-cyan/30 bg-cyan/10 text-cyan",
    preview: "from-cyan via-sky-300 to-nostr",
  },
  success: {
    ring: "border-success/40 bg-success/10",
    icon: "text-success",
    glow: "bg-success/20",
    chip: "border-success/30 bg-success/10 text-success",
    preview: "from-success via-emerald-300 to-cyan",
  },
  pink: {
    ring: "border-pink-400/40 bg-pink-400/10",
    icon: "text-pink-300",
    glow: "bg-pink-400/20",
    chip: "border-pink-400/30 bg-pink-400/10 text-pink-200",
    preview: "from-pink-300 via-rose-400 to-bitcoin",
  },
};

export default function HackathonBadgesClient({
  hackathonId,
  hackathonName,
}: {
  hackathonId: string;
  hackathonName: string;
}) {
  const { auth, signerReady } = useAuth();
  const [adminPubkey, setAdminPubkey] = useState("");
  const [publisherPubkey, setPublisherPubkey] = useState("");
  const [state, setState] = useState<CatalogState>({
    status: "loading",
    catalog: null,
    error: null,
  });
  const [bootstrap, setBootstrap] = useState<BootstrapState>({
    phase: "idle",
    message: "",
    ok: 0,
    total: 0,
  });

  const isAdmin = !!auth && !!adminPubkey && auth.pubkey === adminPubkey;
  const hasConfiguredAdmin = !!adminPubkey;
  const hasPublisher = !!publisherPubkey;
  const adminMismatch = !!auth && hasConfiguredAdmin && auth.pubkey !== adminPubkey;
  const busy = ["signing", "generating", "publishing"].includes(bootstrap.phase);

  async function loadCatalog() {
    setState({ status: "loading", catalog: null, error: null });
    try {
      const keys = await fetchLacryptaBadgePubkeys();
      setAdminPubkey(keys.adminPubkey);
      setPublisherPubkey(keys.publisherPubkey);
      const found = await fetchHackathonBadgeCatalog(
        hackathonId,
        keys.publisherPubkey,
      );
      if (found) {
        setState({ status: "ready", catalog: found.catalog, error: null });
      } else {
        setState({ status: "missing", catalog: null, error: null });
      }
    } catch (error) {
      setState({
        status: "error",
        catalog: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  useEffect(() => {
    loadCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hackathonId]);

  async function bootstrapCatalog() {
    if (!auth || !isAdmin || busy) return;
    setBootstrap({
      phase: "signing",
      message: "Firmando solicitud de bootstrap",
      ok: 0,
      total: DEFAULT_HACKATHON_BADGES.length + 1,
    });
    let signer: Awaited<ReturnType<typeof getSigner>> | null = null;
    try {
      signer = await getSigner(auth);
      setBootstrap((prev) => ({
        ...prev,
        phase: "generating",
        message: "El backend esta generando definiciones y catalogo",
      }));
      const result = await requestBadgeBootstrap(
        hackathonId,
        signer,
      );

      setBootstrap({
        phase: "publishing",
        message: "Publicando eventos firmados por el backend",
        ok: 0,
        total: result.events.length,
      });
      const published = await publishSignedEventsToRelays(result.events);
      const ok = published.filter((relay) => relay.ok).length;
      if (ok === 0) {
        throw new Error("Ningun relay acepto los eventos firmados.");
      }
      setBootstrap({
        phase: "done",
        message: `Publicado en ${ok}/${published.length} relays.`,
        ok,
        total: published.length,
      });
      await loadCatalog();
    } catch (error) {
      setBootstrap((prev) => ({
        ...prev,
        phase: "error",
        message: error instanceof Error ? error.message : String(error),
      }));
    } finally {
      signer?.close?.().catch(() => {});
    }
  }

  const catalog = state.catalog;
  const categories = catalog?.categories ?? [];
  const orderedCategories = useMemo(
    () =>
      [...categories].sort((a, b) => {
        const ai = GROUP_ORDER.indexOf(a.id);
        const bi = GROUP_ORDER.indexOf(b.id);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      }),
    [categories],
  );

  return (
    <main className="relative min-h-screen overflow-hidden pt-28 pb-16">
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute inset-0 bg-grid bg-grid-fade opacity-35" />
        <div className="absolute top-0 left-1/2 h-[360px] w-[720px] -translate-x-1/2 rounded-full bg-bitcoin/12 blur-[120px]" />
        <div className="absolute right-0 top-40 h-[420px] w-[420px] rounded-full bg-nostr/14 blur-[120px]" />
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Link
          href={`/hackathons/${hackathonId}`}
          className="mb-8 inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-widest text-foreground-muted transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver a {hackathonName}
        </Link>

        <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-end">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-bitcoin/30 bg-bitcoin/10 px-3 py-1 text-xs font-mono font-semibold uppercase tracking-widest text-bitcoin">
              <BadgeCheck className="h-3.5 w-3.5" />
              Badges desde Nostr
            </div>
            <h1 className="max-w-4xl font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl md:text-6xl">
              Badges de{" "}
              <span className="text-gradient-bitcoin">{hackathonName}</span>
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-foreground-muted sm:text-lg">
              El catalogo visible se resuelve desde un evento reemplazable de
              Nostr que linkea cada badge con su definicion NIP-58.
            </p>
          </div>

          <StatusPanel
            state={state}
            isAdmin={isAdmin}
            adminMismatch={adminMismatch}
            hasConfiguredAdmin={hasConfiguredAdmin}
            hasPublisher={hasPublisher}
            signerReady={signerReady}
            busy={busy}
            bootstrap={bootstrap}
            onBootstrap={bootstrapCatalog}
            onRefresh={loadCatalog}
          />
        </section>

        {state.status === "loading" && (
          <div className="mt-12 rounded-2xl border border-border bg-background-card/70 p-8 text-foreground-muted">
            <Loader2 className="mb-4 h-6 w-6 animate-spin text-bitcoin" />
            Buscando catalogo publicado en Nostr...
          </div>
        )}

        {state.status === "missing" && (
          <MissingCatalog
            isAdmin={isAdmin}
            adminMismatch={adminMismatch}
            hasConfiguredAdmin={hasConfiguredAdmin}
            hasPublisher={hasPublisher}
            signerReady={signerReady}
            busy={busy}
            onBootstrap={bootstrapCatalog}
          />
        )}

        {state.status === "error" && (
          <div className="mt-12 rounded-2xl border border-red-400/30 bg-red-400/10 p-6 text-red-200">
            {state.error}
          </div>
        )}

        {catalog && (
          <section className="mt-12 space-y-10">
            {orderedCategories.map((category) => {
              const badges = catalog.badges.filter(
                (badge) => badge.category === category.id,
              );
              if (badges.length === 0) return null;
              return (
                <div key={category.id}>
                  <div className="mb-4 flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-white/[0.04] text-bitcoin">
                      {groupIcon(category.id)}
                    </div>
                    <div>
                      <h2 className="font-display text-2xl font-bold">
                        {category.label}
                      </h2>
                      <p className="text-xs font-mono uppercase tracking-widest text-foreground-subtle">
                        {badges.length} badges
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {badges.map((badge) => (
                      <BadgeCard key={badge.id} badge={badge} />
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}

function StatusPanel({
  state,
  isAdmin,
  adminMismatch,
  hasConfiguredAdmin,
  hasPublisher,
  signerReady,
  busy,
  bootstrap,
  onBootstrap,
  onRefresh,
}: {
  state: CatalogState;
  isAdmin: boolean;
  adminMismatch: boolean;
  hasConfiguredAdmin: boolean;
  hasPublisher: boolean;
  signerReady: boolean;
  busy: boolean;
  bootstrap: BootstrapState;
  onBootstrap: () => void;
  onRefresh: () => void;
}) {
  const found = state.status === "ready";
  const missing = state.status === "missing";

  return (
    <div className="rounded-2xl border border-border bg-background-card/70 p-5 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-foreground-subtle">
            Estado Nostr
          </div>
          <div className="mt-1 font-display text-3xl font-bold">
            {found ? "Publicado" : missing ? "No publicado" : "Buscando"}
          </div>
        </div>
        <div
          className={cn(
            "flex h-14 w-14 items-center justify-center rounded-2xl border",
            found
              ? "border-success/35 bg-success/10 text-success"
              : missing
                ? "border-bitcoin/35 bg-bitcoin/10 text-bitcoin"
                : "border-border bg-white/[0.04] text-foreground-muted",
          )}
        >
          {found ? (
            <CheckCircle2 className="h-7 w-7" />
          ) : missing ? (
            <UploadCloud className="h-7 w-7" />
          ) : (
            <Loader2 className="h-7 w-7 animate-spin" />
          )}
        </div>
      </div>

      {bootstrap.phase !== "idle" && (
        <div
          className={cn(
            "mt-4 rounded-xl border px-3 py-2 text-sm",
            bootstrap.phase === "error"
              ? "border-red-400/30 bg-red-400/10 text-red-200"
              : bootstrap.phase === "done"
                ? "border-success/30 bg-success/10 text-success"
                : "border-bitcoin/30 bg-bitcoin/10 text-bitcoin",
          )}
        >
          {bootstrap.message}
        </div>
      )}

      {!hasConfiguredAdmin && (
        <div className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-200">
          Falta NEXT_PUBLIC_LACRYPTA_ADMIN_NPUB.
        </div>
      )}
      {!hasPublisher && (
        <div className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-200">
          Falta LACRYPTA_NSEC para resolver la pubkey oficial.
        </div>
      )}
      {adminMismatch && (
        <div className="mt-4 rounded-xl border border-bitcoin/30 bg-bitcoin/10 px-3 py-2 text-sm text-bitcoin">
          El usuario logueado no coincide con NEXT_PUBLIC_LACRYPTA_ADMIN_NPUB.
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onRefresh}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-white/[0.03] px-3 py-2 text-xs font-semibold text-foreground-muted transition-colors hover:bg-white/[0.06] disabled:opacity-50"
        >
          {state.status === "loading" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          Refrescar
        </button>
        {missing && isAdmin && (
          <button
            type="button"
            onClick={onBootstrap}
            disabled={!signerReady || busy}
            className="inline-flex items-center gap-2 rounded-xl border border-bitcoin/30 bg-bitcoin/10 px-3 py-2 text-xs font-semibold text-bitcoin transition-colors hover:bg-bitcoin/15 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UploadCloud className="h-4 w-4" />
            )}
            Bootstrap
          </button>
        )}
      </div>
    </div>
  );
}

function MissingCatalog({
  isAdmin,
  adminMismatch,
  hasConfiguredAdmin,
  hasPublisher,
  signerReady,
  busy,
  onBootstrap,
}: {
  isAdmin: boolean;
  adminMismatch: boolean;
  hasConfiguredAdmin: boolean;
  hasPublisher: boolean;
  signerReady: boolean;
  busy: boolean;
  onBootstrap: () => void;
}) {
  return (
    <section className="mt-12 rounded-2xl border border-bitcoin/30 bg-bitcoin/10 p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-bitcoin/30 bg-black/15 px-3 py-1 text-[10px] font-mono font-semibold uppercase tracking-widest text-bitcoin">
            <XCircle className="h-3.5 w-3.5" />
            Catalogo no encontrado
          </div>
          <h2 className="mt-4 font-display text-2xl font-bold">
            Los badges default todavia no estan publicados en Nostr.
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-foreground-muted">
            El bootstrap crea {DEFAULT_HACKATHON_BADGES.length} definiciones
            NIP-58 y un evento reemplazable que las linkea por categoria. El
            backend firma los eventos y este front los publica.
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={onBootstrap}
            disabled={!signerReady || busy}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-bitcoin/40 bg-bitcoin px-5 py-3 text-sm font-bold text-black transition-colors hover:bg-lightning disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UploadCloud className="h-4 w-4" />
            )}
            Bootstrap badges
          </button>
        )}
        {!hasConfiguredAdmin && (
          <p className="text-sm text-red-200">
            Configurá NEXT_PUBLIC_LACRYPTA_ADMIN_NPUB para habilitar bootstrap.
          </p>
        )}
        {!hasPublisher && (
          <p className="text-sm text-red-200">
            Configurá LACRYPTA_NSEC para publicar con la identidad oficial.
          </p>
        )}
        {adminMismatch && (
          <p className="text-sm text-bitcoin">
            Para publicar defaults, el usuario logueado debe coincidir con
            NEXT_PUBLIC_LACRYPTA_ADMIN_NPUB.
          </p>
        )}
      </div>
    </section>
  );
}

function groupIcon(group: HackathonBadgeCategoryId) {
  if (group === "ranking") return <Trophy className="h-4 w-4" />;
  if (group === "favorites") return <Heart className="h-4 w-4" />;
  if (group === "specials") return <Sparkles className="h-4 w-4" />;
  return <Flame className="h-4 w-4" />;
}

function BadgeCard({ badge }: { badge: HackathonBadgeCatalogBadge }) {
  const Icon = ICONS[badge.icon] ?? Award;
  const tone = TONE_STYLE[badge.tone];

  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-2xl border bg-background-card/75 p-5 backdrop-blur-sm transition-colors hover:border-border-strong",
        tone.ring,
      )}
    >
      <div
        className={cn(
          "absolute -right-10 -top-10 h-32 w-32 rounded-full blur-3xl transition-opacity group-hover:opacity-90",
          tone.glow,
        )}
      />
      <div className="relative flex items-start gap-4">
        <div
          className={cn(
            "relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-br shadow-2xl shadow-black/20",
            tone.preview,
          )}
        >
          <div className="absolute inset-[3px] rounded-[14px] border border-black/20 bg-black/20" />
          <Icon className="relative h-9 w-9 text-white drop-shadow" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-mono font-semibold uppercase tracking-widest",
                tone.chip,
              )}
            >
              <Icon className="h-3 w-3" />
              {badge.category}
            </span>
          </div>
          <h3 className="mt-3 font-display text-xl font-bold leading-tight">
            {badge.name}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
            {badge.description}
          </p>
        </div>
      </div>

      <div className="relative mt-5 flex items-center justify-between gap-3 border-t border-border pt-4">
        <span className="min-w-0 truncate text-[10px] font-mono uppercase tracking-widest text-foreground-subtle">
          {badge.id}
        </span>
        <div
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg border",
            tone.chip,
          )}
        >
          <Zap className={cn("h-4 w-4", tone.icon)} />
        </div>
      </div>
    </article>
  );
}
