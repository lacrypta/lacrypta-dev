"use client";

import type { ComponentType, FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Award,
  BadgeCheck,
  Brush,
  Code2,
  Copy,
  Flame,
  Gem,
  Heart,
  Loader2,
  Medal,
  Mic2,
  PlusCircle,
  Rocket,
  Save,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Trophy,
  UploadCloud,
  UserPlus,
  Users,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { queryProfile } from "nostr-tools/nip05";
import { cn } from "@/lib/cn";
import { hackathonSlugForId } from "@/lib/hackathons";
import { useAuth, type Auth } from "@/lib/auth";
import { fetchNostrProfile } from "@/lib/nostrProfile";
import { DEFAULT_RELAYS, mergeDataRelays } from "@/lib/nostrRelayConfig";
import { getSigner } from "@/lib/nostrSigner";
import type { SignedEvent } from "@/lib/nostrSigner";
import {
  HACKATHON_BADGE_CATEGORIES,
  HACKATHON_BADGE_ICONS,
  HACKATHON_BADGE_TONES,
  DEFAULT_HACKATHON_BADGES,
  normalizeHackathonBadgeCategoryId,
  normalizeHackathonBadgeId,
  type HackathonBadgeCatalog,
  type HackathonBadgeCatalogBadge,
  type HackathonBadgeCategory,
  type HackathonBadgeCategoryId,
  type HackathonBadgeTemplate,
  type HackathonBadgeTone,
} from "@/lib/hackathonBadges";
import {
  fetchBadgeSoldiers,
  fetchLacryptaBadgePubkeys,
  fetchHackathonBadgeAwardOwners,
  fetchHackathonBadgeCatalog,
  fetchHackathonBadgeDefinition,
  fetchHackathonBadgeDefinitions,
  publishSignedEventsToRelays,
  requestBadgeAward,
  requestBadgeBootstrap,
  requestBadgeCreate,
  refreshHackathonBadgeCache,
  type BadgeAwardOwner,
  type BadgeAwardRecipient,
  type BadgeDefinitionEvent,
  type BadgeSoldierOption,
} from "@/lib/hackathonBadgeClient";
import {
  fetchBlobWithProgress,
  uploadToBlossom,
  type UploadProgress,
} from "@/lib/blossom";
import ImageCropModal, { type CropResult } from "@/components/ImageCropModal";
import AdminPendingAwardsPanel from "./AdminPendingAwardsPanel";

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

type BadgeImageUploadState = {
  phase: "idle" | "signing" | "uploading" | "warming" | "done" | "error";
  localUrl?: string;
  percent: number;
  fading?: boolean;
  message: string;
};

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

export default function BadgesClient({
  hackathonId,
  hackathonName,
  initialCatalog,
  initialDefinitions = {},
  initialPublisherPubkey = "",
}: {
  hackathonId: string;
  hackathonName: string;
  initialCatalog?: HackathonBadgeCatalog | null;
  initialDefinitions?: Record<string, BadgeDefinitionEvent>;
  initialPublisherPubkey?: string;
}) {
  const { auth, signerReady } = useAuth();
  const [adminPubkey, setAdminPubkey] = useState("");
  const [publisherPubkey, setPublisherPubkey] =
    useState(initialPublisherPubkey);
  const [state, setState] = useState<CatalogState>(() =>
    initialCatalog
      ? { status: "ready", catalog: initialCatalog, error: null }
      : { status: "loading", catalog: null, error: null },
  );
  const [bootstrap, setBootstrap] = useState<BootstrapState>({
    phase: "idle",
    message: "",
    ok: 0,
    total: 0,
  });
  const [createFlow, setCreateFlow] = useState<BootstrapState>({
    phase: "idle",
    message: "",
    ok: 0,
    total: 0,
  });
  const [selectedBadge, setSelectedBadge] =
    useState<HackathonBadgeCatalogBadge | null>(null);
  const [showCreateBadgeModal, setShowCreateBadgeModal] = useState(false);
  const [definitionByATag, setDefinitionByATag] = useState<
    Record<string, BadgeDefinitionEvent>
  >(() => initialDefinitions);
  const [soldiers, setSoldiers] = useState<BadgeSoldierOption[]>([]);
  const [soldiersError, setSoldiersError] = useState("");

  const isAdmin = !!auth && !!adminPubkey && auth.pubkey === adminPubkey;
  const hasConfiguredAdmin = !!adminPubkey;
  const hasPublisher = !!publisherPubkey;
  const adminMismatch = !!auth && hasConfiguredAdmin && auth.pubkey !== adminPubkey;
  const bootstrapBusy = ["signing", "generating", "publishing"].includes(
    bootstrap.phase,
  );
  const createBusy = ["signing", "generating", "publishing"].includes(
    createFlow.phase,
  );
  const busy = bootstrapBusy || createBusy;

  async function preloadBadgeDefinitions(catalog: HackathonBadgeCatalog) {
    try {
      const definitions = await fetchHackathonBadgeDefinitions(
        catalog.badges.map((badge) => badge.definition),
      );
      setDefinitionByATag(definitions);
    } catch {
      setDefinitionByATag({});
    }
  }

  async function loadBadgePubkeys() {
    const keys = await fetchLacryptaBadgePubkeys();
    setAdminPubkey(keys.adminPubkey);
    setPublisherPubkey(keys.publisherPubkey);
    return keys;
  }

  async function loadCatalog({ showLoading = true } = {}) {
    if (showLoading) {
      setState({ status: "loading", catalog: null, error: null });
      setDefinitionByATag({});
    }
    try {
      const keys = await loadBadgePubkeys();
      const found = await fetchHackathonBadgeCatalog(
        hackathonId,
        keys.publisherPubkey,
      );
      if (found) {
        setState({ status: "ready", catalog: found.catalog, error: null });
        void preloadBadgeDefinitions(found.catalog);
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
    if (initialCatalog) {
      loadBadgePubkeys().catch(() => {});
      return;
    }
    loadCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hackathonId]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    fetchBadgeSoldiers()
      .then((items) => {
        if (cancelled) return;
        setSoldiers(items);
        setSoldiersError("");
      })
      .catch((error) => {
        if (cancelled) return;
        setSoldiersError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

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
      const aTags = result.events.flatMap((event) =>
        event.tags
          .filter((tag) => tag[0] === "a" && tag[1])
          .map((tag) => tag[1]),
      );
      await refreshHackathonBadgeCache({
        hackathonId,
        aTags,
        catalog: true,
        definitions: aTags.length > 0,
      });
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

  async function createBadges(
    badges: HackathonBadgeTemplate[],
    categories?: HackathonBadgeCategory[],
  ): Promise<HackathonBadgeCatalog | null> {
    if (
      !auth ||
      !isAdmin ||
      busy ||
      state.status === "loading" ||
      badges.length === 0
    ) {
      return null;
    }
    setCreateFlow({
      phase: "signing",
      message: `Firmando creacion de ${badges.length} badge${badges.length === 1 ? "" : "s"}`,
      ok: 0,
      total: badges.length + 1,
    });
    let signer: Awaited<ReturnType<typeof getSigner>> | null = null;
    try {
      signer = await getSigner(auth);
      setCreateFlow((prev) => ({
        ...prev,
        phase: "generating",
        message: "El backend esta firmando definiciones y catalogo",
      }));
      const result = await requestBadgeCreate({
        hackathonId,
        signer,
        badges,
        categories,
      });

      setCreateFlow({
        phase: "publishing",
        message: "Publicando nuevos eventos Nostr",
        ok: 0,
        total: result.events.length,
      });
      const published = await publishSignedEventsToRelays(result.events);
      const ok = published.filter((relay) => relay.ok).length;
      if (ok === 0) {
        throw new Error("Ningun relay acepto los eventos firmados.");
      }
      const aTags = result.catalog?.badges.map((badge) => badge.definition) ?? [];
      await refreshHackathonBadgeCache({
        hackathonId,
        aTags,
        catalog: true,
        definitions: aTags.length > 0,
      });
      if (result.catalog) {
        setState({ status: "ready", catalog: result.catalog, error: null });
        void preloadBadgeDefinitions(result.catalog);
      }
      setCreateFlow({
        phase: "done",
        message: `Publicado en ${ok}/${published.length} relays.`,
        ok,
        total: published.length,
      });
      await loadCatalog();
      return result.catalog ?? null;
    } catch (error) {
      setCreateFlow((prev) => ({
        ...prev,
        phase: "error",
        message: error instanceof Error ? error.message : String(error),
      }));
      return null;
    } finally {
      signer?.close?.().catch(() => {});
    }
  }

  const catalog = state.catalog;
  const categories = catalog?.categories ?? [];
  const pendingBadges = useMemo(() => {
    if (!catalog && state.status !== "missing") return [];
    const existing = new Set((catalog?.badges ?? []).map((badge) => badge.id));
    return DEFAULT_HACKATHON_BADGES.filter((badge) => !existing.has(badge.id));
  }, [catalog, state.status]);
  const creationCategories = useMemo(
    () => (categories.length > 0 ? categories : HACKATHON_BADGE_CATEGORIES),
    [categories],
  );
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
          href={`/hackathons/${hackathonSlugForId(hackathonId)}`}
          className="mb-8 inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-widest text-foreground-muted transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver a {hackathonName}
        </Link>

        <section>
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-bitcoin/30 bg-bitcoin/10 px-3 py-1 text-xs font-mono font-semibold uppercase tracking-widest text-bitcoin">
              <BadgeCheck className="h-3.5 w-3.5" />
              Badges desde Nostr
            </div>
            <h1 className="max-w-4xl font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl md:text-6xl">
              Reconocimientos
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-foreground-muted sm:text-lg">
              Se obtiene subiendo proyectos y participando en hackatons.
            </p>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowCreateBadgeModal(true)}
                className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-bitcoin/35 bg-bitcoin px-4 py-2 text-sm font-bold text-black transition-colors hover:bg-lightning"
              >
                <PlusCircle className="h-4 w-4" />
                Crear reconocimiento
              </button>
            )}
          </div>
        </section>

        {isAdmin && (
          <AdminPendingAwardsPanel
            auth={auth}
            signerReady={signerReady}
            publisherPubkey={publisherPubkey}
          />
        )}

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
                      <BadgeCard
                        key={badge.id}
                        badge={badge}
                        definition={definitionByATag[badge.definition] ?? null}
                        onOpen={() => setSelectedBadge(badge)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        )}
      </div>

      {isAdmin && showCreateBadgeModal && (
        <AdminBadgeCreatePanel
          categories={creationCategories}
          pendingBadges={pendingBadges}
          signerReady={signerReady}
          busy={busy || state.status === "loading"}
          createFlow={createFlow}
          onCreate={createBadges}
          onClose={() => setShowCreateBadgeModal(false)}
        />
      )}

      {selectedBadge && (
        <BadgeDetailModal
          auth={auth}
          badge={selectedBadge}
          initialDefinition={definitionByATag[selectedBadge.definition] ?? null}
          hackathonId={hackathonId}
          hackathonName={hackathonName}
          isAdmin={isAdmin}
          onClose={() => setSelectedBadge(null)}
          publisherPubkey={publisherPubkey}
          signerReady={signerReady}
          soldiers={soldiers}
          soldiersError={soldiersError}
          onSaveBadge={async (template) => {
            const updatedCatalog = await createBadges([template]);
            const updatedBadge = updatedCatalog?.badges.find(
              (item) => item.id === template.id,
            );
            if (updatedBadge) setSelectedBadge(updatedBadge);
            if (updatedCatalog) {
              const definitions = await fetchHackathonBadgeDefinitions(
                updatedCatalog.badges.map((badge) => badge.definition),
              );
              setDefinitionByATag(definitions);
            }
            return updatedCatalog;
          }}
        />
      )}
    </main>
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
            disabled={!signerReady || busy || !hasPublisher}
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

const NEW_CATEGORY_VALUE = "__new-category__";

function AdminBadgeCreatePanel({
  categories,
  pendingBadges,
  signerReady,
  busy,
  createFlow,
  onCreate,
  onClose,
}: {
  categories: HackathonBadgeCategory[];
  pendingBadges: HackathonBadgeTemplate[];
  signerReady: boolean;
  busy: boolean;
  createFlow: BootstrapState;
  onCreate: (
    badges: HackathonBadgeTemplate[],
    categories?: HackathonBadgeCategory[],
  ) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [badgeId, setBadgeId] = useState("");
  const [description, setDescription] = useState("");
  const [categoryMode, setCategoryMode] = useState<string>(
    categories[0]?.id ?? "specials",
  );
  const [newCategoryLabel, setNewCategoryLabel] = useState("");
  const [newCategoryDescription, setNewCategoryDescription] = useState("");
  const [tone, setTone] = useState<HackathonBadgeTone>("nostr");
  const [icon, setIcon] = useState<string>("award");

  useEffect(() => {
    if (
      categoryMode !== NEW_CATEGORY_VALUE &&
      !categories.some((category) => category.id === categoryMode)
    ) {
      setCategoryMode(categories[0]?.id ?? "specials");
    }
  }, [categories, categoryMode]);

  const normalizedBadgeId = normalizeHackathonBadgeId(badgeId || name);
  const newCategoryId = normalizeHackathonBadgeCategoryId(newCategoryLabel);
  const selectedCategory =
    categoryMode === NEW_CATEGORY_VALUE ? newCategoryId : categoryMode;
  const canCreateCustom =
    !!normalizedBadgeId &&
    !!name.trim() &&
    !!description.trim() &&
    !!selectedCategory &&
    signerReady &&
    !busy;
  const pendingCount = pendingBadges.length;

  function submitCustom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreateCustom) return;
    const category =
      categoryMode === NEW_CATEGORY_VALUE
        ? {
            id: newCategoryId,
            label: newCategoryLabel.trim(),
            description: newCategoryDescription.trim() || undefined,
          }
        : categories.find((item) => item.id === selectedCategory);
    onCreate(
      [
        {
          id: normalizedBadgeId,
          category: selectedCategory as HackathonBadgeCategoryId,
          name: name.trim(),
          description: description.trim(),
          tone,
          icon,
          criteria: { type: "manual" },
        },
      ],
      category ? [category] : undefined,
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-3 py-5 backdrop-blur-sm">
      <section className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-nostr/25 bg-background-card shadow-2xl shadow-black/50">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-nostr/35 bg-black/20 px-3 py-1 text-[10px] font-mono font-semibold uppercase tracking-widest text-nostr">
              <ShieldCheck className="h-3.5 w-3.5" />
              Admin
            </div>
            <h2 className="mt-4 font-display text-2xl font-bold">
              Crear badges Nostr
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-foreground-muted">
              El backend firma definiciones NIP-58 y un nuevo catalogo oficial.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-white/[0.03] text-foreground-muted hover:text-foreground"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[calc(92vh-146px)] overflow-y-auto px-5 py-5">
          {createFlow.phase !== "idle" && (
            <div
              className={cn(
                "mb-5 rounded-xl border px-3 py-2 text-sm",
                createFlow.phase === "error"
                  ? "border-red-400/30 bg-red-400/10 text-red-200"
                  : createFlow.phase === "done"
                    ? "border-success/30 bg-success/10 text-success"
                    : "border-nostr/30 bg-nostr/10 text-nostr",
              )}
            >
              <div className="flex items-center gap-2">
                {["signing", "generating", "publishing"].includes(
                  createFlow.phase,
                ) && <Loader2 className="h-4 w-4 animate-spin" />}
                <span>{createFlow.message}</span>
              </div>
            </div>
          )}

          <div
            className={cn(
              "grid gap-5",
              pendingCount > 0 && "lg:grid-cols-[minmax(0,1fr)_420px]",
            )}
          >
            {pendingCount > 0 && (
              <div className="rounded-xl border border-border bg-black/20 p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="font-display text-xl font-bold">
                      Badges pendientes
                    </h3>
                    <p className="mt-1 text-xs font-mono uppercase tracking-widest text-foreground-subtle">
                      {pendingCount} por crear
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onCreate(pendingBadges)}
                    disabled={!signerReady || busy}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-bitcoin/35 bg-bitcoin/15 px-4 py-2 text-sm font-bold text-bitcoin transition-colors hover:bg-bitcoin/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <PlusCircle className="h-4 w-4" />
                    )}
                    Crear pendientes
                  </button>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {pendingBadges.map((badge) => (
                    <div
                      key={badge.id}
                      className="rounded-lg border border-border bg-white/[0.03] px-3 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold">{badge.name}</span>
                        <span className="rounded-full border border-nostr/25 bg-nostr/10 px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest text-nostr">
                          {badge.category}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-foreground-muted">
                        {badge.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <form
              onSubmit={submitCustom}
              className="rounded-xl border border-border bg-black/20 p-4"
        >
          <h3 className="font-display text-xl font-bold">Badge nuevo</h3>
          <div className="mt-4 grid gap-3">
            <label className="grid gap-1.5 text-xs font-mono uppercase tracking-widest text-foreground-subtle">
              Nombre
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="min-h-11 rounded-xl border border-border bg-black/20 px-3 text-sm font-sans normal-case tracking-normal text-foreground outline-none transition-colors focus:border-nostr/60"
                placeholder="Favorito de Satoshi"
              />
            </label>
            <label className="grid gap-1.5 text-xs font-mono uppercase tracking-widest text-foreground-subtle">
              Id
              <input
                value={badgeId}
                onChange={(event) => setBadgeId(event.target.value)}
                className="min-h-11 rounded-xl border border-border bg-black/20 px-3 text-sm font-mono normal-case tracking-normal text-foreground outline-none transition-colors focus:border-nostr/60"
                placeholder={normalizedBadgeId || "favorito-de-satoshi"}
              />
            </label>
            <label className="grid gap-1.5 text-xs font-mono uppercase tracking-widest text-foreground-subtle">
              Descripcion
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="min-h-24 resize-none rounded-xl border border-border bg-black/20 px-3 py-2 text-sm font-sans normal-case tracking-normal text-foreground outline-none transition-colors focus:border-nostr/60"
                placeholder="Seleccion especial del jurado."
              />
            </label>
            <label className="grid gap-1.5 text-xs font-mono uppercase tracking-widest text-foreground-subtle">
              Categoria
              <select
                value={categoryMode}
                onChange={(event) => setCategoryMode(event.target.value)}
                className="min-h-11 rounded-xl border border-border bg-black/20 px-3 text-sm font-sans normal-case tracking-normal text-foreground outline-none transition-colors focus:border-nostr/60"
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.label}
                  </option>
                ))}
                <option value={NEW_CATEGORY_VALUE}>Nueva categoria</option>
              </select>
            </label>
            {categoryMode === NEW_CATEGORY_VALUE && (
              <div className="grid gap-3 rounded-xl border border-nostr/25 bg-nostr/10 p-3">
                <label className="grid gap-1.5 text-xs font-mono uppercase tracking-widest text-foreground-subtle">
                  Nombre categoria
                  <input
                    value={newCategoryLabel}
                    onChange={(event) => setNewCategoryLabel(event.target.value)}
                    className="min-h-11 rounded-xl border border-border bg-black/20 px-3 text-sm font-sans normal-case tracking-normal text-foreground outline-none transition-colors focus:border-nostr/60"
                    placeholder="Jurado"
                  />
                </label>
                <label className="grid gap-1.5 text-xs font-mono uppercase tracking-widest text-foreground-subtle">
                  Descripcion categoria
                  <input
                    value={newCategoryDescription}
                    onChange={(event) =>
                      setNewCategoryDescription(event.target.value)
                    }
                    className="min-h-11 rounded-xl border border-border bg-black/20 px-3 text-sm font-sans normal-case tracking-normal text-foreground outline-none transition-colors focus:border-nostr/60"
                    placeholder="Selecciones nuevas."
                  />
                </label>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-xs font-mono uppercase tracking-widest text-foreground-subtle">
                Tono
                <select
                  value={tone}
                  onChange={(event) =>
                    setTone(event.target.value as HackathonBadgeTone)
                  }
                  className="min-h-11 rounded-xl border border-border bg-black/20 px-3 text-sm font-sans normal-case tracking-normal text-foreground outline-none transition-colors focus:border-nostr/60"
                >
                  {HACKATHON_BADGE_TONES.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5 text-xs font-mono uppercase tracking-widest text-foreground-subtle">
                Icono
                <select
                  value={icon}
                  onChange={(event) => setIcon(event.target.value)}
                  className="min-h-11 rounded-xl border border-border bg-black/20 px-3 text-sm font-sans normal-case tracking-normal text-foreground outline-none transition-colors focus:border-nostr/60"
                >
                  {HACKATHON_BADGE_ICONS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="submit"
              disabled={!canCreateCustom}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-nostr/35 bg-nostr px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-nostr/85 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Crear badge
            </button>
          </div>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}

function groupIcon(group: HackathonBadgeCategoryId) {
  if (group === "ranking") return <Trophy className="h-4 w-4" />;
  if (group === "favorites") return <Heart className="h-4 w-4" />;
  if (group === "specials") return <Sparkles className="h-4 w-4" />;
  return <Flame className="h-4 w-4" />;
}

function shortPubkey(pubkey: string): string {
  return `${pubkey.slice(0, 8)}...${pubkey.slice(-6)}`;
}

function initials(name: string): string {
  return name
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";
}

function soldierAvatar(soldier: Pick<BadgeSoldierOption, "github" | "picture">) {
  if (soldier.picture) return soldier.picture;
  if (soldier.github) return `https://github.com/${soldier.github}.png?size=120`;
  return null;
}

function formatEventDate(createdAt: number): string {
  return new Date(createdAt * 1000).toLocaleString("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function BadgeDetailModal({
  auth,
  badge,
  initialDefinition,
  hackathonId,
  hackathonName,
  isAdmin,
  onClose,
  publisherPubkey,
  signerReady,
  soldiers,
  soldiersError,
  onSaveBadge,
}: {
  auth: Auth | null;
  badge: HackathonBadgeCatalogBadge;
  initialDefinition: BadgeDefinitionEvent | null;
  hackathonId: string;
  hackathonName: string;
  isAdmin: boolean;
  onClose: () => void;
  publisherPubkey: string;
  signerReady: boolean;
  soldiers: BadgeSoldierOption[];
  soldiersError: string;
  onSaveBadge: (
    template: HackathonBadgeTemplate,
  ) => Promise<HackathonBadgeCatalog | null>;
}) {
  const [definition, setDefinition] =
    useState<BadgeDefinitionEvent | null>(initialDefinition);
  const [showDefinitionEvent, setShowDefinitionEvent] = useState(false);
  const [owners, setOwners] = useState<BadgeAwardOwner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Map<string, BadgeAwardRecipient>>(
    () => new Map(),
  );
  const [nip05, setNip05] = useState("");
  const [nip05Status, setNip05Status] = useState<
    "idle" | "resolving" | "done" | "error"
  >("idle");
  const [nip05Message, setNip05Message] = useState("");
  const [awardFlow, setAwardFlow] = useState<BootstrapState>({
    phase: "idle",
    message: "",
    ok: 0,
    total: 0,
  });
  const [awardPanelOpen, setAwardPanelOpen] = useState(false);
  const [draftName, setDraftName] = useState(badge.name);
  const [draftDescription, setDraftDescription] = useState(badge.description);
  const [draftImage, setDraftImage] = useState(badge.image ?? badge.thumb ?? "");
  const [editMessage, setEditMessage] = useState("");
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [imageUpload, setImageUpload] = useState<BadgeImageUploadState>({
    phase: "idle",
    percent: 0,
    message: "",
  });
  const [cropSource, setCropSource] = useState<File | null>(null);
  const badgeImageInputRef = useRef<HTMLInputElement>(null);
  const awardBusy = ["signing", "generating", "publishing"].includes(
    awardFlow.phase,
  );
  const editBusy =
    savingEdit ||
    ["signing", "uploading", "warming"].includes(imageUpload.phase);
  const hasBadgeEditChanges =
    isAdmin &&
    (draftName.trim() !== badge.name.trim() ||
      draftDescription.trim() !== badge.description.trim() ||
      draftImage.trim() !== (badge.image ?? badge.thumb ?? "").trim());
  const canSaveBadgeChanges =
    hasBadgeEditChanges &&
    !editBusy &&
    !!draftName.trim() &&
    !!draftDescription.trim();

  useEffect(() => {
    setDefinition(initialDefinition);
    setDraftName(badge.name);
    setDraftDescription(badge.description);
    setDraftImage(badge.image ?? badge.thumb ?? "");
    setEditMessage("");
    setEditError("");
    setAwardPanelOpen(false);
  }, [
    badge.id,
    badge.name,
    badge.description,
    badge.image,
    badge.thumb,
    initialDefinition,
  ]);

  const ownerPubkeys = useMemo(
    () => new Set(owners.map((owner) => owner.pubkey)),
    [owners],
  );
  const selectedRecipients = [...selected.values()];
  const soldierByPubkey = useMemo(
    () =>
      new Map(
        soldiers
          .filter((soldier) => soldier.pubkey)
          .map((soldier) => [soldier.pubkey!, soldier]),
      ),
    [soldiers],
  );
  const filteredSoldiers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const base = soldiers.filter((soldier) => soldier.pubkey);
    if (!needle) return base.slice(0, 24);
    return base
      .filter((soldier) =>
        [soldier.name, soldier.nip05, soldier.github, soldier.pubkey]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(needle)),
      )
      .slice(0, 24);
  }, [query, soldiers]);

  async function loadBadgeDetail() {
    setLoading(true);
    setError("");
    try {
      const [definitionEvent, awardOwners] = await Promise.all([
        fetchHackathonBadgeDefinition(badge.definition),
        fetchHackathonBadgeAwardOwners(badge.definition, publisherPubkey),
      ]);
      setDefinition(definitionEvent ?? initialDefinition);
      setOwners(awardOwners);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setShowDefinitionEvent(false);
    loadBadgeDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [badge.definition, publisherPubkey]);

  useEffect(() => {
    return () => {
      if (imageUpload.localUrl) URL.revokeObjectURL(imageUpload.localUrl);
    };
  }, [imageUpload.localUrl]);

  function toggleRecipient(recipient: BadgeAwardRecipient) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(recipient.pubkey)) next.delete(recipient.pubkey);
      else next.set(recipient.pubkey, recipient);
      return next;
    });
  }

  async function addNip05Recipient() {
    const handle = nip05.trim().toLowerCase();
    if (!handle) return;
    setNip05Status("resolving");
    setNip05Message("");
    try {
      const pointer = await queryProfile(handle);
      if (!pointer?.pubkey) throw new Error("No pudimos resolver ese NIP-05.");
      const relays = mergeDataRelays(DEFAULT_RELAYS, pointer.relays ?? []);
      const profile = await fetchNostrProfile(pointer.pubkey, relays, 3500);
      const name =
        profile?.profile.display_name?.trim() ||
        profile?.profile.name?.trim() ||
        handle.split("@")[0] ||
        shortPubkey(pointer.pubkey);
      toggleRecipient({
        pubkey: pointer.pubkey,
        name,
        nip05: profile?.profile.nip05?.trim().toLowerCase() || handle,
      });
      setNip05("");
      setNip05Status("done");
      setNip05Message(`${name} agregado.`);
    } catch (resolveError) {
      setNip05Status("error");
      setNip05Message(
        resolveError instanceof Error
          ? resolveError.message
          : "No se pudo resolver NIP-05.",
      );
    }
  }

  function pickBadgeImage(file: File) {
    setEditError("");
    if (!file.type.startsWith("image/")) {
      setEditError("Solo imagenes JPG, PNG, WebP o GIF.");
      return;
    }
    setCropSource(file);
  }

  async function handleBadgeImageCrop(result: CropResult) {
    setCropSource(null);
    if (!auth || !isAdmin) return;
    const file = new File([result.blob], result.filename, { type: result.type });
    const localUrl = URL.createObjectURL(file);
    setImageUpload({
      phase: "signing",
      localUrl,
      percent: 0,
      message: "firmando autorizacion Blossom...",
    });
    let signer: Awaited<ReturnType<typeof getSigner>> | null = null;
    try {
      signer = await getSigner(auth);
      const UPLOAD_SHARE = 70;
      const desc = await uploadToBlossom(file, signer, {
        onProgress: (progress: UploadProgress) => {
          if (progress.state === "signing") {
            setImageUpload((prev) => ({
              ...prev,
              phase: "signing",
              message: "firmando autorizacion Blossom...",
            }));
            return;
          }
          if (progress.state === "uploading") {
            const percent =
              typeof progress.percent === "number"
                ? Math.round(progress.percent * UPLOAD_SHARE)
                : 0;
            setImageUpload((prev) => ({
              ...prev,
              phase: "uploading",
              percent: Math.max(prev.percent, percent),
              message: `subiendo a ${progress.server.replace("https://", "")}`,
            }));
            return;
          }
          if (progress.state === "error") {
            setImageUpload((prev) => ({
              ...prev,
              phase: "uploading",
              message: `fallo ${progress.server.replace("https://", "")}, probando siguiente...`,
            }));
          }
        },
      });

      setImageUpload((prev) => ({
        ...prev,
        phase: "warming",
        percent: Math.max(prev.percent, UPLOAD_SHARE),
        message: `preparando imagen desde ${desc.server.replace("https://", "")}...`,
      }));
      try {
        await fetchBlobWithProgress(desc.url, (progress) => {
          const percent = progress.percent;
          if (typeof percent !== "number") return;
          setImageUpload((prev) => ({
            ...prev,
            percent: Math.max(
              prev.percent,
              UPLOAD_SHARE + Math.round(percent * (100 - UPLOAD_SHARE)),
            ),
          }));
        });
      } catch {
        /* Best effort: the Blossom URL is already valid. */
      }
      await new Promise<void>((resolve) => {
        const img = new Image();
        const done = () => resolve();
        img.onload = done;
        img.onerror = done;
        window.setTimeout(done, 3000);
        img.src = desc.url;
      });
      setDraftImage(desc.url);
      setImageUpload((prev) => ({
        ...prev,
        phase: "done",
        percent: 100,
        fading: true,
        message: "imagen subida",
      }));
      setEditMessage("Imagen subida. Guardá cambios para publicar la definicion.");
      window.setTimeout(() => {
        setImageUpload((prev) => {
          if (prev.localUrl) URL.revokeObjectURL(prev.localUrl);
          return { phase: "idle", percent: 0, message: "" };
        });
      }, 500);
    } catch (uploadError) {
      setImageUpload((prev) => ({
        ...prev,
        phase: "error",
        message:
          uploadError instanceof Error
            ? uploadError.message.split("\n")[0]
            : "No se pudo subir la imagen.",
      }));
      setEditError(
        uploadError instanceof Error
          ? uploadError.message.split("\n")[0]
          : "No se pudo subir la imagen.",
      );
    } finally {
      signer?.close?.().catch(() => {});
    }
  }

  async function saveBadgeEdits() {
    if (!isAdmin || !auth || editBusy) return;
    const name = draftName.trim();
    const description = draftDescription.trim();
    if (!name || !description) {
      setEditError("Nombre y descripcion son obligatorios.");
      return;
    }
    setSavingEdit(true);
    setEditError("");
    setEditMessage("Publicando definicion actualizada...");
    try {
      const updated = await onSaveBadge({
        id: badge.id,
        category: badge.category,
        name,
        description,
        tone: badge.tone,
        icon: badge.icon,
        criteria: badge.criteria,
        image: draftImage.trim() || undefined,
        thumb: draftImage.trim() || undefined,
      });
      if (!updated) throw new Error("No se pudo publicar la actualizacion.");
      setEditMessage("Badge actualizado. Sincronizando definicion...");
    } catch (saveError) {
      setEditError(
        saveError instanceof Error
          ? saveError.message
          : "No se pudo guardar el badge.",
      );
    } finally {
      setSavingEdit(false);
    }
  }

  async function awardSelected() {
    if (!auth || !isAdmin || !signerReady || awardBusy || selectedRecipients.length === 0) {
      return;
    }
    setAwardFlow({
      phase: "signing",
      message: `Firmando award para ${selectedRecipients.length} usuario${selectedRecipients.length === 1 ? "" : "s"}`,
      ok: 0,
      total: selectedRecipients.length,
    });
    let signer: Awaited<ReturnType<typeof getSigner>> | null = null;
    try {
      signer = await getSigner(auth);
      setAwardFlow((prev) => ({
        ...prev,
        phase: "generating",
        message: "El backend esta firmando awards oficiales",
      }));
      const result = await requestBadgeAward({
        hackathonId,
        signer,
        badge,
        recipients: selectedRecipients,
      });
      setAwardFlow({
        phase: "publishing",
        message: "Publicando awards en relays",
        ok: 0,
        total: result.events.length,
      });
      const published = await publishSignedEventsToRelays(result.events);
      const ok = published.filter((relay) => relay.ok).length;
      if (ok === 0) throw new Error("Ningun relay acepto los awards.");
      await refreshHackathonBadgeCache({
        hackathonId,
        aTags: [badge.definition],
        issuerPubkey: result.publisherPubkey || publisherPubkey,
        owners: true,
      });
      setAwardFlow({
        phase: "done",
        message: `Publicado en ${ok}/${published.length} relays.`,
        ok,
        total: published.length,
      });
      setSelected(new Map());
      await loadBadgeDetail();
    } catch (awardError) {
      setAwardFlow((prev) => ({
        ...prev,
        phase: "error",
        message: awardError instanceof Error ? awardError.message : String(awardError),
      }));
    } finally {
      signer?.close?.().catch(() => {});
    }
  }

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-3 py-5 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-2xl border border-border bg-background-card shadow-2xl shadow-black/50">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-foreground-subtle">
              {hackathonName} · {badge.category}
            </div>
            <h2 className="mt-1 font-display text-2xl font-bold">
              {badge.name}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-foreground-muted">
              {badge.description}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {hasBadgeEditChanges && (
              <button
                type="button"
                onClick={saveBadgeEdits}
                disabled={!canSaveBadgeChanges}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-bitcoin/35 bg-bitcoin px-3 py-2 text-sm font-bold text-black transition-colors hover:bg-lightning disabled:cursor-not-allowed disabled:opacity-50"
              >
                {editBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Guardar cambios
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-white/[0.03] text-foreground-muted hover:text-foreground"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="max-h-[calc(92vh-78px)] overflow-y-auto px-5 py-5">
          {loading ? (
            <div className="flex items-center gap-2 rounded-xl border border-border bg-black/20 px-4 py-3 text-foreground-muted">
              <Loader2 className="h-4 w-4 animate-spin text-bitcoin" />
              Cargando definicion y owners...
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-red-200">
              {error}
            </div>
          ) : null}

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
            <section className="space-y-5">
              <div className="rounded-xl border border-border bg-black/20 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-display text-xl font-bold">
                      Definicion del badge
                    </h3>
                    <p className="mt-1 text-xs font-mono uppercase tracking-widest text-foreground-subtle">
                      Badge Definition · kind 30009
                    </p>
                  </div>
                </div>
                {definition ? (
                  <>
                    <DefinitionSummary
                      badge={badge}
                      definition={definition}
                      publisherPubkey={publisherPubkey}
                      isAdmin={isAdmin}
                      draftName={draftName}
                      draftDescription={draftDescription}
                      draftImage={draftImage}
                      onNameChange={setDraftName}
                      onDescriptionChange={setDraftDescription}
                      onPickImage={() => badgeImageInputRef.current?.click()}
                      imageUpload={imageUpload}
                      editBusy={editBusy}
                      editMessage={editMessage}
                      editError={editError}
                    />
                    <input
                      ref={badgeImageInputRef}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.currentTarget.value = "";
                        if (file) pickBadgeImage(file);
                      }}
                    />
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
                      <button
                        type="button"
                        onClick={() =>
                          setShowDefinitionEvent((visible) => !visible)
                        }
                        className="inline-flex items-center gap-2 rounded-xl border border-bitcoin/30 bg-bitcoin/10 px-3 py-2 text-xs font-semibold text-bitcoin transition-colors hover:bg-bitcoin/15"
                      >
                        <Code2 className="h-4 w-4" />
                        {showDefinitionEvent
                          ? "Ocultar evento"
                          : "Mostrar evento"}
                      </button>
                      {showDefinitionEvent && (
                        <CopyJsonButton event={definition} />
                      )}
                    </div>
                    {showDefinitionEvent && (
                      <pre className="mt-3 max-h-[420px] overflow-auto rounded-xl border border-border bg-black/40 p-4 text-xs leading-relaxed text-foreground-muted">
                        {JSON.stringify(definition, null, 2)}
                      </pre>
                    )}
                  </>
                ) : loading ? (
                  <div className="flex items-center gap-2 rounded-xl border border-border bg-black/20 px-4 py-3 text-sm text-foreground-muted">
                    <Loader2 className="h-4 w-4 animate-spin text-bitcoin" />
                    Cargando definicion publicada...
                  </div>
                ) : (
                  <div className="rounded-xl border border-bitcoin/25 bg-bitcoin/10 px-4 py-3 text-sm text-bitcoin">
                    No encontramos la definicion publicada todavia.
                  </div>
                )}
              </div>

            </section>

            <aside className="space-y-5">
              <div className="rounded-xl border border-border bg-black/20 p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-display text-xl font-bold">
                      Owners
                    </h3>
                    <p className="mt-1 text-xs font-mono uppercase tracking-widest text-foreground-subtle">
                      {owners.length} usuario{owners.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={loadBadgeDetail}
                    disabled={loading}
                    className="inline-flex items-center gap-2 rounded-xl border border-border bg-white/[0.03] px-3 py-2 text-xs font-semibold text-foreground-muted hover:bg-white/[0.06] disabled:opacity-50"
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    Refrescar
                  </button>
                </div>
                {owners.length === 0 ? (
                  <div className="rounded-xl border border-border bg-white/[0.03] px-4 py-4 text-sm text-foreground-muted">
                    Todavia nadie tiene este badge.
                  </div>
                ) : (
                  <div className="grid gap-2">
                    {owners.map((owner) => (
                      <OwnerPill
                        key={`${owner.pubkey}:${owner.awardEvent.id}`}
                        owner={owner}
                        soldier={soldierByPubkey.get(owner.pubkey)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {isAdmin && (
                <div className="rounded-xl border border-nostr/25 bg-nostr/10 p-4">
                  <button
                    type="button"
                    onClick={() => setAwardPanelOpen((open) => !open)}
                    aria-expanded={awardPanelOpen}
                    className="flex w-full items-center justify-between gap-3 text-left"
                  >
                    <div>
                      <h3 className="font-display text-xl font-bold">
                        Otorgar badges
                      </h3>
                      <p className="mt-1 text-sm text-foreground-muted">
                        {awardPanelOpen
                          ? "Selecciona soldados o agrega un NIP-05."
                          : "Abrir selector de usuarios."}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-nostr/30 bg-nostr/15 text-nostr transition-transform duration-300",
                        awardPanelOpen && "rotate-6 scale-105",
                      )}
                    >
                      <Users className="h-5 w-5" />
                    </span>
                  </button>

                  {awardFlow.phase !== "idle" && (
                    <div
                      className={cn(
                        "mt-4 rounded-xl border px-3 py-2 text-sm",
                        awardFlow.phase === "error"
                          ? "border-red-400/30 bg-red-400/10 text-red-200"
                          : awardFlow.phase === "done"
                            ? "border-success/30 bg-success/10 text-success"
                            : "border-nostr/30 bg-nostr/10 text-nostr",
                      )}
                    >
                      {awardFlow.message}
                    </div>
                  )}

                  <div
                    className={cn(
                      "overflow-hidden transition-[max-height,opacity,margin-top] duration-300 ease-out",
                      awardPanelOpen
                        ? "mt-4 max-h-[900px] opacity-100"
                        : "pointer-events-none mt-0 max-h-0 opacity-0",
                    )}
                  >
                    <div>
                      <div className="grid gap-3">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-subtle" />
                          <input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            className="min-h-11 w-full rounded-xl border border-border bg-black/20 pl-9 pr-3 text-sm text-foreground outline-none transition-colors focus:border-nostr/60"
                            placeholder="Buscar soldado"
                          />
                        </div>
                        {soldiersError && (
                          <div className="rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-200">
                            {soldiersError}
                          </div>
                        )}
                        <div className="max-h-72 overflow-y-auto rounded-xl border border-border bg-black/20 p-2">
                          {filteredSoldiers.length === 0 ? (
                            <div className="px-3 py-4 text-sm text-foreground-muted">
                              No hay soldados con pubkey para esa busqueda.
                            </div>
                          ) : (
                            filteredSoldiers.map((soldier) => {
                              const pubkey = soldier.pubkey!;
                              const checked = selected.has(pubkey);
                              const alreadyOwns = ownerPubkeys.has(pubkey);
                              return (
                                <button
                                  key={soldier.id}
                                  type="button"
                                  onClick={() =>
                                    toggleRecipient({
                                      pubkey,
                                      name: soldier.name,
                                      nip05: soldier.nip05,
                                    })
                                  }
                                  className={cn(
                                    "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors",
                                    checked
                                      ? "bg-nostr/20 text-foreground"
                                      : "hover:bg-white/[0.05]",
                                  )}
                                >
                                  <Avatar
                                    image={soldierAvatar(soldier)}
                                    name={soldier.name}
                                  />
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-semibold">
                                      {soldier.name}
                                    </span>
                                    <span className="block truncate text-xs text-foreground-subtle">
                                      {soldier.nip05 || shortPubkey(pubkey)}
                                    </span>
                                  </span>
                                  {alreadyOwns && (
                                    <span className="rounded-full border border-success/25 bg-success/10 px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest text-success">
                                      owner
                                    </span>
                                  )}
                                  <span
                                    className={cn(
                                      "h-4 w-4 rounded border",
                                      checked
                                        ? "border-nostr bg-nostr"
                                        : "border-border bg-black/20",
                                    )}
                                  />
                                </button>
                              );
                            })
                          )}
                        </div>

                        <div className="rounded-xl border border-border bg-black/20 p-3">
                          <div className="text-xs font-mono uppercase tracking-widest text-foreground-subtle">
                            Agregar NIP-05
                          </div>
                          <div className="mt-2 flex gap-2">
                            <input
                              value={nip05}
                              onChange={(event) => {
                                setNip05(event.target.value);
                                setNip05Status("idle");
                                setNip05Message("");
                              }}
                              className="min-h-10 min-w-0 flex-1 rounded-xl border border-border bg-black/20 px-3 text-sm text-foreground outline-none transition-colors focus:border-nostr/60"
                              placeholder="user@domain.com"
                            />
                            <button
                              type="button"
                              onClick={addNip05Recipient}
                              disabled={
                                !nip05.trim() || nip05Status === "resolving"
                              }
                              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-nostr/30 bg-nostr/15 text-nostr hover:bg-nostr/20 disabled:opacity-50"
                              aria-label="Agregar NIP-05"
                            >
                              {nip05Status === "resolving" ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <UserPlus className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                          {nip05Message && (
                            <div
                              className={cn(
                                "mt-2 text-xs",
                                nip05Status === "error"
                                  ? "text-red-200"
                                  : "text-success",
                              )}
                            >
                              {nip05Message}
                            </div>
                          )}
                        </div>

                        {selectedRecipients.length > 0 && (
                          <div className="rounded-xl border border-nostr/25 bg-nostr/10 p-3">
                            <div className="mb-2 text-xs font-mono uppercase tracking-widest text-nostr">
                              {selectedRecipients.length} seleccionado
                              {selectedRecipients.length === 1 ? "" : "s"}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {selectedRecipients.map((recipient) => (
                                <button
                                  key={recipient.pubkey}
                                  type="button"
                                  onClick={() => toggleRecipient(recipient)}
                                  className="inline-flex items-center gap-1 rounded-full border border-nostr/30 bg-black/20 px-2 py-1 text-xs text-foreground-muted hover:text-foreground"
                                >
                                  {recipient.name || shortPubkey(recipient.pubkey)}
                                  <X className="h-3 w-3" />
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={awardSelected}
                          disabled={
                            !signerReady ||
                            awardBusy ||
                            selectedRecipients.length === 0
                          }
                          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-bitcoin/40 bg-bitcoin px-4 py-2 text-sm font-bold text-black transition-colors hover:bg-lightning disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {awardBusy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <BadgeCheck className="h-4 w-4" />
                          )}
                          Otorgar badge
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </aside>
          </div>
        </div>
      </div>
    </div>
    {cropSource && (
      <ImageCropModal
        open
        file={cropSource}
        aspect={1}
        title="Recortar imagen del badge"
        hint="Badge 1:1"
        maxOutputPx={1200}
        outputType="image/jpeg"
        onConfirm={handleBadgeImageCrop}
        onCancel={() => setCropSource(null)}
      />
    )}
    </>
  );
}

function CopyJsonButton({ event }: { event: SignedEvent }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard
          ?.writeText(JSON.stringify(event, null, 2))
          .then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
          })
          .catch(() => {});
      }}
      className="inline-flex items-center gap-2 rounded-xl border border-border bg-white/[0.03] px-3 py-2 text-xs font-semibold text-foreground-muted hover:bg-white/[0.06]"
    >
      <Copy className="h-4 w-4" />
      {copied ? "Copiado" : "Copiar JSON"}
    </button>
  );
}

function DefinitionSummary({
  badge,
  definition,
  publisherPubkey,
  isAdmin,
  draftName,
  draftDescription,
  draftImage,
  onNameChange,
  onDescriptionChange,
  onPickImage,
  imageUpload,
  editBusy,
  editMessage,
  editError,
}: {
  badge: HackathonBadgeCatalogBadge;
  definition: BadgeDefinitionEvent;
  publisherPubkey: string;
  isAdmin: boolean;
  draftName: string;
  draftDescription: string;
  draftImage: string;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onPickImage: () => void;
  imageUpload: BadgeImageUploadState;
  editBusy: boolean;
  editMessage: string;
  editError: string;
}) {
  const title = definition.parsed.name || badge.name;
  const description = definition.parsed.description || badge.description;
  const publishedImage =
    definition.parsed.image || badge.image || definition.parsed.thumb || badge.thumb;
  const image = draftImage || publishedImage;
  const issuerMatches = publisherPubkey && definition.pubkey === publisherPubkey;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
      <BadgeImagePanel
        src={image}
        title={draftName || title}
        isAdmin={isAdmin}
        disabled={editBusy}
        upload={imageUpload}
        onPickImage={onPickImage}
      />

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-success/25 bg-success/10 px-2.5 py-1 text-[10px] font-mono font-semibold uppercase tracking-widest text-success">
            Publicado
          </span>
          <span className="rounded-full border border-nostr/25 bg-nostr/10 px-2.5 py-1 text-[10px] font-mono font-semibold uppercase tracking-widest text-nostr">
            Kind {definition.kind}
          </span>
          {issuerMatches && (
            <span className="rounded-full border border-bitcoin/25 bg-bitcoin/10 px-2.5 py-1 text-[10px] font-mono font-semibold uppercase tracking-widest text-bitcoin">
              Oficial
            </span>
          )}
        </div>

        {isAdmin ? (
          <div className="mt-4 grid gap-3">
            <label className="grid gap-1.5 text-xs font-mono uppercase tracking-widest text-foreground-subtle">
              Nombre
              <input
                value={draftName}
                onChange={(event) => onNameChange(event.target.value)}
                className="min-h-11 rounded-xl border border-border bg-black/20 px-3 text-base font-sans normal-case tracking-normal text-foreground outline-none transition-colors focus:border-bitcoin/60"
                placeholder={title}
              />
            </label>
            <label className="grid gap-1.5 text-xs font-mono uppercase tracking-widest text-foreground-subtle">
              Descripcion
              <textarea
                value={draftDescription}
                onChange={(event) => onDescriptionChange(event.target.value)}
                className="min-h-24 resize-none rounded-xl border border-border bg-black/20 px-3 py-2 text-sm font-sans normal-case tracking-normal text-foreground outline-none transition-colors focus:border-bitcoin/60"
                placeholder={description}
              />
            </label>
            <div className="min-h-5 text-xs">
              {editError ? (
                <span className="text-red-200">{editError}</span>
              ) : editMessage ? (
                <span className="text-success">{editMessage}</span>
              ) : (
                <span className="text-foreground-subtle">
                  Los cambios se publican como una nueva definicion Nostr.
                </span>
              )}
            </div>
          </div>
        ) : (
          <>
            <h4 className="mt-3 font-display text-2xl font-bold leading-tight">
              {title}
            </h4>
            <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
              {description}
            </p>
          </>
        )}

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <DefinitionField label="Badge ID" value={badge.id} />
          <DefinitionField label="Categoria" value={badge.category} />
        </div>
      </div>
    </div>
  );
}

function BadgeImagePanel({
  src,
  title,
  isAdmin,
  disabled,
  upload,
  onPickImage,
}: {
  src?: string;
  title: string;
  isAdmin: boolean;
  disabled: boolean;
  upload: BadgeImageUploadState;
  onPickImage: () => void;
}) {
  const [broken, setBroken] = useState(false);
  const uploading = ["signing", "uploading", "warming"].includes(upload.phase);

  useEffect(() => {
    setBroken(false);
  }, [src]);

  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={onPickImage}
        disabled={!isAdmin || disabled}
        className={cn(
          "group relative block w-full overflow-hidden rounded-xl border border-border bg-white/[0.03] text-left transition-all",
          isAdmin
            ? "hover:border-bitcoin/50 hover:shadow-lg hover:shadow-bitcoin/10 disabled:cursor-progress disabled:opacity-70"
            : "cursor-default",
        )}
        aria-label="Cambiar imagen del badge"
      >
        {src && !broken ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={title}
            className="aspect-square w-full object-cover"
            loading="lazy"
            onError={() => setBroken(true)}
          />
        ) : (
          <div className="flex aspect-square items-center justify-center bg-gradient-to-br from-bitcoin/25 via-nostr/20 to-cyan/20">
            <Award className="h-12 w-12 text-foreground-muted" />
          </div>
        )}
        {upload.localUrl && (
          <BadgeUploadReveal
            localUrl={upload.localUrl}
            percent={upload.percent}
            fading={upload.fading}
          />
        )}
        {isAdmin && (
          <div
            className={cn(
              "absolute inset-0 flex items-center justify-center bg-black/55 text-white transition-opacity",
              uploading
                ? "opacity-100"
                : upload.localUrl
                  ? "opacity-0"
                  : "opacity-0 group-hover:opacity-100",
            )}
          >
            <div className="flex flex-col items-center gap-2 text-center text-[10px] font-mono uppercase tracking-widest">
              {uploading ? (
                <Loader2 className="h-6 w-6 animate-spin text-bitcoin" />
              ) : (
                <UploadCloud className="h-6 w-6 text-bitcoin" />
              )}
              <span>{uploading ? upload.message : "Subir imagen"}</span>
            </div>
          </div>
        )}
      </button>
      {isAdmin && upload.phase !== "idle" && upload.message && (
        <div
          className={cn(
            "mt-2 rounded-lg border px-3 py-2 text-xs",
            upload.phase === "error"
              ? "border-red-400/30 bg-red-400/10 text-red-200"
              : upload.phase === "done"
                ? "border-success/30 bg-success/10 text-success"
                : "border-bitcoin/30 bg-bitcoin/10 text-bitcoin",
          )}
        >
          {upload.message}
        </div>
      )}
    </div>
  );
}

function BadgeUploadReveal({
  localUrl,
  percent,
  fading,
}: {
  localUrl: string;
  percent: number;
  fading?: boolean;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const [phase, setPhase] = useState(0);
  const rafRef = useRef<number>(0);
  const clampedRef = useRef(clamped);
  const displayRef = useRef(clamped);
  clampedRef.current = clamped;

  useEffect(() => {
    const tick = () => {
      displayRef.current += (clampedRef.current - displayRef.current) * 0.03;
      setPhase((value) => value + 0.0207);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const clipPath = useMemo(() => {
    const yBase = 100 - displayRef.current;
    const points = Array.from({ length: 33 }, (_, i) => {
      const x = (i / 32) * 100;
      const y = Math.max(
        0,
        Math.min(100, yBase + Math.sin((i / 32) * Math.PI * 2 + phase) * 5),
      );
      return `${x.toFixed(2)}% ${y.toFixed(2)}%`;
    });
    return `polygon(0% 100%, 100% 100%, ${points.reverse().join(", ")})`;
  }, [phase]);

  return (
    <div
      className={cn(
        "absolute inset-0 pointer-events-none transition-opacity duration-300 ease-out",
        fading ? "opacity-0" : "opacity-100",
      )}
      aria-hidden
    >
      <div className="absolute inset-0 overflow-hidden" style={{ clipPath }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={localUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      </div>
      <div className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md border border-white/10 bg-black/70 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-white backdrop-blur-sm">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-bitcoin" />
        {clamped}%
      </div>
    </div>
  );
}

function DefinitionField({
  label,
  value,
  helper,
  wide = false,
}: {
  label: string;
  value: string;
  helper?: string;
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-lg border border-border bg-black/25 px-3 py-2",
        wide && "sm:col-span-2",
      )}
    >
      <div className="text-[9px] font-mono font-semibold uppercase tracking-widest text-foreground-subtle">
        {label}
      </div>
      <div className="mt-1 min-w-0 truncate font-mono text-xs text-foreground">
        {helper || value}
      </div>
      {helper && (
        <div className="mt-0.5 min-w-0 truncate font-mono text-[10px] text-foreground-subtle">
          {value}
        </div>
      )}
    </div>
  );
}

function Avatar({ image, name }: { image?: string | null; name: string }) {
  return image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={image}
      alt={name}
      className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-border"
      loading="lazy"
    />
  ) : (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-gradient-to-br from-bitcoin/25 to-nostr/25 text-xs font-bold">
      {initials(name)}
    </span>
  );
}

function OwnerPill({
  owner,
  soldier,
}: {
  owner: BadgeAwardOwner;
  soldier?: BadgeSoldierOption;
}) {
  const name = soldier?.name || owner.name || owner.nip05 || shortPubkey(owner.pubkey);
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-white/[0.03] px-3 py-2">
      <Avatar image={soldier ? soldierAvatar(soldier) : null} name={name} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{name}</div>
        <div className="truncate text-xs text-foreground-subtle">
          {soldier?.nip05 || owner.nip05 || shortPubkey(owner.pubkey)}
        </div>
        <div className="mt-0.5 text-[10px] font-mono uppercase tracking-widest text-foreground-subtle">
          {formatEventDate(owner.awardEvent.created_at)}
        </div>
      </div>
    </div>
  );
}

function BadgeCard({
  badge,
  definition,
  onOpen,
}: {
  badge: HackathonBadgeCatalogBadge;
  definition?: BadgeDefinitionEvent | null;
  onOpen: () => void;
}) {
  const Icon = ICONS[badge.icon] ?? Award;
  const tone = TONE_STYLE[badge.tone];
  const image =
    definition?.parsed.image ||
    definition?.parsed.thumb ||
    badge.image ||
    badge.thumb ||
    "";
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = !!image && !imageFailed;

  useEffect(() => {
    setImageFailed(false);
  }, [image]);

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group relative overflow-hidden rounded-2xl border bg-background-card/75 p-5 text-left backdrop-blur-sm transition-colors hover:border-border-strong focus:outline-none focus:ring-2 focus:ring-bitcoin/50",
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
          {showImage ? (
            <>
              <img
                src={image}
                alt={badge.name}
                className="absolute inset-0 h-full w-full object-cover"
                referrerPolicy="no-referrer"
                onError={() => setImageFailed(true)}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-white/10" />
            </>
          ) : (
            <>
              <div className="absolute inset-[3px] rounded-[14px] border border-black/20 bg-black/20" />
              <Icon className="relative h-9 w-9 text-white drop-shadow" />
            </>
          )}
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
    </button>
  );
}
