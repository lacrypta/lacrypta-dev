"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowRight,
  Boxes,
  FileJson,
  Layers,
  Maximize2,
  Minus,
  Plus,
  Radio,
  ScanLine,
  Tag as TagIcon,
  X,
} from "lucide-react";
import {
  SCHEMA_ENTITIES,
  getEntity,
  relatedEntityIds,
  type SchemaAccent,
  type SchemaEntity,
  type SchemaRelation,
} from "@/lib/databaseSchema";
import { cn } from "@/lib/cn";

const ACCENT: Record<
  SchemaAccent,
  { text: string; border: string; bg: string; dot: string; stroke: string }
> = {
  bitcoin: { text: "text-bitcoin", border: "border-bitcoin/50", bg: "bg-bitcoin/[0.08]", dot: "bg-bitcoin", stroke: "#f7931a" },
  nostr: { text: "text-nostr", border: "border-nostr/50", bg: "bg-nostr/[0.08]", dot: "bg-nostr", stroke: "#a855f7" },
  cyan: { text: "text-cyan", border: "border-cyan/50", bg: "bg-cyan/[0.08]", dot: "bg-cyan", stroke: "#22d3ee" },
  lightning: { text: "text-lightning", border: "border-lightning/50", bg: "bg-lightning/[0.08]", dot: "bg-lightning", stroke: "#ffd700" },
  success: { text: "text-success", border: "border-success/50", bg: "bg-success/[0.08]", dot: "bg-success", stroke: "#22c55e" },
  danger: { text: "text-danger", border: "border-danger/50", bg: "bg-danger/[0.08]", dot: "bg-danger", stroke: "#ef4444" },
  foreground: { text: "text-foreground-muted", border: "border-border-strong", bg: "bg-white/[0.05]", dot: "bg-foreground-muted", stroke: "#a1a1aa" },
};

const GROUP_LABEL: Record<SchemaEntity["group"], string> = {
  event: "Evento",
  model: "Modelo",
  embedded: "Embebido",
};

const REL_GLYPH: Record<SchemaRelation["kind"], string> = {
  belongsTo: "→1",
  hasMany: "→∗",
  embeds: "◆∗",
  references: "⇢",
};

const NODE_W = 264;
const FALLBACK_H = 220;

/** Column layout (canvas coordinates) so the graph opens already organised. */
const LANES: string[][] = [
  ["hackathon", "soldier"],
  ["profile", "project", "team-member"],
  ["voting-period", "ballot"],
  ["report", "results"],
  ["badge-catalog", "badge-definition", "badge-award", "relay-list"],
];

function initialPositions(): Record<string, { x: number; y: number }> {
  const pos: Record<string, { x: number; y: number }> = {};
  LANES.forEach((lane, col) => {
    lane.forEach((id, row) => {
      pos[id] = { x: 40 + col * (NODE_W + 80), y: 40 + row * 270 };
    });
  });
  // any entity not in a lane → stack on the right
  SCHEMA_ENTITIES.forEach((e, i) => {
    if (!pos[e.id]) pos[e.id] = { x: 40 + LANES.length * (NODE_W + 80), y: 40 + i * 270 };
  });
  return pos;
}

type Pos = { x: number; y: number };
type Size = { w: number; h: number };

export default function StructureCanvas({
  onScanCategory,
}: {
  onScanCategory?: (categoryId: string) => void;
}) {
  const [positions, setPositions] = useState<Record<string, Pos>>(initialPositions);
  const [sizes, setSizes] = useState<Record<string, Size>>({});
  const [pan, setPan] = useState<Pos>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(0.85);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState<Set<SchemaEntity["group"]>>(
    () => new Set(["event", "model", "embedded"]),
  );

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  const dragRef = useRef<
    | { kind: "node"; id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean }
    | { kind: "pan"; sx: number; sy: number; ox: number; oy: number; moved: boolean }
    | null
  >(null);

  useEffect(() => void (zoomRef.current = zoom), [zoom]);
  useEffect(() => void (panRef.current = pan), [pan]);

  const focus = hovered ?? selected;
  const related = useMemo(
    () => (focus ? relatedEntityIds(focus) : new Set<string>()),
    [focus],
  );

  const visible = useMemo(
    () => SCHEMA_ENTITIES.filter((e) => groupFilter.has(e.group)),
    [groupFilter],
  );

  // Measure node sizes (layout px, unaffected by the CSS transform scale).
  useLayoutEffect(() => {
    const next: Record<string, Size> = {};
    let changed = false;
    for (const e of visible) {
      const el = nodeRefs.current.get(e.id);
      if (!el) continue;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      next[e.id] = { w, h };
      if (!sizes[e.id] || sizes[e.id].w !== w || sizes[e.id].h !== h) changed = true;
    }
    if (changed) setSizes((prev) => ({ ...prev, ...next }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, positions]);

  /* ── drag / pan ──────────────────────────────────────────────────────── */
  const onMove = useCallback((e: PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) d.moved = true;
    if (d.kind === "node") {
      const z = zoomRef.current;
      setPositions((p) => ({ ...p, [d.id]: { x: d.ox + dx / z, y: d.oy + dy / z } }));
    } else {
      setPan({ x: d.ox + dx, y: d.oy + dy });
    }
  }, []);

  const onUp = useCallback(() => {
    const d = dragRef.current;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    if (d && !d.moved) {
      if (d.kind === "node") setSelected((s) => (s === d.id ? null : d.id));
      else setSelected(null);
    }
    dragRef.current = null;
  }, [onMove]);

  const startNodeDrag = useCallback(
    (e: React.PointerEvent, id: string) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      const p = positions[id] ?? { x: 0, y: 0 };
      dragRef.current = { kind: "node", id, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y, moved: false };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [positions, onMove, onUp],
  );

  const startPan = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      dragRef.current = { kind: "pan", sx: e.clientX, sy: e.clientY, ox: panRef.current.x, oy: panRef.current.y, moved: false };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [onMove, onUp],
  );

  // Tear down any dangling drag listeners if we unmount mid-drag (or the drag
  // is interrupted by a pointercancel that never reaches onUp).
  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [onMove, onUp]);

  // Wheel zoom (non-passive so we can preventDefault).
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const z = zoomRef.current;
      const nz = Math.min(2, Math.max(0.3, z * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
      const p = panRef.current;
      setPan({ x: cx - (cx - p.x) * (nz / z), y: cy - (cy - p.y) * (nz / z) });
      setZoom(nz);
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  const zoomBy = useCallback((factor: number) => {
    const el = viewportRef.current;
    const z = zoomRef.current;
    const nz = Math.min(2, Math.max(0.3, z * factor));
    if (el) {
      const rect = el.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const p = panRef.current;
      setPan({ x: cx - (cx - p.x) * (nz / z), y: cy - (cy - p.y) * (nz / z) });
    }
    setZoom(nz);
  }, []);

  const resetView = useCallback(() => {
    setPositions(initialPositions());
    setPan({ x: 0, y: 0 });
    setZoom(0.85);
  }, []);

  const centerOn = useCallback(
    (id: string) => {
      const el = viewportRef.current;
      const p = positions[id];
      if (!el || !p) return;
      const s = sizes[id] ?? { w: NODE_W, h: FALLBACK_H };
      const z = zoomRef.current;
      const rect = el.getBoundingClientRect();
      setPan({ x: rect.width / 2 - (p.x + s.w / 2) * z, y: rect.height / 2 - (p.y + s.h / 2) * z });
    },
    [positions, sizes],
  );

  const jumpTo = useCallback(
    (id: string) => {
      setGroupFilter((prev) => {
        const e = getEntity(id);
        if (e && !prev.has(e.group)) return new Set(prev).add(e.group);
        return prev;
      });
      setSelected(id);
      centerOn(id);
    },
    [centerOn],
  );

  const toggleGroup = useCallback((g: SchemaEntity["group"]) => {
    setGroupFilter((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next.size === 0 ? prev : next;
    });
  }, []);

  /* ── edges ───────────────────────────────────────────────────────────── */
  const edges = useMemo(() => {
    const out: { from: string; to: string; d: string; stroke: string; active: boolean }[] = [];
    const visibleIds = new Set(visible.map((e) => e.id));
    const seen = new Set<string>();
    for (const e of visible) {
      for (const r of e.relations) {
        if (!visibleIds.has(r.to)) continue;
        // One edge per visual pair regardless of relation direction/kind.
        const pairKey = [e.id, r.to].sort().join("|");
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);
        const fp = positions[e.id];
        const tp = positions[r.to];
        if (!fp || !tp) continue;
        const fs = sizes[e.id] ?? { w: NODE_W, h: FALLBACK_H };
        const ts = sizes[r.to] ?? { w: NODE_W, h: FALLBACK_H };
        const fcx = fp.x + fs.w / 2;
        const fcy = fp.y + fs.h / 2;
        const tcx = tp.x + ts.w / 2;
        const tcy = tp.y + ts.h / 2;
        let d: string;
        if (Math.abs(tcx - fcx) < (fs.w + ts.w) / 2) {
          // Vertically-stacked (same column): route top↔bottom.
          const vdir = tcy >= fcy ? 1 : -1;
          const ax = fcx;
          const ay = vdir > 0 ? fp.y + fs.h : fp.y;
          const bx = tcx;
          const by = vdir > 0 ? tp.y : tp.y + ts.h;
          const dy = Math.max(40, Math.abs(by - ay) / 2);
          d = `M ${ax} ${ay} C ${ax} ${ay + vdir * dy}, ${bx} ${by - vdir * dy}, ${bx} ${by}`;
        } else {
          const dir = tcx >= fcx ? 1 : -1;
          const ax = dir > 0 ? fp.x + fs.w : fp.x;
          const ay = fcy;
          const bx = dir > 0 ? tp.x : tp.x + ts.w;
          const by = tcy;
          const dx = Math.max(40, Math.abs(bx - ax) / 2);
          d = `M ${ax} ${ay} C ${ax + dir * dx} ${ay}, ${bx - dir * dx} ${by}, ${bx} ${by}`;
        }
        const active = focus === e.id || focus === r.to;
        out.push({ from: e.id, to: r.to, d, stroke: ACCENT[e.accent].stroke, active });
      }
    }
    // active edges last so they render on top
    return out.sort((a, b) => Number(a.active) - Number(b.active));
  }, [visible, positions, sizes, focus]);

  const detail = selected ? getEntity(selected) : null;

  return (
    <div className="space-y-4">
      {/* toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {(["event", "model", "embedded"] as const).map((g) => {
            const Icon = g === "event" ? Radio : g === "model" ? Boxes : Layers;
            return (
              <button
                key={g}
                type="button"
                onClick={() => toggleGroup(g)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors",
                  groupFilter.has(g)
                    ? "border-cyan/40 bg-cyan/[0.06] text-cyan"
                    : "border-border bg-white/[0.02] text-foreground-subtle",
                )}
              >
                <Icon className="h-3 w-3" />
                {GROUP_LABEL[g]}
              </button>
            );
          })}
        </div>
        <p className="text-[10px] font-mono text-foreground-subtle">
          arrastrá el fondo para mover · scroll para zoom · arrastrá una tarjeta para reubicarla
        </p>
      </div>

      {/* canvas */}
      <div
        ref={viewportRef}
        onPointerDown={startPan}
        className="relative h-[68vh] min-h-[520px] overflow-hidden rounded-2xl border border-border bg-background-elevated/40 cursor-grab active:cursor-grabbing select-none [background-image:radial-gradient(circle,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:24px_24px]"
      >
        {/* zoom controls */}
        <div className="absolute right-3 top-3 z-30 flex flex-col gap-1">
          <CanvasBtn onClick={() => zoomBy(1.2)} title="Acercar"><Plus className="h-4 w-4" /></CanvasBtn>
          <CanvasBtn onClick={() => zoomBy(1 / 1.2)} title="Alejar"><Minus className="h-4 w-4" /></CanvasBtn>
          <CanvasBtn onClick={resetView} title="Reset"><Maximize2 className="h-4 w-4" /></CanvasBtn>
          <span className="mt-1 text-center text-[9px] font-mono text-foreground-subtle tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
        </div>

        {/* transformed content */}
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        >
          <svg
            className="pointer-events-none absolute left-0 top-0 overflow-visible"
            width={4000}
            height={3000}
            aria-hidden
          >
            {edges.map((e, i) => (
              <path
                key={i}
                d={e.d}
                fill="none"
                stroke={e.stroke}
                strokeWidth={e.active ? 2 : 1.25}
                strokeOpacity={focus ? (e.active ? 0.9 : 0.12) : 0.4}
                strokeDasharray={e.active ? undefined : "5 4"}
              />
            ))}
          </svg>

          {visible.map((entity) => {
            const pos = positions[entity.id] ?? { x: 0, y: 0 };
            const isFocus = focus === entity.id;
            const dimmed = focus != null && !isFocus && !related.has(entity.id);
            return (
              <div
                key={entity.id}
                ref={(el) => {
                  if (el) nodeRefs.current.set(entity.id, el);
                  else nodeRefs.current.delete(entity.id);
                }}
                className="absolute"
                style={{ left: pos.x, top: pos.y, width: NODE_W }}
              >
                <NodeCard
                  entity={entity}
                  selected={selected === entity.id}
                  isFocus={isFocus}
                  dimmed={dimmed}
                  onHeaderPointerDown={(e) => startNodeDrag(e, entity.id)}
                  onHover={(v) => setHovered(v ? entity.id : null)}
                  onJumpTo={jumpTo}
                />
              </div>
            );
          })}
        </div>
      </div>

      {detail && (
        <DetailDrawer
          entity={detail}
          onClose={() => setSelected(null)}
          onJumpTo={jumpTo}
          onScanCategory={onScanCategory}
        />
      )}
    </div>
  );
}

/* ───────────────────────────── primitives ───────────────────────────────── */

function CanvasBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      onPointerDown={(e) => e.stopPropagation()}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background-card/80 backdrop-blur text-foreground-muted hover:text-foreground hover:bg-white/[0.08] transition-colors"
    >
      {children}
    </button>
  );
}

function NodeCard({
  entity,
  selected,
  isFocus,
  dimmed,
  onHeaderPointerDown,
  onHover,
  onJumpTo,
}: {
  entity: SchemaEntity;
  selected: boolean;
  isFocus: boolean;
  dimmed: boolean;
  onHeaderPointerDown: (e: React.PointerEvent) => void;
  onHover: (v: boolean) => void;
  onJumpTo: (id: string) => void;
}) {
  const a = ACCENT[entity.accent];
  return (
    <div
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      className={cn(
        "rounded-xl border bg-background-card/95 backdrop-blur-sm overflow-hidden transition-[opacity,box-shadow] duration-150 shadow-xl",
        selected || isFocus ? a.border : "border-border",
        dimmed && "opacity-30",
      )}
      style={
        selected
          ? { boxShadow: `0 0 0 1px ${a.stroke}66, 0 12px 36px -14px ${a.stroke}88` }
          : undefined
      }
    >
      {/* drag handle / header */}
      <div
        onPointerDown={onHeaderPointerDown}
        className={cn("px-3 py-2 border-b border-border cursor-grab active:cursor-grabbing", a.bg)}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 min-w-0">
            <span className={cn("h-2 w-2 rounded-full shrink-0", a.dot)} />
            <span className="font-display font-bold text-sm truncate">{entity.label}</span>
          </span>
          <span
            className={cn(
              "shrink-0 px-1.5 py-0.5 rounded border text-[9px] font-mono",
              entity.kind != null ? cn(a.border, a.text) : "border-border text-foreground-subtle",
            )}
          >
            {entity.kind != null ? `kind:${entity.kind}` : GROUP_LABEL[entity.group]}
          </span>
        </div>
      </div>

      {/* fields */}
      <ul className="px-3 py-2 space-y-1">
        {entity.fields.map((f) => {
          const refEntity = f.ref ? getEntity(f.ref) : undefined;
          return (
            <li key={f.name} className="flex items-center justify-between gap-2 text-[11px] font-mono">
              <span className="flex items-center gap-1 min-w-0">
                {f.kind === "key" && <span className="text-lightning">★</span>}
                <span className={cn("truncate", refEntity ? "text-cyan" : "text-foreground")}>{f.name}</span>
              </span>
              {refEntity ? (
                <button
                  type="button"
                  onClick={() => onJumpTo(refEntity.id)}
                  className="shrink-0 inline-flex items-center gap-0.5 text-cyan/80 hover:text-cyan hover:underline underline-offset-2"
                >
                  {f.type}
                  <ArrowRight className="h-2.5 w-2.5" />
                </button>
              ) : (
                <span className="shrink-0 text-foreground-subtle truncate max-w-[55%]">{f.type}</span>
              )}
            </li>
          );
        })}
      </ul>

      {entity.relations.length > 0 && (
        <div className="px-3 pb-2.5 pt-1 border-t border-border/60 flex flex-wrap gap-1.5">
          {entity.relations.map((r) => {
            const target = getEntity(r.to);
            if (!target) return null;
            return (
              <button
                key={`${r.to}-${r.label}`}
                type="button"
                onClick={() => onJumpTo(r.to)}
                title={r.via ? `via ${r.via}` : undefined}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-border bg-white/[0.02] hover:bg-white/[0.06] text-[9px] font-mono text-foreground-subtle hover:text-foreground transition-colors"
              >
                <span className="text-foreground-subtle/70">{REL_GLYPH[r.kind]}</span>
                {target.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DetailDrawer({
  entity,
  onClose,
  onJumpTo,
  onScanCategory,
}: {
  entity: SchemaEntity;
  onClose: () => void;
  onJumpTo: (id: string) => void;
  onScanCategory?: (categoryId: string) => void;
}) {
  const a = ACCENT[entity.accent];
  return (
    <div className="rounded-2xl border border-border-strong bg-background-card/80 backdrop-blur-sm overflow-hidden">
      <div className={cn("flex items-start justify-between gap-3 px-4 py-3 border-b border-border", a.bg)}>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn("h-2.5 w-2.5 rounded-full", a.dot)} />
            <h3 className="font-display font-bold text-base">{entity.label}</h3>
            <span className={cn("px-1.5 py-0.5 rounded border text-[10px] font-mono", a.border, a.text)}>
              {entity.kind != null ? `kind:${entity.kind}` : GROUP_LABEL[entity.group]}
            </span>
            {entity.replaceability && (
              <span className="px-1.5 py-0.5 rounded border border-border text-[10px] font-mono text-foreground-subtle">
                {entity.replaceability}
              </span>
            )}
          </div>
          <p className="mt-1 inline-flex items-center gap-1.5 text-[10px] font-mono text-foreground-subtle">
            <FileJson className="h-3 w-3" />
            {entity.source}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {entity.categoryId && onScanCategory && (
            <button
              type="button"
              onClick={() => onScanCategory(entity.categoryId!)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-bitcoin/40 bg-bitcoin/10 hover:bg-bitcoin/15 text-bitcoin text-[11px] font-semibold transition-colors"
            >
              <ScanLine className="h-3.5 w-3.5" />
              Ver datos
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-foreground-subtle hover:text-foreground hover:bg-white/[0.06] transition-colors"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border">
        <div className="p-4">
          <h4 className="text-[10px] font-mono uppercase tracking-widest text-foreground-subtle mb-2">Campos</h4>
          <ul className="space-y-1.5">
            {entity.fields.map((f) => {
              const refEntity = f.ref ? getEntity(f.ref) : undefined;
              return (
                <li key={f.name} className="text-[11px] font-mono flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1">
                    {f.kind === "key" && <span className="text-lightning">★</span>}
                    <span className={refEntity ? "text-cyan" : "text-foreground"}>{f.name}</span>
                  </span>
                  {refEntity ? (
                    <button
                      type="button"
                      onClick={() => onJumpTo(refEntity.id)}
                      className="text-cyan/80 hover:text-cyan hover:underline underline-offset-2 inline-flex items-center gap-0.5"
                    >
                      {f.type}
                      <ArrowRight className="h-2.5 w-2.5" />
                    </button>
                  ) : (
                    <span className="text-foreground-subtle text-right">{f.type}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="p-4">
          <h4 className="text-[10px] font-mono uppercase tracking-widest text-foreground-subtle mb-2 inline-flex items-center gap-1">
            <TagIcon className="h-3 w-3" />
            Tags
          </h4>
          {entity.tags && entity.tags.length > 0 ? (
            <ul className="space-y-1.5">
              {entity.tags.map((t, i) => (
                <li key={i} className="text-[11px] font-mono" title={t.note}>
                  <span className="text-nostr">[&quot;{t.tag}&quot;</span>
                  <span className="text-foreground">, &quot;{t.value}&quot;]</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-foreground-subtle">—</p>
          )}
          {entity.dTag && (
            <p className="mt-3 text-[10px] font-mono text-foreground-subtle break-all">
              <span className="text-foreground-subtle/60">d:</span> {entity.dTag}
            </p>
          )}
        </div>

        <div className="p-4">
          <h4 className="text-[10px] font-mono uppercase tracking-widest text-foreground-subtle mb-2">Relaciones</h4>
          <ul className="space-y-1.5">
            {entity.relations.map((r) => {
              const target = getEntity(r.to);
              if (!target) return null;
              return (
                <li key={`${r.to}-${r.label}`}>
                  <button
                    type="button"
                    onClick={() => onJumpTo(r.to)}
                    title={r.via ? `via ${r.via}` : undefined}
                    className="w-full text-left group inline-flex items-center gap-1.5 text-[11px]"
                  >
                    <span className="font-mono text-foreground-subtle/70">{REL_GLYPH[r.kind]}</span>
                    <span className="text-cyan group-hover:underline underline-offset-2 font-semibold">{target.label}</span>
                    {r.via && <span className="font-mono text-[10px] text-foreground-subtle">{r.via}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
