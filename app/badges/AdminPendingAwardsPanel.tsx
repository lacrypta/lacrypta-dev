"use client";

import type { ComponentType } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Award,
  Brush,
  Check,
  Flame,
  Gem,
  Heart,
  Loader2,
  Medal,
  Mic2,
  Rocket,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Trophy,
  Users,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { Auth } from "@/lib/auth";
import { getSigner } from "@/lib/nostrSigner";
import {
  fetchBadgeSoldiers,
  publishSignedEventsToRelays,
  refreshHackathonBadgeCache,
  requestBadgeAward,
  type BadgeSoldierOption,
} from "@/lib/hackathonBadgeClient";
import type {
  PendingBadgeGroup,
  PendingBadgeRecipient,
} from "@/lib/pendingBadges";
import type { HackathonBadgeTone } from "@/lib/hackathonBadges";

const MAX_RECIPIENTS_PER_REQUEST = 32;

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

const TONE_TEXT: Record<HackathonBadgeTone, string> = {
  gold: "text-yellow-200",
  silver: "text-slate-100",
  bronze: "text-orange-200",
  bitcoin: "text-bitcoin",
  nostr: "text-nostr",
  cyan: "text-cyan",
  success: "text-success",
  pink: "text-pink-300",
};

type AwardPhase = {
  phase: "idle" | "working" | "done" | "error";
  message: string;
};

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function initial(name: string): string {
  return (name.trim()[0] ?? "?").toUpperCase();
}

function Avatar({
  name,
  picture,
  muted,
}: {
  name: string;
  picture?: string;
  muted?: boolean;
}) {
  return picture ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={picture}
      alt=""
      referrerPolicy="no-referrer"
      className={cn(
        "h-7 w-7 shrink-0 rounded-full object-cover",
        muted && "opacity-50 grayscale",
      )}
    />
  ) : (
    <span
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-white/[0.04] text-xs font-bold text-foreground-muted",
        muted && "opacity-50",
      )}
    >
      {initial(name)}
    </span>
  );
}

export default function AdminPendingAwardsPanel({
  auth,
  signerReady,
  publisherPubkey,
}: {
  auth: Auth | null;
  signerReady: boolean;
  publisherPubkey: string;
}) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [groups, setGroups] = useState<PendingBadgeGroup[]>([]);
  const [soldiers, setSoldiers] = useState<BadgeSoldierOption[]>([]);

  const load = useCallback(async (soft = false) => {
    if (soft) setRefreshing(true);
    else setStatus("loading");
    setError("");
    try {
      const [pendingGroups, soldierList] = await Promise.all([
        fetch("/api/hackathon-badges/pending", { cache: "no-store" }).then(
          async (res) => {
            const data = (await res.json()) as {
              groups?: PendingBadgeGroup[];
              error?: string;
            };
            if (!res.ok) {
              throw new Error(
                data.error || "No se pudieron cargar los badges pendientes.",
              );
            }
            return data.groups ?? [];
          },
        ),
        fetchBadgeSoldiers().catch(() => [] as BadgeSoldierOption[]),
      ]);
      setGroups(pendingGroups);
      setSoldiers(soldierList);
      setStatus("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const soldierByPubkey = useMemo(() => {
    const map = new Map<string, BadgeSoldierOption>();
    for (const soldier of soldiers) {
      if (soldier.pubkey) map.set(soldier.pubkey, soldier);
    }
    return map;
  }, [soldiers]);

  const totalReady = useMemo(
    () => groups.reduce((sum, group) => sum + group.recipients.length, 0),
    [groups],
  );

  return (
    <section className="mt-10 rounded-2xl border border-nostr/25 bg-nostr/[0.04] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-nostr/30 bg-nostr/10 px-3 py-1 text-[11px] font-mono font-semibold uppercase tracking-widest text-nostr">
            <Sparkles className="h-3.5 w-3.5" />
            Admin · Badges pendientes
          </div>
          <h2 className="font-display text-2xl font-bold">
            Reconocimientos por otorgar
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-foreground-muted">
            Escaneo de todas las hackatones y proyectos: usuarios que cumplen el
            criterio de cada badge y todavía no lo recibieron.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={status === "loading" || refreshing}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-white/[0.03] px-3 py-2 text-sm font-semibold text-foreground-muted transition-colors hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw
            className={cn("h-4 w-4", refreshing && "animate-spin")}
          />
          Actualizar
        </button>
      </div>

      {status === "loading" && (
        <div className="mt-6 flex items-center gap-2 rounded-xl border border-border bg-black/20 px-4 py-3 text-foreground-muted">
          <Loader2 className="h-4 w-4 animate-spin text-nostr" />
          Escaneando criterios de badges...
        </div>
      )}

      {status === "error" && (
        <div className="mt-6 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {status === "ready" && groups.length === 0 && (
        <div className="mt-6 rounded-xl border border-border bg-black/20 px-4 py-6 text-center text-foreground-muted">
          No hay awards pendientes. Todo al día. 🎉
        </div>
      )}

      {status === "ready" && groups.length > 0 && (
        <>
          <p className="mt-4 text-xs font-mono uppercase tracking-widest text-foreground-subtle">
            {groups.length} badges · {totalReady} awards sugeridos
          </p>
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {groups.map((group) => (
              <PendingGroupCard
                key={`${group.hackathonId}:${group.badge.id}`}
                group={group}
                soldiers={soldiers}
                soldierByPubkey={soldierByPubkey}
                auth={auth}
                signerReady={signerReady}
                publisherPubkey={publisherPubkey}
                onAwarded={() => void load(true)}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function PendingGroupCard({
  group,
  soldiers,
  soldierByPubkey,
  auth,
  signerReady,
  publisherPubkey,
  onAwarded,
}: {
  group: PendingBadgeGroup;
  soldiers: BadgeSoldierOption[];
  soldierByPubkey: Map<string, BadgeSoldierOption>;
  auth: Auth | null;
  signerReady: boolean;
  publisherPubkey: string;
  onAwarded: () => void;
}) {
  const isManual = !group.autoEvaluable;
  const Icon = ICONS[group.badge.icon] ?? Award;
  const toneText = TONE_TEXT[group.badge.tone] ?? "text-bitcoin";

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(isManual ? [] : group.recipients.map((r) => r.pubkey)),
  );
  const [query, setQuery] = useState("");
  const [award, setAward] = useState<AwardPhase>({ phase: "idle", message: "" });

  const busy = award.phase === "working";
  const ownerSet = useMemo(
    () => new Set(group.ownerPubkeys),
    [group.ownerPubkeys],
  );

  // Manual badges: searchable soldier picker (with pubkey, not already owner).
  const candidates = useMemo(() => {
    if (!isManual) return [];
    const q = query.trim().toLowerCase();
    return soldiers
      .filter((s) => s.pubkey && !ownerSet.has(s.pubkey))
      .filter(
        (s) =>
          !q ||
          s.name.toLowerCase().includes(q) ||
          (s.github ?? "").toLowerCase().includes(q) ||
          (s.nip05 ?? "").toLowerCase().includes(q),
      )
      .slice(0, 40);
  }, [isManual, soldiers, ownerSet, query]);

  function toggle(pubkey: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(pubkey)) next.delete(pubkey);
      else next.add(pubkey);
      return next;
    });
  }

  function buildRecipients(): PendingBadgeRecipient[] {
    const pubkeys = [...selected];
    if (isManual) {
      return pubkeys.map((pk) => {
        const soldier = soldierByPubkey.get(pk);
        return { pubkey: pk, name: soldier?.name, nip05: soldier?.nip05 };
      });
    }
    const byPubkey = new Map(group.recipients.map((r) => [r.pubkey, r]));
    return pubkeys.map((pk) => byPubkey.get(pk) ?? { pubkey: pk });
  }

  const canAward = !!auth && signerReady && selected.size > 0 && !busy;

  async function handleAward() {
    if (!auth || !canAward) return;
    const recipients = buildRecipients();
    if (recipients.length === 0) return;
    setAward({
      phase: "working",
      message: `Firmando y publicando ${recipients.length} award${recipients.length === 1 ? "" : "s"}...`,
    });
    let signer: Awaited<ReturnType<typeof getSigner>> | null = null;
    try {
      signer = await getSigner(auth);
      let publishedOk = 0;
      let publishedTotal = 0;
      let issuer = publisherPubkey;
      for (const batch of chunk(recipients, MAX_RECIPIENTS_PER_REQUEST)) {
        const result = await requestBadgeAward({
          hackathonId: group.hackathonId,
          signer,
          badge: group.badge,
          recipients: batch,
        });
        issuer = result.publisherPubkey || issuer;
        const published = await publishSignedEventsToRelays(result.events);
        publishedOk += published.filter((relay) => relay.ok).length;
        publishedTotal += published.length;
      }
      if (publishedOk === 0) {
        throw new Error("Ningún relay aceptó los awards.");
      }
      await refreshHackathonBadgeCache({
        hackathonId: group.hackathonId,
        aTags: [group.badge.definition],
        issuerPubkey: issuer,
        owners: true,
      });
      setAward({
        phase: "done",
        message: `Otorgado. Publicado en ${publishedOk}/${publishedTotal} relays.`,
      });
      onAwarded();
    } catch (err) {
      setAward({
        phase: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      await signer?.close?.().catch(() => {});
    }
  }

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-background-card/70 p-4">
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-white/[0.04]",
            toneText,
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-display text-lg font-bold">
              {group.badge.name}
            </h3>
            {isManual && (
              <span className="shrink-0 rounded-full border border-border bg-white/[0.04] px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest text-foreground-subtle">
                Manual
              </span>
            )}
          </div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-foreground-subtle">
            {group.hackathonName} · {group.badge.category}
            {group.alreadyAwarded > 0 && ` · ${group.alreadyAwarded} ya otorgado`}
          </div>
        </div>
      </div>

      {group.badge.description && (
        <p className="mt-2 text-sm text-foreground-muted">
          {group.badge.description}
        </p>
      )}

      <div className="mt-3 flex-1">
        {isManual ? (
          <ManualPicker
            candidates={candidates}
            selected={selected}
            query={query}
            onQuery={setQuery}
            onToggle={toggle}
            busy={busy}
          />
        ) : (
          <AutoRecipients
            group={group}
            soldierByPubkey={soldierByPubkey}
            selected={selected}
            onToggle={toggle}
            busy={busy}
          />
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <span
          className={cn(
            "text-xs",
            award.phase === "error" && "text-red-300",
            award.phase === "done" && "text-success",
            (award.phase === "idle" || award.phase === "working") &&
              "text-foreground-subtle",
          )}
        >
          {award.message ||
            (selected.size > 0
              ? `${selected.size} seleccionado${selected.size === 1 ? "" : "s"}`
              : isManual
                ? "Buscá y elegí a quién otorgar"
                : "Nadie seleccionado")}
        </span>
        <button
          type="button"
          onClick={handleAward}
          disabled={!canAward}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-bitcoin/35 bg-bitcoin px-4 py-2 text-sm font-bold text-black transition-colors hover:bg-lightning disabled:cursor-not-allowed disabled:opacity-50"
          title={
            !signerReady
              ? "Conectá tu firmante para otorgar"
              : selected.size === 0
                ? "Seleccioná al menos un receptor"
                : undefined
          }
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Award className="h-4 w-4" />
          )}
          Otorgar
        </button>
      </div>
    </div>
  );
}

function AutoRecipients({
  group,
  soldierByPubkey,
  selected,
  onToggle,
  busy,
}: {
  group: PendingBadgeGroup;
  soldierByPubkey: Map<string, BadgeSoldierOption>;
  selected: Set<string>;
  onToggle: (pubkey: string) => void;
  busy: boolean;
}) {
  const hasNothing =
    group.recipients.length === 0 && group.unresolvedQualifiers.length === 0;
  if (hasNothing) {
    return (
      <p className="text-sm text-foreground-subtle">
        Nadie cumple el criterio todavía.
      </p>
    );
  }
  return (
    <ul className="space-y-1">
      {group.recipients.map((recipient) => {
        const soldier = soldierByPubkey.get(recipient.pubkey);
        const checked = selected.has(recipient.pubkey);
        return (
          <li key={recipient.pubkey}>
            <button
              type="button"
              onClick={() => onToggle(recipient.pubkey)}
              disabled={busy}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors disabled:opacity-60",
                checked
                  ? "border-bitcoin/40 bg-bitcoin/10"
                  : "border-border bg-white/[0.02] hover:bg-white/[0.05]",
              )}
            >
              <span
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                  checked
                    ? "border-bitcoin bg-bitcoin text-black"
                    : "border-border",
                )}
              >
                {checked && <Check className="h-3 w-3" />}
              </span>
              <Avatar name={recipient.name ?? "?"} picture={soldier?.picture} />
              <span className="min-w-0 flex-1 truncate text-sm">
                {recipient.name || recipient.nip05 || `${recipient.pubkey.slice(0, 10)}…`}
              </span>
            </button>
          </li>
        );
      })}
      {group.unresolvedQualifiers.map((qualifier) => (
        <li
          key={qualifier.slug}
          className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-white/[0.01] px-2 py-1.5 opacity-60"
          title="Sin Nostr vinculado — no se puede otorgar"
        >
          <span className="h-4 w-4 shrink-0" />
          <Avatar name={qualifier.name} muted />
          <span className="min-w-0 flex-1 truncate text-sm text-foreground-muted">
            {qualifier.name}
          </span>
          <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest text-foreground-subtle">
            sin Nostr
          </span>
        </li>
      ))}
    </ul>
  );
}

function ManualPicker({
  candidates,
  selected,
  query,
  onQuery,
  onToggle,
  busy,
}: {
  candidates: BadgeSoldierOption[];
  selected: Set<string>;
  query: string;
  onQuery: (value: string) => void;
  onToggle: (pubkey: string) => void;
  busy: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-black/20 px-2.5 py-1.5">
        <Search className="h-4 w-4 shrink-0 text-foreground-subtle" />
        <input
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Buscar soldado por nombre, github o nip05"
          disabled={busy}
          className="w-full bg-transparent text-sm outline-none placeholder:text-foreground-subtle"
        />
      </div>
      <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto pr-1">
        {candidates.length === 0 && (
          <li className="flex items-center gap-2 px-2 py-2 text-sm text-foreground-subtle">
            <Users className="h-4 w-4" />
            {query ? "Sin resultados." : "Escribí para buscar soldados."}
          </li>
        )}
        {candidates.map((soldier) => {
          const pubkey = soldier.pubkey!;
          const checked = selected.has(pubkey);
          return (
            <li key={soldier.id}>
              <button
                type="button"
                onClick={() => onToggle(pubkey)}
                disabled={busy}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors disabled:opacity-60",
                  checked
                    ? "border-bitcoin/40 bg-bitcoin/10"
                    : "border-border bg-white/[0.02] hover:bg-white/[0.05]",
                )}
              >
                <span
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                    checked
                      ? "border-bitcoin bg-bitcoin text-black"
                      : "border-border",
                  )}
                >
                  {checked && <Check className="h-3 w-3" />}
                </span>
                <Avatar name={soldier.name} picture={soldier.picture} />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {soldier.name}
                </span>
                {soldier.github && (
                  <span className="shrink-0 truncate text-xs text-foreground-subtle">
                    @{soldier.github}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
