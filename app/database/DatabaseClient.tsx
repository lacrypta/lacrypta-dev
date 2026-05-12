"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertCircle,
  Check,
  CircleDashed,
  Database,
  ExternalLink,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { DEFAULT_RELAYS } from "@/lib/nostrRelayConfig";
import {
  CATEGORIES,
  eventDisplayTitle,
  eventIdentityKey,
  type EventCategory,
} from "@/lib/databaseCatalog";
import { resolveLacryptaPubkey } from "@/lib/nostrReports";
import { cn } from "@/lib/cn";
import FullSyncModal from "./FullSyncModal";

type SignedEvent = {
  id: string;
  pubkey: string;
  kind: number;
  tags: string[][];
  content: string;
  created_at: number;
  sig: string;
};

type RelayState = "idle" | "connecting" | "receiving" | "done" | "error";

type ScanRow = {
  key: string;
  category: EventCategory;
  /** Newest event seen across all relays — used for republish. */
  event: SignedEvent;
  /** Map: relay → { event seen there, created_at } */
  coverage: Map<string, { eventId: string; createdAt: number }>;
};

type RelayStatus = {
  relay: string;
  state: RelayState;
  events: number;
  error?: string;
};

type RepublishResult = {
  rowKey: string;
  results: { relay: string; ok: boolean; error?: string }[];
};

const PER_RELAY_TIMEOUT_MS = 6_000;
const PUBLISH_TIMEOUT_MS = 8_000;

function normaliseRelayUrl(u: string): string {
  const s = u.trim().toLowerCase().replace(/\/+$/, "");
  if (!s) return "";
  if (s.startsWith("wss://") || s.startsWith("ws://")) return s;
  return `wss://${s}`;
}

export default function DatabaseClient() {
  const [relays, setRelays] = useState<string[]>([...DEFAULT_RELAYS]);
  const [selectedRelays, setSelectedRelays] = useState<Set<string>>(
    () => new Set(DEFAULT_RELAYS),
  );
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    () => new Set(CATEGORIES.map((c) => c.id)),
  );
  const [draftRelay, setDraftRelay] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);

  const [scanning, setScanning] = useState(false);
  const [rows, setRows] = useState<ScanRow[]>([]);
  const [relayStatuses, setRelayStatuses] = useState<RelayStatus[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const [envPubkey, setEnvPubkey] = useState<string>("");
  const [pubkeyInput, setPubkeyInput] = useState<string>("");
  const [pubkeyError, setPubkeyError] = useState<string | null>(null);
  const [republishingRow, setRepublishingRow] = useState<string | null>(null);
  const [republishResults, setRepublishResults] = useState<
    Record<string, RepublishResult["results"]>
  >({});
  const [bulkProgress, setBulkProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);

  // Effective pubkey: env-resolved if available, otherwise whatever the user
  // pasted into the input. Filters that need an author key use this.
  const [effectivePubkey, setEffectivePubkey] = useState<string>("");

  const [fullSyncOpen, setFullSyncOpen] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    resolveLacryptaPubkey().then((pk) => {
      setEnvPubkey(pk);
      if (pk) setEffectivePubkey(pk);
    });
  }, []);

  const applyPubkeyOverride = useCallback(async () => {
    const raw = pubkeyInput.trim();
    if (!raw) {
      setPubkeyError("Pegá un npub o pubkey en hex");
      return;
    }
    if (/^[0-9a-f]{64}$/i.test(raw)) {
      setEffectivePubkey(raw.toLowerCase());
      setPubkeyError(null);
      return;
    }
    if (raw.startsWith("npub1")) {
      try {
        const { decode } = await import("nostr-tools/nip19");
        const r = decode(raw);
        if (r.type === "npub") {
          setEffectivePubkey(r.data as string);
          setPubkeyError(null);
          return;
        }
      } catch {
        /* fall through */
      }
    }
    setPubkeyError("Formato inválido (esperado npub1… o 64 caracteres hex)");
  }, [pubkeyInput]);

  const clearPubkeyOverride = useCallback(() => {
    setEffectivePubkey(envPubkey);
    setPubkeyInput("");
    setPubkeyError(null);
  }, [envPubkey]);

  const toggleRelay = useCallback((url: string) => {
    setSelectedRelays((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  }, []);

  const removeRelay = useCallback((url: string) => {
    setRelays((prev) => prev.filter((r) => r !== url));
    setSelectedRelays((prev) => {
      const next = new Set(prev);
      next.delete(url);
      return next;
    });
  }, []);

  const addRelay = useCallback(() => {
    const url = normaliseRelayUrl(draftRelay);
    if (!url) {
      setDraftError("URL vacía");
      return;
    }
    if (!/^wss?:\/\/[^\s]+$/i.test(url)) {
      setDraftError("Formato inválido (esperado wss://...)");
      return;
    }
    if (relays.includes(url)) {
      setDraftError("Ya está en la lista");
      return;
    }
    setRelays((prev) => [...prev, url]);
    setSelectedRelays((prev) => new Set(prev).add(url));
    setDraftRelay("");
    setDraftError(null);
  }, [draftRelay, relays]);

  const toggleCategory = useCallback((id: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const scan = useCallback(async () => {
    if (selectedRelays.size === 0) {
      setScanError("Seleccioná al menos un relay.");
      return;
    }
    if (selectedCategories.size === 0) {
      setScanError("Seleccioná al menos una categoría.");
      return;
    }

    setScanError(null);
    setRows([]);
    setRepublishResults({});
    setScanning(true);

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    const relayList = [...selectedRelays];
    const cats = CATEGORIES.filter((c) => selectedCategories.has(c.id));

    const statuses = new Map<string, RelayStatus>(
      relayList.map((r) => [r, { relay: r, state: "idle", events: 0 }]),
    );
    const flushStatuses = () =>
      setRelayStatuses(relayList.map((r) => statuses.get(r)!));
    flushStatuses();

    const coverageByKey = new Map<string, ScanRow>();

    try {
      const { SimplePool } = await import("nostr-tools/pool");

      // One subscription per (category, relay). Some categories require the
      // resolved LaCrypta pubkey; skip those if it's missing.
      const tasks: Promise<void>[] = [];
      for (const cat of cats) {
        const filter = cat.buildFilter({ lacryptaPubkey: effectivePubkey });
        if (!filter) continue;

        for (const relay of relayList) {
          tasks.push(
            (async () => {
              const pool = new SimplePool();
              const status = statuses.get(relay)!;
              if (status.state === "idle") {
                status.state = "connecting";
                flushStatuses();
              }
              try {
                const closer = pool.subscribe([relay], filter, {
                  onevent(ev: SignedEvent) {
                    status.state = "receiving";
                    status.events += 1;
                    const key = `${cat.id}::${eventIdentityKey(cat, ev)}`;
                    const existing = coverageByKey.get(key);
                    if (existing) {
                      // Newer event wins.
                      if (ev.created_at > existing.event.created_at) {
                        existing.event = ev;
                      }
                      existing.coverage.set(relay, {
                        eventId: ev.id,
                        createdAt: ev.created_at,
                      });
                    } else {
                      const row: ScanRow = {
                        key,
                        category: cat,
                        event: ev,
                        coverage: new Map([
                          [relay, { eventId: ev.id, createdAt: ev.created_at }],
                        ]),
                      };
                      coverageByKey.set(key, row);
                    }
                    setRows([...coverageByKey.values()]);
                    flushStatuses();
                  },
                  oneose() {
                    /* timed externally */
                  },
                });
                await new Promise<void>((resolve) => {
                  const t = setTimeout(resolve, PER_RELAY_TIMEOUT_MS);
                  controller.signal.addEventListener("abort", () => {
                    clearTimeout(t);
                    resolve();
                  });
                });
                closer.close();
              } catch (e) {
                status.state = "error";
                status.error = e instanceof Error ? e.message : String(e);
                flushStatuses();
              } finally {
                try {
                  pool.close([relay]);
                } catch {
                  /* noop */
                }
              }
            })(),
          );
        }
      }

      await Promise.all(tasks);
      // After all subs settle, mark connecting/receiving as done.
      for (const s of statuses.values()) {
        if (s.state === "connecting" || s.state === "receiving") {
          s.state = "done";
        }
      }
      flushStatuses();
      setRows([...coverageByKey.values()]);
    } catch (e) {
      setScanError(e instanceof Error ? e.message : String(e));
    } finally {
      setScanning(false);
    }
  }, [selectedRelays, selectedCategories, effectivePubkey]);

  const republish = useCallback(
    async (row: ScanRow) => {
      const missing = [...selectedRelays].filter((r) => !row.coverage.has(r));
      if (missing.length === 0) return;
      setRepublishingRow(row.key);
      try {
        const { SimplePool } = await import("nostr-tools/pool");
        const pool = new SimplePool();
        const promises = pool.publish(missing, row.event);
        const results = await Promise.all(
          promises.map(async (p, i) => {
            const relay = missing[i]!;
            try {
              await Promise.race([
                p,
                new Promise((_, reject) =>
                  setTimeout(
                    () => reject(new Error("timeout")),
                    PUBLISH_TIMEOUT_MS,
                  ),
                ),
              ]);
              return { relay, ok: true } as const;
            } catch (e) {
              return {
                relay,
                ok: false,
                error: e instanceof Error ? e.message : String(e),
              } as const;
            }
          }),
        );
        try {
          pool.close(missing);
        } catch {
          /* noop */
        }
        // Optimistically mark successful relays as covered so the row updates.
        const okRelays = new Set(results.filter((r) => r.ok).map((r) => r.relay));
        if (okRelays.size > 0) {
          setRows((prev) =>
            prev.map((r) => {
              if (r.key !== row.key) return r;
              const next = new Map(r.coverage);
              for (const relay of okRelays) {
                next.set(relay, {
                  eventId: r.event.id,
                  createdAt: r.event.created_at,
                });
              }
              return { ...r, coverage: next };
            }),
          );
        }
        setRepublishResults((prev) => ({ ...prev, [row.key]: results }));
      } finally {
        setRepublishingRow(null);
      }
    },
    [selectedRelays],
  );

  const republishAllMissing = useCallback(async () => {
    const relayList = [...selectedRelays];
    const targets = rows.filter((row) =>
      relayList.some((relay) => !row.coverage.has(relay)),
    );
    if (targets.length === 0) return;
    setBulkProgress({ current: 0, total: targets.length });
    try {
      for (let i = 0; i < targets.length; i++) {
        await republish(targets[i]!);
        setBulkProgress({ current: i + 1, total: targets.length });
      }
    } finally {
      setBulkProgress(null);
    }
  }, [rows, selectedRelays, republish]);

  const groupedRows = useMemo(() => {
    const groups = new Map<string, ScanRow[]>();
    for (const r of rows) {
      const arr = groups.get(r.category.id) ?? [];
      arr.push(r);
      groups.set(r.category.id, arr);
    }
    for (const arr of groups.values()) {
      arr.sort((a, b) => b.event.created_at - a.event.created_at);
    }
    return groups;
  }, [rows]);

  const totals = useMemo(() => {
    const totalRelays = selectedRelays.size;
    let totalEvents = 0;
    let totalMissingPairs = 0;
    let rowsWithGaps = 0;
    for (const r of rows) {
      totalEvents += 1;
      const missing = Math.max(0, totalRelays - r.coverage.size);
      totalMissingPairs += missing;
      if (missing > 0) rowsWithGaps += 1;
    }
    return { totalEvents, totalMissingPairs, totalRelays, rowsWithGaps };
  }, [rows, selectedRelays]);

  return (
    <div className="relative pt-24 pb-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <header className="space-y-2">
          <div className="inline-flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-foreground-subtle">
            <Database className="h-3 w-3" />
            Internal · noindex
          </div>
          <h1 className="font-display text-4xl sm:text-5xl font-black tracking-tight">
            Database
          </h1>
          <p className="text-sm text-foreground-muted max-w-2xl">
            Explorá los eventos Nostr que usa el sitio. Elegí relays y categorías,
            scanea y republicá los eventos que falten en cada relay.
          </p>
          <PubkeyOverride
            envPubkey={envPubkey}
            effectivePubkey={effectivePubkey}
            input={pubkeyInput}
            error={pubkeyError}
            onInputChange={(v) => {
              setPubkeyInput(v);
              if (pubkeyError) setPubkeyError(null);
            }}
            onApply={applyPubkeyOverride}
            onClear={clearPubkeyOverride}
          />
        </header>

        {/* ── Relay & category controls ───────────────────────────────────── */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Panel
            title="Relays"
            subtitle={`${selectedRelays.size} de ${relays.length} seleccionados`}
          >
            <div className="space-y-2">
              {relays.map((url) => {
                const status = relayStatuses.find((s) => s.relay === url);
                const selected = selectedRelays.has(url);
                return (
                  <div
                    key={url}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-colors",
                      selected
                        ? "border-cyan/40 bg-cyan/[0.04]"
                        : "border-border bg-white/[0.02]",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleRelay(url)}
                      className="h-3.5 w-3.5 rounded border-border bg-transparent accent-cyan"
                    />
                    <span className="flex-1 min-w-0 text-xs font-mono truncate">
                      {url}
                    </span>
                    {status && <RelayBadge status={status} />}
                    <button
                      type="button"
                      onClick={() => removeRelay(url)}
                      className="p-1 rounded text-foreground-subtle hover:text-danger hover:bg-danger/10 transition-colors"
                      aria-label="Quitar relay"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
              <div className="flex gap-2 pt-1">
                <input
                  type="text"
                  value={draftRelay}
                  onChange={(e) => {
                    setDraftRelay(e.target.value);
                    if (draftError) setDraftError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addRelay();
                    }
                  }}
                  placeholder="wss://relay.example.com"
                  spellCheck={false}
                  autoComplete="off"
                  className="flex-1 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-border focus:border-bitcoin/50 focus:bg-white/[0.05] transition-colors text-xs font-mono placeholder:text-foreground-subtle"
                />
                <button
                  type="button"
                  onClick={addRelay}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border bg-white/[0.03] hover:bg-white/[0.06] text-xs font-semibold transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Agregar
                </button>
              </div>
              {draftError && (
                <p className="text-[11px] text-danger font-mono">{draftError}</p>
              )}
            </div>
          </Panel>

          <Panel
            title="Categorías"
            subtitle={`${selectedCategories.size} de ${CATEGORIES.length} seleccionadas`}
          >
            <div className="space-y-2">
              {CATEGORIES.map((c) => {
                const selected = selectedCategories.has(c.id);
                const needsPubkey = c.requiresLacryptaPubkey && !effectivePubkey;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleCategory(c.id)}
                    className={cn(
                      "w-full text-left flex items-start gap-2.5 rounded-lg border px-2.5 py-2 transition-colors",
                      selected
                        ? "border-bitcoin/40 bg-bitcoin/[0.05]"
                        : "border-border bg-white/[0.02] hover:bg-white/[0.04]",
                    )}
                  >
                    <span
                      className={cn(
                        "shrink-0 mt-0.5 h-3.5 w-3.5 rounded border inline-flex items-center justify-center",
                        selected
                          ? "bg-bitcoin/80 border-bitcoin"
                          : "border-border",
                      )}
                    >
                      {selected && (
                        <Check className="h-2.5 w-2.5 text-background" strokeWidth={4} />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-xs font-semibold flex-wrap">
                        {c.label}
                        <span className="px-1.5 py-0.5 rounded border border-border text-[9px] font-mono text-foreground-subtle">
                          kind:{c.kind}
                        </span>
                        {needsPubkey && (
                          <span className="px-1.5 py-0.5 rounded border border-bitcoin/30 bg-bitcoin/[0.05] text-[9px] font-mono text-bitcoin">
                            necesita pubkey
                          </span>
                        )}
                      </span>
                      <span className="block text-[11px] text-foreground-subtle mt-0.5">
                        {c.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Panel>
        </section>

        {/* ── Scan controls ───────────────────────────────────────────────── */}
        <section className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={scan}
            disabled={scanning}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-bitcoin/40 bg-bitcoin/10 hover:bg-bitcoin/15 text-bitcoin text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {scanning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Scaneando…
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Scanear
              </>
            )}
          </button>
          {totals.rowsWithGaps > 0 && (
            <button
              type="button"
              onClick={republishAllMissing}
              disabled={scanning || bulkProgress !== null}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-nostr/40 bg-nostr/10 hover:bg-nostr/15 text-nostr text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {bulkProgress ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Republicando {bulkProgress.current}/{bulkProgress.total}…
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Republicar todos los faltantes ({totals.rowsWithGaps})
                </>
              )}
            </button>
          )}
          <button
            type="button"
            onClick={() => setFullSyncOpen(true)}
            disabled={scanning || bulkProgress !== null}
            title="Scanea las 10 categorías en los relays configurados y republica todo lo que falte, mostrando el proceso."
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-cyan/40 bg-cyan/10 hover:bg-cyan/15 text-cyan text-sm font-semibold transition-colors disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" />
            Sincronizar todo
          </button>
          {scanError && (
            <div className="inline-flex items-center gap-1.5 text-xs text-danger">
              <AlertCircle className="h-3.5 w-3.5" />
              {scanError}
            </div>
          )}
          {rows.length > 0 && (
            <div className="text-[11px] font-mono text-foreground-subtle ml-auto">
              {totals.totalEvents} eventos · {totals.totalMissingPairs} ausencias
              detectadas
            </div>
          )}
        </section>

        {/* ── Results ─────────────────────────────────────────────────────── */}
        <section className="space-y-6">
          {rows.length === 0 && !scanning && (
            <div className="rounded-2xl border border-dashed border-border bg-background-card/30 p-10 text-center">
              <CircleDashed className="h-6 w-6 mx-auto text-foreground-subtle mb-2" />
              <p className="text-sm text-foreground-muted">
                Apretá <span className="font-semibold">Scanear</span> para ver los
                eventos en los relays elegidos.
              </p>
            </div>
          )}

          {[...groupedRows.entries()].map(([catId, catRows]) => {
            const cat = CATEGORIES.find((c) => c.id === catId)!;
            return (
              <div
                key={catId}
                className="rounded-2xl border border-border bg-background-card/50 overflow-hidden"
              >
                <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display font-bold text-sm uppercase tracking-widest">
                      {cat.label}
                    </h2>
                    <p className="text-[11px] font-mono text-foreground-subtle">
                      {cat.source} · {catRows.length} evento(s)
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full border border-border text-[10px] font-mono text-foreground-subtle">
                    kind:{cat.kind}
                  </span>
                </div>

                <ul className="divide-y divide-border">
                  {catRows.map((row) => (
                    <EventRow
                      key={row.key}
                      row={row}
                      selectedRelays={[...selectedRelays]}
                      onRepublish={() => republish(row)}
                      republishing={republishingRow === row.key}
                      lastResults={republishResults[row.key]}
                    />
                  ))}
                </ul>
              </div>
            );
          })}
        </section>
      </div>

      <FullSyncModal
        open={fullSyncOpen}
        onClose={() => setFullSyncOpen(false)}
        relays={relays}
        pubkey={effectivePubkey}
      />
    </div>
  );
}

/* ───────────────────────────── primitives ───────────────────────────────── */

function PubkeyOverride({
  envPubkey,
  effectivePubkey,
  input,
  error,
  onInputChange,
  onApply,
  onClear,
}: {
  envPubkey: string;
  effectivePubkey: string;
  input: string;
  error: string | null;
  onInputChange: (v: string) => void;
  onApply: () => void;
  onClear: () => void;
}) {
  const isOverride = effectivePubkey !== "" && effectivePubkey !== envPubkey;

  if (effectivePubkey) {
    return (
      <div className="mt-1 inline-flex items-center gap-2 flex-wrap text-[10px] font-mono">
        <span
          className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border",
            isOverride
              ? "border-cyan/30 bg-cyan/[0.05] text-cyan"
              : "border-border text-foreground-subtle",
          )}
        >
          {isOverride ? "override" : "env"} ·{" "}
          {effectivePubkey.slice(0, 12)}…{effectivePubkey.slice(-8)}
        </span>
        {isOverride && (
          <button
            type="button"
            onClick={onClear}
            className="text-foreground-subtle hover:text-foreground underline underline-offset-2"
          >
            quitar override
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-1.5 max-w-2xl">
      <div className="text-[10px] font-mono text-bitcoin inline-flex items-center gap-1">
        <AlertCircle className="h-3 w-3" />
        NEXT_PUBLIC_LACRYPTA_NPUB no resuelto. Pegá una pubkey para habilitar el
        resto de los eventos.
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onApply();
            }
          }}
          placeholder="npub1… o 64 caracteres hex"
          spellCheck={false}
          autoComplete="off"
          className="flex-1 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-border focus:border-bitcoin/50 focus:bg-white/[0.05] transition-colors text-xs font-mono placeholder:text-foreground-subtle"
        />
        <button
          type="button"
          onClick={onApply}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-cyan/40 bg-cyan/10 hover:bg-cyan/15 text-cyan text-xs font-semibold transition-colors"
        >
          Aplicar
        </button>
      </div>
      {error && <p className="text-[11px] text-danger font-mono">{error}</p>}
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background-card/50 p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-display font-bold text-sm uppercase tracking-widest">
          {title}
        </h2>
        {subtitle && (
          <span className="text-[10px] font-mono text-foreground-subtle">
            {subtitle}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function RelayBadge({ status }: { status: RelayStatus }) {
  const tone =
    status.state === "done"
      ? "border-cyan/30 text-cyan"
      : status.state === "error"
        ? "border-danger/40 text-danger"
        : status.state === "receiving"
          ? "border-bitcoin/30 text-bitcoin"
          : status.state === "connecting"
            ? "border-foreground-subtle/30 text-foreground-subtle"
            : "border-border text-foreground-subtle";
  const label =
    status.state === "idle"
      ? "—"
      : status.state === "connecting"
        ? "…"
        : status.state === "error"
          ? "ERR"
          : `${status.events}`;
  return (
    <span
      className={cn(
        "shrink-0 inline-flex items-center px-1.5 py-0.5 rounded border text-[9px] font-mono tabular-nums",
        tone,
      )}
      title={status.error ?? status.state}
    >
      {label}
    </span>
  );
}

function EventRow({
  row,
  selectedRelays,
  onRepublish,
  republishing,
  lastResults,
}: {
  row: ScanRow;
  selectedRelays: string[];
  onRepublish: () => void;
  republishing: boolean;
  lastResults?: RepublishResult["results"];
}) {
  const title = eventDisplayTitle(row.category, row.event);
  const missing = selectedRelays.filter((r) => !row.coverage.has(r));
  const dTag = row.event.tags.find((t) => t[0] === "d")?.[1];

  return (
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm truncate max-w-md">
              {title}
            </span>
            <a
              href={`https://njump.me/${row.event.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[10px] font-mono text-foreground-subtle hover:text-foreground transition-colors"
              title="Ver en njump.me"
            >
              {row.event.id.slice(0, 12)}…
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          </div>
          <div className="mt-0.5 text-[10px] font-mono text-foreground-subtle break-all">
            pk {row.event.pubkey.slice(0, 12)}…
            {dTag && <> · d {dTag}</>} · ts {row.event.created_at}
          </div>
        </div>
        <button
          type="button"
          onClick={onRepublish}
          disabled={republishing || missing.length === 0}
          className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-colors",
            missing.length === 0
              ? "border-border bg-white/[0.02] text-foreground-subtle cursor-not-allowed"
              : "border-nostr/40 bg-nostr/10 text-nostr hover:bg-nostr/15",
            republishing && "opacity-60",
          )}
        >
          {republishing ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Upload className="h-3 w-3" />
          )}
          {missing.length === 0
            ? "Completo"
            : `Republicar en ${missing.length}`}
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {selectedRelays.map((relay) => {
          const has = row.coverage.has(relay);
          const lastResult = lastResults?.find((r) => r.relay === relay);
          const justPublished = lastResult?.ok;
          const failed = lastResult && !lastResult.ok;
          return (
            <span
              key={relay}
              title={
                failed
                  ? `${relay} · ${lastResult.error ?? "error"}`
                  : `${relay} · ${has ? "presente" : "ausente"}`
              }
              className={cn(
                "inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-mono",
                has
                  ? justPublished
                    ? "border-lightning/40 bg-lightning/10 text-lightning"
                    : "border-cyan/30 bg-cyan/[0.05] text-cyan"
                  : failed
                    ? "border-danger/40 bg-danger/10 text-danger"
                    : "border-border bg-white/[0.02] text-foreground-subtle",
              )}
            >
              {has ? (
                <Check className="h-2.5 w-2.5" strokeWidth={3} />
              ) : failed ? (
                <X className="h-2.5 w-2.5" strokeWidth={3} />
              ) : (
                <CircleDashed className="h-2.5 w-2.5" />
              )}
              {relay.replace(/^wss:\/\//, "")}
            </span>
          );
        })}
      </div>
    </li>
  );
}
