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
  ChevronDown,
  ChevronRight,
  Database,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
  Server,
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
import { cn } from "@/lib/cn";
import NpubBadge from "@/components/NpubBadge";

type SignedEvent = {
  id: string;
  pubkey: string;
  kind: number;
  tags: string[][];
  content: string;
  created_at: number;
  sig: string;
};

type ScanRow = {
  key: string;
  event: SignedEvent;
  coverage: Map<string, { eventId: string; createdAt: number }>;
};

type RelayState = "idle" | "connecting" | "receiving" | "done" | "error";
type RelayStatus = { relay: string; state: RelayState; events: number; error?: string };

const PER_RELAY_TIMEOUT_MS = 6_000;
const PUBLISH_TIMEOUT_MS = 8_000;

/* Extra, category-specific columns (parsed from content). */
const EXTRA_COLS: Record<string, string[]> = {
  "community-projects": ["status", "equipo", "tech"],
  "user-projects": ["status", "equipo", "tech"],
  "hackathon-reports": ["posición", "score"],
  "hackathon-results": ["podio"],
  "lacrypta-profile": ["nip05"],
};

function extraValues(catId: string, ev: SignedEvent): string[] {
  const cols = EXTRA_COLS[catId];
  if (!cols) return [];
  let c: Record<string, unknown> = {};
  try {
    c = JSON.parse(ev.content) as Record<string, unknown>;
  } catch {
    /* noop */
  }
  switch (catId) {
    case "community-projects":
    case "user-projects":
      return [
        String(c.status ?? "—"),
        Array.isArray(c.team) ? String(c.team.length) : "0",
        Array.isArray(c.tech) ? String(c.tech.length) : "0",
      ];
    case "hackathon-reports":
      return [
        c.position != null ? `#${c.position}` : "—",
        c.finalScore != null ? String(c.finalScore) : "—",
      ];
    case "hackathon-results":
      return [Array.isArray(c.podium) ? String(c.podium.length) : "—"];
    case "lacrypta-profile":
      return [String(c.nip05 ?? "—")];
    default:
      return [];
  }
}

function fmtDate(unix: number): string {
  try {
    return new Intl.DateTimeFormat("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(unix * 1000));
  } catch {
    return String(unix);
  }
}

export default function ExplorerStudio({
  pubkey,
  focusCategoryId,
  onConsumedFocus,
}: {
  pubkey: string;
  focusCategoryId?: string | null;
  onConsumedFocus?: () => void;
}) {
  const [relays, setRelays] = useState<string[]>([...DEFAULT_RELAYS]);
  const [selectedRelays, setSelectedRelays] = useState<Set<string>>(
    () => new Set(DEFAULT_RELAYS),
  );
  const [activeId, setActiveId] = useState<string>(CATEGORIES[0].id);
  const [cache, setCache] = useState<Record<string, ScanRow[]>>({});
  const [scannedAt, setScannedAt] = useState<Record<string, number>>({});
  const [scanningIds, setScanningIds] = useState<Set<string>>(() => new Set());
  const [relayStatuses, setRelayStatuses] = useState<RelayStatus[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showRelays, setShowRelays] = useState(false);
  const [republishingKey, setRepublishingKey] = useState<string | null>(null);

  const activeCat = useMemo(
    () => CATEGORIES.find((c) => c.id === activeId)!,
    [activeId],
  );
  const pubkeyRef = useRef(pubkey);
  useEffect(() => void (pubkeyRef.current = pubkey), [pubkey]);

  // Synchronous source of truth for "is this category scanning" — used by the
  // auto-scan guard so two scans of the same table can never start. The Set
  // state mirrors it for rendering spinners.
  const inFlightRef = useRef<Set<string>>(new Set());
  const activeIdRef = useRef(activeId);
  useEffect(() => void (activeIdRef.current = activeId), [activeId]);

  const markScanning = useCallback((id: string, on: boolean) => {
    if (on) inFlightRef.current.add(id);
    else inFlightRef.current.delete(id);
    setScanningIds(new Set(inFlightRef.current));
  }, []);

  // Merge fresh scan rows onto whatever coverage we already knew, so a late
  // scan can't revert a just-republished relay back to "missing".
  const commitRows = useCallback((catId: string, rowsArr: ScanRow[]) => {
    setCache((prev) => {
      const old = new Map((prev[catId] ?? []).map((r) => [r.key, r]));
      const merged = rowsArr.map((r) => {
        const o = old.get(r.key);
        if (!o) return r;
        const coverage = new Map(o.coverage);
        for (const [k, v] of r.coverage) coverage.set(k, v);
        return { ...r, coverage };
      });
      return { ...prev, [catId]: merged };
    });
  }, []);

  const scan = useCallback(
    async (cat: EventCategory) => {
      // Pin the pubkey this scan was built for; if it changes mid-flight the
      // results belong to a different account and must be discarded.
      const reqPubkey = pubkeyRef.current;
      const stale = () => pubkeyRef.current !== reqPubkey;
      const filter = cat.buildFilter({ lacryptaPubkey: reqPubkey });
      if (!filter) {
        if (activeIdRef.current === cat.id)
          setScanError("Esta tabla necesita la pubkey de La Crypta (pegala arriba).");
        return;
      }
      if (inFlightRef.current.has(cat.id)) return; // single-flight per table
      markScanning(cat.id, true);
      if (activeIdRef.current === cat.id) setScanError(null);
      const relayList = [...selectedRelays];
      const statuses = new Map<string, RelayStatus>(
        relayList.map((r) => [r, { relay: r, state: "idle", events: 0 }]),
      );
      // Only the table currently on screen owns the shared relay-status row.
      const flush = () => {
        if (activeIdRef.current === cat.id)
          setRelayStatuses(relayList.map((r) => statuses.get(r)!));
      };
      flush();

      const byKey = new Map<string, ScanRow>();
      try {
        const { SimplePool } = await import("nostr-tools/pool");
        await Promise.all(
          relayList.map(async (relay) => {
            const pool = new SimplePool();
            const status = statuses.get(relay)!;
            status.state = "connecting";
            flush();
            try {
              const closer = pool.subscribe([relay], filter, {
                onevent(ev: SignedEvent) {
                  status.state = "receiving";
                  status.events += 1;
                  const key = eventIdentityKey(cat, ev);
                  const existing = byKey.get(key);
                  if (existing) {
                    if (ev.created_at > existing.event.created_at) existing.event = ev;
                    existing.coverage.set(relay, { eventId: ev.id, createdAt: ev.created_at });
                  } else {
                    byKey.set(key, {
                      key,
                      event: ev,
                      coverage: new Map([[relay, { eventId: ev.id, createdAt: ev.created_at }]]),
                    });
                  }
                  if (!stale()) commitRows(cat.id, [...byKey.values()]);
                  flush();
                },
                oneose() {},
              });
              await new Promise<void>((r) => setTimeout(r, PER_RELAY_TIMEOUT_MS));
              closer.close();
            } catch (e) {
              status.state = "error";
              status.error = e instanceof Error ? e.message : String(e);
              flush();
            } finally {
              try {
                pool.close([relay]);
              } catch {}
            }
          }),
        );
        for (const s of statuses.values()) {
          if (s.state === "connecting" || s.state === "receiving") s.state = "done";
        }
        flush();
        if (!stale()) {
          commitRows(cat.id, [...byKey.values()]);
          setScannedAt((prev) => ({ ...prev, [cat.id]: Date.now() }));
        }
      } catch (e) {
        if (activeIdRef.current === cat.id)
          setScanError(e instanceof Error ? e.message : String(e));
      } finally {
        markScanning(cat.id, false);
      }
    },
    [selectedRelays, markScanning, commitRows],
  );

  // Auto-scan whenever a not-yet-loaded table becomes active; reset the shared
  // per-view banner/statuses so a previous table's error can't linger.
  useEffect(() => {
    setScanError(null);
    setRelayStatuses([]);
    if (cache[activeId] === undefined && !inFlightRef.current.has(activeId)) {
      void scan(activeCat);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // External focus (from the Estructura "Ver datos" button): just select the
  // table — the auto-scan effect above owns the single scan for it.
  useEffect(() => {
    if (!focusCategoryId) return;
    setActiveId(focusCategoryId);
    onConsumedFocus?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusCategoryId]);

  // The pubkey scopes which events the author-filtered tables return, so when it
  // changes we drop every cached row (they belonged to the old account, and must
  // not be shown or republished under the new one) and re-scan the active table.
  const pubkeyInitDone = useRef(false);
  useEffect(() => {
    if (!pubkeyInitDone.current) {
      pubkeyInitDone.current = true;
      return;
    }
    inFlightRef.current.clear();
    setScanningIds(new Set());
    setCache({});
    setScannedAt({});
    setRelayStatuses([]);
    setExpandedKey(null);
    setScanError(null);
    void scan(activeCat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pubkey]);

  const toggleRelay = useCallback((url: string) => {
    setSelectedRelays((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  }, []);

  const republish = useCallback(
    async (row: ScanRow) => {
      const missing = [...selectedRelays].filter((r) => !row.coverage.has(r));
      if (missing.length === 0) return;
      setRepublishingKey(row.key);
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
                  setTimeout(() => reject(new Error("timeout")), PUBLISH_TIMEOUT_MS),
                ),
              ]);
              return { relay, ok: true };
            } catch {
              return { relay, ok: false };
            }
          }),
        );
        try {
          pool.close(missing);
        } catch {}
        const okRelays = new Set(results.filter((r) => r.ok).map((r) => r.relay));
        if (okRelays.size > 0) {
          setCache((prev) => ({
            ...prev,
            [activeId]: (prev[activeId] ?? []).map((r) => {
              if (r.key !== row.key) return r;
              const next = new Map(r.coverage);
              for (const relay of okRelays)
                next.set(relay, { eventId: r.event.id, createdAt: r.event.created_at });
              return { ...r, coverage: next };
            }),
          }));
        }
      } finally {
        setRepublishingKey(null);
      }
    },
    [selectedRelays, activeId],
  );

  const rows = cache[activeId] ?? [];
  const extraCols = EXTRA_COLS[activeId] ?? [];

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sorted = [...rows].sort((a, b) => b.event.created_at - a.event.created_at);
    if (!q) return sorted;
    return sorted.filter((r) => {
      const title = eventDisplayTitle(activeCat, r.event).toLowerCase();
      const d = r.event.tags.find((t) => t[0] === "d")?.[1]?.toLowerCase() ?? "";
      return title.includes(q) || d.includes(q) || r.event.pubkey.includes(q) || r.event.id.includes(q);
    });
  }, [rows, search, activeCat]);

  const totalRelays = selectedRelays.size;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[230px_1fr] gap-4 min-h-[60vh]">
      {/* ── Tables sidebar ─────────────────────────────────────────────── */}
      <aside className="rounded-2xl border border-border bg-background-card/50 overflow-hidden h-fit lg:sticky lg:top-24">
        <div className="px-3 py-2.5 border-b border-border flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-foreground-subtle">
          <Database className="h-3 w-3" />
          Tablas
        </div>
        <ul className="p-1.5 space-y-0.5">
          {CATEGORIES.map((c) => {
            const count = cache[c.id]?.length;
            const active = activeId === c.id;
            const loading = scanningIds.has(c.id);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    setActiveId(c.id);
                    setExpandedKey(null);
                  }}
                  className={cn(
                    "w-full text-left flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-colors",
                    active ? "bg-bitcoin/15 text-bitcoin" : "text-foreground-muted hover:bg-white/[0.04]",
                  )}
                >
                  <span className="flex-1 min-w-0 text-xs font-medium truncate">{c.shortLabel}</span>
                  {loading ? (
                    <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                  ) : count !== undefined ? (
                    <span
                      className={cn(
                        "shrink-0 px-1.5 rounded-full text-[9px] font-mono tabular-nums",
                        active ? "bg-bitcoin/20" : "bg-white/[0.06] text-foreground-subtle",
                      )}
                    >
                      {count}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* ── Table panel ────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-background-card/40 overflow-hidden flex flex-col">
        {/* toolbar */}
        <div className="px-3 py-2.5 border-b border-border flex flex-wrap items-center gap-2">
          <div>
            <h2 className="font-display font-bold text-sm flex items-center gap-2">
              {activeCat.label}
              <span className="px-1.5 py-0.5 rounded border border-border text-[9px] font-mono text-foreground-subtle">
                kind:{activeCat.kind}
              </span>
            </h2>
            <p className="text-[10px] font-mono text-foreground-subtle">
              {activeCat.source}
              {scannedAt[activeId] && (
                <> · {filteredRows.length} fila(s)</>
              )}
            </p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-foreground-subtle" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filtrar…"
                spellCheck={false}
                className="w-40 pl-7 pr-2 py-1.5 rounded-lg bg-white/[0.03] border border-border focus:border-bitcoin/50 text-xs placeholder:text-foreground-subtle"
              />
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowRelays((v) => !v)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-white/[0.03] hover:bg-white/[0.06] text-xs font-semibold transition-colors"
              >
                <Server className="h-3.5 w-3.5" />
                {totalRelays} relays
                <ChevronDown className="h-3 w-3" />
              </button>
              {showRelays && (
                <div className="absolute right-0 top-full mt-1 z-30 w-72 rounded-xl border border-border-strong bg-background-elevated p-2 shadow-2xl">
                  {relays.map((url) => {
                    const st = relayStatuses.find((s) => s.relay === url);
                    return (
                      <label
                        key={url}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/[0.04] cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedRelays.has(url)}
                          onChange={() => toggleRelay(url)}
                          className="h-3.5 w-3.5 accent-cyan"
                        />
                        <span className="flex-1 min-w-0 text-[11px] font-mono truncate">
                          {url.replace(/^wss:\/\//, "")}
                        </span>
                        {st && st.state !== "idle" && (
                          <span className="text-[9px] font-mono text-foreground-subtle tabular-nums">
                            {st.state === "error" ? "ERR" : st.events}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => scan(activeCat)}
              disabled={scanningIds.has(activeId)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-bitcoin/40 bg-bitcoin/10 hover:bg-bitcoin/15 text-bitcoin text-xs font-semibold transition-colors disabled:opacity-50"
            >
              {scanningIds.has(activeId) ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Refrescar
            </button>
          </div>
        </div>

        {scanError && (
          <div className="px-3 py-2 border-b border-border inline-flex items-center gap-1.5 text-xs text-danger">
            <AlertCircle className="h-3.5 w-3.5" />
            {scanError}
          </div>
        )}

        {/* table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-[9px] font-mono uppercase tracking-wider text-foreground-subtle bg-white/[0.02]">
                <th className="w-6" />
                <th className="px-3 py-2 font-medium">Título</th>
                {extraCols.map((c) => (
                  <th key={c} className="px-3 py-2 font-medium">{c}</th>
                ))}
                <th className="px-3 py-2 font-medium">d-tag</th>
                <th className="px-3 py-2 font-medium">autor</th>
                <th className="px-3 py-2 font-medium">creado</th>
                <th className="px-3 py-2 font-medium">relays</th>
                <th className="px-3 py-2 font-medium text-right">acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredRows.map((row) => {
                const title = eventDisplayTitle(activeCat, row.event);
                const dTag = row.event.tags.find((t) => t[0] === "d")?.[1] ?? "—";
                const extras = extraValues(activeId, row.event);
                const expanded = expandedKey === row.key;
                const missing = [...selectedRelays].filter((r) => !row.coverage.has(r));
                return (
                  <TableRow
                    key={row.key}
                    row={row}
                    title={title}
                    dTag={dTag}
                    extras={extras}
                    extraCols={extraCols}
                    selectedRelays={[...selectedRelays]}
                    totalRelays={totalRelays}
                    missing={missing}
                    expanded={expanded}
                    onToggle={() => setExpandedKey(expanded ? null : row.key)}
                    onRepublish={() => republish(row)}
                    republishing={republishingKey === row.key}
                  />
                );
              })}
            </tbody>
          </table>

          {filteredRows.length === 0 && (
            <div className="p-12 text-center">
              {scanningIds.has(activeId) ? (
                <span className="inline-flex items-center gap-2 text-sm text-foreground-muted">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Consultando relays…
                </span>
              ) : (
                <p className="text-sm text-foreground-subtle">
                  {search ? "Sin resultados para el filtro." : "Sin eventos en esta tabla."}
                </p>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

/* ───────────────────────────── table row ────────────────────────────────── */

function TableRow({
  row,
  title,
  dTag,
  extras,
  extraCols,
  selectedRelays,
  totalRelays,
  missing,
  expanded,
  onToggle,
  onRepublish,
  republishing,
}: {
  row: ScanRow;
  title: string;
  dTag: string;
  extras: string[];
  extraCols: string[];
  selectedRelays: string[];
  totalRelays: number;
  missing: string[];
  expanded: boolean;
  onToggle: () => void;
  onRepublish: () => void;
  republishing: boolean;
}) {
  const colSpan = 7 + extraCols.length;
  // Author plus any pubkeys referenced via p tags — shown as profile badges.
  const referencedPubkeys = (() => {
    const set = new Set<string>([row.event.pubkey]);
    for (const t of row.event.tags) {
      if (t[0] === "p" && /^[0-9a-f]{64}$/i.test(t[1] ?? "")) set.add((t[1] as string).toLowerCase());
    }
    return [...set];
  })();
  let prettyContent = row.event.content;
  try {
    prettyContent = JSON.stringify(JSON.parse(row.event.content), null, 2);
  } catch {
    /* keep raw (may be encrypted) */
  }
  return (
    <>
      <tr
        onClick={onToggle}
        className={cn(
          "cursor-pointer transition-colors hover:bg-white/[0.03]",
          expanded && "bg-white/[0.03]",
        )}
      >
        <td className="pl-2 text-foreground-subtle">
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </td>
        <td className="px-3 py-2 text-sm font-medium max-w-[16rem] truncate">{title}</td>
        {extras.map((v, i) => (
          <td key={i} className="px-3 py-2 text-xs font-mono text-foreground-muted">{v}</td>
        ))}
        <td className="px-3 py-2 text-[11px] font-mono text-foreground-subtle max-w-[14rem] truncate">{dTag}</td>
        <td className="px-3 py-2 max-w-[12rem]">
          <NpubBadge pubkey={row.event.pubkey} />
        </td>
        <td className="px-3 py-2 text-[11px] font-mono text-foreground-subtle whitespace-nowrap">
          {fmtDate(row.event.created_at)}
        </td>
        <td className="px-3 py-2">
          <CoverageDots selectedRelays={selectedRelays} coverage={row.coverage} />
          <span className="ml-1.5 text-[10px] font-mono text-foreground-subtle tabular-nums">
            {row.coverage.size}/{totalRelays}
          </span>
        </td>
        <td className="px-3 py-2 text-right">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRepublish();
            }}
            disabled={republishing || missing.length === 0}
            className={cn(
              "inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-semibold transition-colors",
              missing.length === 0
                ? "border-border text-foreground-subtle cursor-not-allowed"
                : "border-nostr/40 bg-nostr/10 text-nostr hover:bg-nostr/15",
            )}
          >
            {republishing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Upload className="h-3 w-3" />
            )}
            {missing.length === 0 ? "OK" : `+${missing.length}`}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-background-elevated/40">
          <td colSpan={colSpan} className="px-4 py-3">
            <div className="mb-3">
              <h5 className="text-[10px] font-mono uppercase tracking-widest text-foreground-subtle mb-1.5">
                Perfiles
              </h5>
              <div className="flex flex-wrap gap-2">
                {referencedPubkeys.map((pk) => (
                  <span key={pk} className="rounded-lg border border-border bg-background/60 px-2 py-1">
                    <NpubBadge pubkey={pk} size="md" showNpub />
                  </span>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <h5 className="text-[10px] font-mono uppercase tracking-widest text-foreground-subtle">Tags</h5>
                  <a
                    href={`https://njump.me/${row.event.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 text-[10px] font-mono text-foreground-subtle hover:text-foreground"
                  >
                    {row.event.id.slice(0, 12)}…
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </div>
                <div className="rounded-lg border border-border bg-background/60 p-2 font-mono text-[10px] space-y-0.5 max-h-56 overflow-auto">
                  {row.event.tags.map((t, i) => (
                    <div key={i} className="break-all">
                      <span className="text-nostr">[{t.map((x) => `"${x}"`).join(", ")}]</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h5 className="text-[10px] font-mono uppercase tracking-widest text-foreground-subtle mb-1.5">
                  Contenido
                </h5>
                <pre className="rounded-lg border border-border bg-background/60 p-2 font-mono text-[10px] max-h-56 overflow-auto whitespace-pre-wrap break-all">
                  {prettyContent || "(vacío)"}
                </pre>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function CoverageDots({
  selectedRelays,
  coverage,
}: {
  selectedRelays: string[];
  coverage: Map<string, { eventId: string; createdAt: number }>;
}) {
  return (
    <span className="inline-flex items-center gap-0.5 align-middle">
      {selectedRelays.map((relay) => {
        const has = coverage.has(relay);
        return (
          <span
            key={relay}
            title={`${relay.replace(/^wss:\/\//, "")} · ${has ? "presente" : "ausente"}`}
            className={cn(
              "inline-flex h-3 w-3 items-center justify-center rounded-full border",
              has ? "border-cyan/40 bg-cyan/20 text-cyan" : "border-border bg-white/[0.02] text-foreground-subtle",
            )}
          >
            {has ? <Check className="h-2 w-2" strokeWidth={3} /> : <X className="h-2 w-2" strokeWidth={3} />}
          </span>
        );
      })}
    </span>
  );
}
