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
  Loader2,
  Pause,
  RefreshCw,
  Upload,
  X,
} from "lucide-react";
import {
  CATEGORIES,
  eventDisplayTitle,
  eventIdentityKey,
  type EventCategory,
} from "@/lib/databaseCatalog";
import { useScrollLock } from "@/lib/useScrollLock";
import { cn } from "@/lib/cn";

type SignedEvent = {
  id: string;
  pubkey: string;
  kind: number;
  tags: string[][];
  content: string;
  created_at: number;
  sig: string;
};

type Phase = "idle" | "scanning" | "publishing" | "done" | "error" | "cancelled";

type LogEntry = {
  /** ms since start */
  t: number;
  level: "info" | "ok" | "warn" | "error";
  text: string;
};

type ScanOp = {
  catId: string;
  relay: string;
  events: number;
  state: "pending" | "scanning" | "done" | "skipped" | "error";
  error?: string;
};

type CoverageRow = {
  key: string;
  category: EventCategory;
  event: SignedEvent;
  coverage: Set<string>;
};

type PublishOp = {
  rowKey: string;
  title: string;
  catLabel: string;
  missing: string[];
  results?: { relay: string; ok: boolean; error?: string }[];
  state: "pending" | "running" | "done";
};

const PER_RELAY_TIMEOUT_MS = 6_000;
const PUBLISH_TIMEOUT_MS = 8_000;

function formatDuration(ms: number): string {
  if (!isFinite(ms) || ms < 0) return "—";
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r.toString().padStart(2, "0")}s`;
}

export default function FullSyncModal({
  open,
  onClose,
  relays,
  pubkey,
}: {
  open: boolean;
  onClose: () => void;
  /** Configured relay list (the working set of URLs). */
  relays: string[];
  /** Effective pubkey for author/recipient-scoped filters. May be empty. */
  pubkey: string;
}) {
  useScrollLock(open);

  const [phase, setPhase] = useState<Phase>("idle");
  const [scanOps, setScanOps] = useState<ScanOp[]>([]);
  const [publishOps, setPublishOps] = useState<PublishOp[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [startedAt, setStartedAt] = useState<number>(0);
  const [now, setNow] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  // Tick the clock so ETA stays live during long phases.
  useEffect(() => {
    if (phase !== "scanning" && phase !== "publishing") return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [phase]);

  // Auto-scroll log to bottom on new entries.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log.length]);

  const elapsedMs = startedAt ? now - startedAt : 0;

  const scanProgress = useMemo(() => {
    if (scanOps.length === 0) return 0;
    let done = 0;
    for (const op of scanOps) {
      if (op.state === "done" || op.state === "error" || op.state === "skipped") {
        done += 1;
      }
    }
    return done / scanOps.length;
  }, [scanOps]);

  const publishProgress = useMemo(() => {
    if (publishOps.length === 0) return phase === "publishing" || phase === "done" ? 1 : 0;
    let done = 0;
    for (const op of publishOps) if (op.state === "done") done += 1;
    return done / publishOps.length;
  }, [publishOps, phase]);

  // Weight scan 0.5, publish 0.5 so progress feels balanced even when there
  // are zero gaps (publish skips to 100% instantly).
  const overallProgress =
    phase === "done"
      ? 1
      : phase === "publishing"
        ? 0.5 + 0.5 * publishProgress
        : phase === "scanning"
          ? 0.5 * scanProgress
          : 0;

  const etaMs = useMemo(() => {
    if (phase !== "scanning" && phase !== "publishing") return null;
    if (overallProgress <= 0.01) return null;
    const estTotal = elapsedMs / overallProgress;
    return Math.max(0, estTotal - elapsedMs);
  }, [phase, overallProgress, elapsedMs]);

  const appendLog = useCallback(
    (level: LogEntry["level"], text: string) => {
      setLog((prev) => [
        ...prev,
        { t: Date.now() - (startedAt || Date.now()), level, text },
      ]);
    },
    [startedAt],
  );

  const totals = useMemo(() => {
    const scanTotal = scanOps.length;
    const scanDone = scanOps.filter(
      (o) => o.state === "done" || o.state === "error" || o.state === "skipped",
    ).length;
    const pubTotal = publishOps.length;
    const pubDone = publishOps.filter((o) => o.state === "done").length;
    return { scanTotal, scanDone, pubTotal, pubDone };
  }, [scanOps, publishOps]);

  /* ─── orchestration ─────────────────────────────────────────────────────── */

  const run = useCallback(async () => {
    if (relays.length === 0) {
      setError("No hay relays configurados.");
      setPhase("error");
      return;
    }

    const t0 = Date.now();
    setStartedAt(t0);
    setNow(t0);
    setError(null);
    setLog([]);
    setPublishOps([]);
    setPhase("scanning");

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    // Build the scan plan: one op per (category × relay), skipping categories
    // that can't build a filter (pubkey-scoped without a pubkey).
    type PlannedOp = {
      cat: EventCategory;
      relay: string;
      filter: ReturnType<EventCategory["buildFilter"]>;
    };
    const planned: PlannedOp[] = [];
    const skippedCats: string[] = [];
    for (const cat of CATEGORIES) {
      const filter = cat.buildFilter({ lacryptaPubkey: pubkey });
      if (!filter) {
        skippedCats.push(cat.label);
        continue;
      }
      for (const relay of relays) {
        planned.push({ cat, relay, filter });
      }
    }
    const initialOps: ScanOp[] = planned.map((p) => ({
      catId: p.cat.id,
      relay: p.relay,
      events: 0,
      state: "pending",
    }));
    setScanOps(initialOps);

    setLog([
      {
        t: 0,
        level: "info",
        text: `Plan: ${planned.length} consultas (${CATEGORIES.length - skippedCats.length} categorías × ${relays.length} relays).`,
      },
      ...(skippedCats.length > 0
        ? [
            {
              t: 0,
              level: "warn" as const,
              text: `Saltadas (sin pubkey): ${skippedCats.join(", ")}.`,
            },
          ]
        : []),
    ]);

    const coverage = new Map<string, CoverageRow>();

    try {
      const { SimplePool } = await import("nostr-tools/pool");

      // Run all (category × relay) subscriptions in parallel.
      await Promise.all(
        planned.map(async (p, i) => {
          if (controller.signal.aborted) return;
          const setState = (s: ScanOp["state"], err?: string) => {
            setScanOps((prev) => {
              const next = [...prev];
              next[i] = { ...next[i]!, state: s, error: err };
              return next;
            });
          };
          setState("scanning");

          const pool = new SimplePool();
          let evCount = 0;
          try {
            const closer = pool.subscribe([p.relay], p.filter!, {
              onevent(ev: SignedEvent) {
                evCount += 1;
                setScanOps((prev) => {
                  const next = [...prev];
                  next[i] = { ...next[i]!, events: evCount };
                  return next;
                });
                const key = `${p.cat.id}::${eventIdentityKey(p.cat, ev)}`;
                const existing = coverage.get(key);
                if (existing) {
                  if (ev.created_at > existing.event.created_at) {
                    existing.event = ev;
                  }
                  existing.coverage.add(p.relay);
                } else {
                  coverage.set(key, {
                    key,
                    category: p.cat,
                    event: ev,
                    coverage: new Set([p.relay]),
                  });
                }
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
            setState("done");
            appendLog(
              "info",
              `[scan] ${p.cat.shortLabel} · ${p.relay.replace(/^wss:\/\//, "")} → ${evCount} evento(s)`,
            );
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setState("error", msg);
            appendLog(
              "error",
              `[scan] ${p.cat.shortLabel} · ${p.relay.replace(/^wss:\/\//, "")} → error: ${msg}`,
            );
          } finally {
            try {
              pool.close([p.relay]);
            } catch {
              /* noop */
            }
          }
        }),
      );

      if (controller.signal.aborted) {
        setPhase("cancelled");
        appendLog("warn", "Scan cancelado.");
        return;
      }

      // Build the publish queue from the coverage map.
      const rows = [...coverage.values()];
      const queue: PublishOp[] = [];
      for (const row of rows) {
        const missing = relays.filter((r) => !row.coverage.has(r));
        if (missing.length === 0) continue;
        queue.push({
          rowKey: row.key,
          title: eventDisplayTitle(row.category, row.event),
          catLabel: row.category.shortLabel,
          missing,
          state: "pending",
        });
      }
      setPublishOps(queue);

      appendLog(
        "info",
        `Scan listo: ${rows.length} eventos únicos, ${queue.length} con ausencias.`,
      );

      if (queue.length === 0) {
        setPhase("done");
        appendLog("ok", "Nada que republicar — todos los relays están al día.");
        return;
      }

      setPhase("publishing");

      // Publish each row sequentially so logs stay readable and we don't
      // hammer relays in parallel beyond the per-row fanout.
      for (let i = 0; i < queue.length; i++) {
        if (controller.signal.aborted) {
          setPhase("cancelled");
          appendLog("warn", "Republicación cancelada.");
          return;
        }
        const op = queue[i]!;
        const row = rows.find((r) => r.key === op.rowKey)!;
        setPublishOps((prev) => {
          const next = [...prev];
          next[i] = { ...next[i]!, state: "running" };
          return next;
        });
        appendLog(
          "info",
          `[publish] ${op.catLabel} · ${op.title} → ${op.missing.length} relay(s)`,
        );

        const pool = new SimplePool();
        try {
          const promises = pool.publish(op.missing, row.event);
          const results = await Promise.all(
            promises.map(async (p, j) => {
              const relay = op.missing[j]!;
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
          const okN = results.filter((r) => r.ok).length;
          const koN = results.length - okN;
          setPublishOps((prev) => {
            const next = [...prev];
            next[i] = { ...next[i]!, state: "done", results };
            return next;
          });
          appendLog(
            koN === 0 ? "ok" : okN === 0 ? "error" : "warn",
            `  ↳ ok=${okN} · fail=${koN}${koN > 0 ? ` (${results.filter((r) => !r.ok).map((r) => r.relay.replace(/^wss:\/\//, "")).join(", ")})` : ""}`,
          );
        } finally {
          try {
            pool.close(op.missing);
          } catch {
            /* noop */
          }
        }
      }

      setPhase("done");
      appendLog("ok", "Sincronización completada.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setPhase("error");
      appendLog("error", `Falla: ${msg}`);
    }
  }, [relays, pubkey, appendLog]);

  // Auto-start when modal opens.
  useEffect(() => {
    if (!open) return;
    if (phase !== "idle" && phase !== "done" && phase !== "error" && phase !== "cancelled") return;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Reset state when closed.
  useEffect(() => {
    if (open) return;
    abortRef.current?.abort();
    setPhase("idle");
    setScanOps([]);
    setPublishOps([]);
    setLog([]);
    setError(null);
    setStartedAt(0);
    setNow(0);
  }, [open]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  if (!open) return null;

  const running = phase === "scanning" || phase === "publishing";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !running) onClose();
      }}
    >
      <div className="relative w-full max-w-3xl rounded-2xl border border-border-strong bg-background-card overflow-hidden flex flex-col max-h-[90vh]">
        <div className="absolute -top-px left-1/2 -translate-x-1/2 w-[40%] h-px bg-gradient-to-r from-transparent via-nostr to-transparent" />

        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-border flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display font-bold text-xl flex items-center gap-2">
              <RefreshCw
                className={cn(
                  "h-5 w-5 text-nostr",
                  running && "animate-spin",
                )}
              />
              Sincronización completa
            </h2>
            <p className="text-[11px] font-mono text-foreground-subtle mt-0.5">
              {CATEGORIES.length} categorías · {relays.length} relays · pubkey{" "}
              {pubkey ? `${pubkey.slice(0, 8)}…` : "(sin pubkey)"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => (running ? cancel() : onClose())}
            className="p-2 rounded-lg text-foreground-muted hover:text-foreground hover:bg-white/5 transition-colors"
            aria-label={running ? "Cancelar" : "Cerrar"}
          >
            {running ? <Pause className="h-5 w-5" /> : <X className="h-5 w-5" />}
          </button>
        </div>

        {/* Phase + progress */}
        <div className="px-6 pt-4 pb-3 space-y-3">
          <PhaseSteps phase={phase} totals={totals} />

          <div className="space-y-1">
            <div className="flex items-baseline justify-between text-[11px] font-mono">
              <span className="text-foreground-muted">
                {Math.round(overallProgress * 100)}%
              </span>
              <span className="text-foreground-subtle">
                {phase === "done"
                  ? `Completado en ${formatDuration(elapsedMs)}`
                  : phase === "cancelled"
                    ? "Cancelado"
                    : phase === "error"
                      ? "Error"
                      : `${formatDuration(elapsedMs)} transcurrido · ETA ${formatDuration(etaMs ?? NaN)}`}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className={cn(
                  "h-full transition-all duration-300",
                  phase === "error"
                    ? "bg-danger"
                    : phase === "cancelled"
                      ? "bg-foreground-subtle"
                      : "bg-gradient-to-r from-cyan via-nostr to-bitcoin",
                )}
                style={{ width: `${Math.max(2, Math.round(overallProgress * 100))}%` }}
              />
            </div>
            <div className="flex items-baseline justify-between text-[10px] font-mono text-foreground-subtle">
              <span>
                scan {totals.scanDone}/{totals.scanTotal}
              </span>
              {totals.pubTotal > 0 && (
                <span>
                  publish {totals.pubDone}/{totals.pubTotal}
                </span>
              )}
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-danger/10 border border-danger/30 px-3 py-2 text-xs text-danger flex items-start gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Log */}
        <div
          ref={logRef}
          className="flex-1 min-h-[200px] overflow-y-auto bg-black/30 border-t border-border px-4 py-3 font-mono text-[11px] space-y-0.5"
        >
          {log.length === 0 && (
            <div className="text-foreground-subtle">Esperando…</div>
          )}
          {log.map((entry, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-foreground-subtle tabular-nums shrink-0">
                {formatDuration(entry.t).padStart(6, " ")}
              </span>
              <span
                className={cn(
                  "min-w-0 flex-1 break-words",
                  entry.level === "ok" && "text-lightning",
                  entry.level === "warn" && "text-bitcoin",
                  entry.level === "error" && "text-danger",
                  entry.level === "info" && "text-foreground-muted",
                )}
              >
                {entry.text}
              </span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border flex items-center justify-end gap-2">
          {phase === "done" || phase === "error" || phase === "cancelled" ? (
            <>
              <button
                type="button"
                onClick={() => void run()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-white/[0.03] hover:bg-white/[0.06] text-xs font-semibold transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Re-ejecutar
              </button>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-nostr/40 bg-nostr/10 hover:bg-nostr/15 text-nostr text-xs font-semibold transition-colors"
              >
                Cerrar
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={cancel}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-white/[0.03] hover:bg-white/[0.06] text-xs font-semibold transition-colors"
            >
              <Pause className="h-3.5 w-3.5" />
              Cancelar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function PhaseSteps({
  phase,
  totals,
}: {
  phase: Phase;
  totals: { scanTotal: number; scanDone: number; pubTotal: number; pubDone: number };
}) {
  const step = (key: Phase, label: string, sub: string) => {
    const isActive = phase === key;
    const isDone =
      (key === "scanning" &&
        (phase === "publishing" || phase === "done")) ||
      (key === "publishing" && phase === "done");
    return (
      <div
        className={cn(
          "flex-1 flex items-center gap-2 rounded-lg border px-2.5 py-1.5",
          isActive
            ? "border-nostr/50 bg-nostr/[0.06]"
            : isDone
              ? "border-cyan/30 bg-cyan/[0.04]"
              : "border-border bg-white/[0.02]",
        )}
      >
        <span
          className={cn(
            "h-5 w-5 rounded-full inline-flex items-center justify-center shrink-0 border",
            isActive
              ? "border-nostr/60 bg-nostr/20 text-nostr"
              : isDone
                ? "border-cyan/40 bg-cyan/15 text-cyan"
                : "border-border text-foreground-subtle",
          )}
        >
          {isDone ? (
            <Check className="h-3 w-3" strokeWidth={3} />
          ) : isActive ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <CircleDashed className="h-3 w-3" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-mono font-bold uppercase tracking-widest leading-none">
            {label}
          </div>
          <div className="text-[10px] font-mono text-foreground-subtle mt-0.5">
            {sub}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex gap-2">
      {step(
        "scanning",
        "1 · Scan",
        totals.scanTotal === 0
          ? "—"
          : `${totals.scanDone}/${totals.scanTotal} consultas`,
      )}
      {step(
        "publishing",
        "2 · Republish",
        totals.pubTotal === 0
          ? phase === "done"
            ? "sin gaps"
            : "—"
          : `${totals.pubDone}/${totals.pubTotal} eventos`,
      )}
    </div>
  );
}
