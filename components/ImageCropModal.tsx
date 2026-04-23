"use client";

/**
 * Image crop modal — pan + zoom with aspect-ratio constraint.
 *
 * Flow:
 *   1. Consumer gives us a `File` plus a target `aspect` ratio (e.g. 1 for
 *      an avatar, 3 for a 3:1 banner).
 *   2. We show the raw image inside a fixed crop viewport, initially
 *      "cover"-fit so the whole viewport is filled at minimum zoom.
 *   3. User can drag to pan and scroll (or use the slider) to zoom; the
 *      image is clamped so it always covers the viewport.
 *   4. On confirm we render the visible crop onto a canvas at a target
 *      resolution and hand back a Blob.
 */

import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  Crop as CropIcon,
  Loader2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useScrollLock } from "@/lib/useScrollLock";
import { cn } from "@/lib/cn";

export type CropResult = {
  blob: Blob;
  /** Suggested filename (original basename + recomputed extension). */
  filename: string;
  /** MIME type of the produced blob. */
  type: string;
};

type Props = {
  open: boolean;
  /** Source file. Must be an image (`image/*`). */
  file: File | null;
  /** Target aspect ratio (width / height). `1` for square. */
  aspect: number;
  /** Heading shown at the top of the modal. */
  title: string;
  /** Short text under the heading (e.g. "Avatar 1:1"). */
  hint?: string;
  /** Max longest-edge output pixel size. Avatars can go 1024, banners 1500. */
  maxOutputPx?: number;
  /** Encoding — "image/jpeg" gives smaller files, "image/png" preserves
   *  transparency. If omitted we follow the source. */
  outputType?: "image/jpeg" | "image/png";
  /** JPEG quality when outputting as jpeg (0–1). */
  quality?: number;
  onConfirm: (result: CropResult) => void;
  onCancel: () => void;
};

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const WHEEL_STEP = 0.01;

export default function ImageCropModal({
  open,
  file,
  aspect,
  title,
  hint,
  maxOutputPx = 1500,
  outputType,
  quality = 0.92,
  onConfirm,
  onCancel,
}: Props) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [processing, setProcessing] = useState(false);
  const [imgReady, setImgReady] = useState(false);

  const dragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  useScrollLock(open);

  // Load the file into an object URL, reset transform each time.
  useEffect(() => {
    if (!file || !open) {
      setImgSrc(null);
      setNatural(null);
      setImgReady(false);
      return;
    }
    const url = URL.createObjectURL(file);
    setImgSrc(url);
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setNatural(null);
    setImgReady(false);
    return () => URL.revokeObjectURL(url);
  }, [file, open]);

  // Viewport (crop area) dimensions — sized to comfortably fit in the modal
  // on both mobile and desktop. Width scales by aspect to keep one edge fixed.
  const viewport = useMemo(() => {
    if (aspect >= 1) {
      // Landscape or square — fix width at a friendly max, compute height.
      const maxW = 420;
      const w = maxW;
      const h = Math.round(w / aspect);
      return { w, h };
    }
    // Portrait — fix height
    const maxH = 420;
    const h = maxH;
    const w = Math.round(h * aspect);
    return { w, h };
  }, [aspect]);

  // Base "cover-fit" displayed dimensions at scale=1. The image's shortest
  // edge lines up with the viewport so there's no empty space even at min
  // zoom. Zoom > 1 multiplies both axes.
  const baseDims = useMemo(() => {
    if (!natural) return null;
    const imgR = natural.w / natural.h;
    const contR = viewport.w / viewport.h;
    if (imgR > contR) {
      // Image wider than viewport → match heights
      return { w: viewport.h * imgR, h: viewport.h };
    }
    return { w: viewport.w, h: viewport.w / imgR };
  }, [natural, viewport.w, viewport.h]);

  const displayedDims = useMemo(() => {
    if (!baseDims) return null;
    return { w: baseDims.w * scale, h: baseDims.h * scale };
  }, [baseDims, scale]);

  // Center offset (top-left coordinate of the image inside the viewport).
  // When the image is larger than the viewport the translate is negative.
  const clampOffset = useCallback(
    (pt: { x: number; y: number }, dw: number, dh: number) => {
      const maxX = 0;
      const minX = viewport.w - dw;
      const maxY = 0;
      const minY = viewport.h - dh;
      return {
        x: Math.min(maxX, Math.max(minX, pt.x)),
        y: Math.min(maxY, Math.max(minY, pt.y)),
      };
    },
    [viewport.w, viewport.h],
  );

  // When natural/baseDims arrive (image loaded), center the image in the
  // viewport. Subsequent zoom steps re-clamp around the existing focal point.
  useEffect(() => {
    if (!displayedDims) return;
    setOffset((prev) => {
      // If this is the first positioning (offset still at 0,0 with a bigger
      // image), auto-center. Otherwise re-clamp around wherever the user
      // left it.
      if (prev.x === 0 && prev.y === 0) {
        return clampOffset(
          {
            x: (viewport.w - displayedDims.w) / 2,
            y: (viewport.h - displayedDims.h) / 2,
          },
          displayedDims.w,
          displayedDims.h,
        );
      }
      return clampOffset(prev, displayedDims.w, displayedDims.h);
    });
  }, [
    displayedDims?.w,
    displayedDims?.h,
    clampOffset,
    viewport.w,
    viewport.h,
  ]);

  // When user zooms, re-center around the middle of the viewport so the
  // image doesn't drift toward a corner.
  const setScaleKeepCenter = useCallback(
    (nextScale: number) => {
      setScale((prev) => {
        const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));
        if (!baseDims) return clamped;
        // Compute new displayed dims
        const nw = baseDims.w * clamped;
        const nh = baseDims.h * clamped;
        setOffset((prevOffset) => {
          // Focal point in image coords (prev): center of viewport
          const fx = viewport.w / 2 - prevOffset.x;
          const fy = viewport.h / 2 - prevOffset.y;
          const ratio = clamped / prev;
          const nfx = fx * ratio;
          const nfy = fy * ratio;
          return clampOffset(
            {
              x: viewport.w / 2 - nfx,
              y: viewport.h / 2 - nfy,
            },
            nw,
            nh,
          );
        });
        return clamped;
      });
    },
    [baseDims, clampOffset, viewport.w, viewport.h],
  );

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!imgReady) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: offset.x,
      originY: offset.y,
    };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current || !displayedDims) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset(
      clampOffset(
        {
          x: dragRef.current.originX + dx,
          y: dragRef.current.originY + dy,
        },
        displayedDims.w,
        displayedDims.h,
      ),
    );
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  function onWheel(e: React.WheelEvent<HTMLDivElement>) {
    e.preventDefault();
    setScaleKeepCenter(scale - e.deltaY * WHEEL_STEP);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !processing) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel, processing]);

  async function handleConfirm() {
    if (!file || !imgSrc || !natural || !displayedDims) return;
    setProcessing(true);
    try {
      // Source rect in natural-image coordinates:
      // pixels per displayed-unit = natural.w / displayedDims.w
      const scaleFactor = natural.w / displayedDims.w;
      const sx = (0 - offset.x) * scaleFactor;
      const sy = (0 - offset.y) * scaleFactor;
      const sw = viewport.w * scaleFactor;
      const sh = viewport.h * scaleFactor;

      // Target canvas. Cap the longest edge at maxOutputPx; preserve aspect.
      let outW: number;
      let outH: number;
      if (aspect >= 1) {
        outW = Math.min(maxOutputPx, Math.round(sw));
        outH = Math.round(outW / aspect);
      } else {
        outH = Math.min(maxOutputPx, Math.round(sh));
        outW = Math.round(outH * aspect);
      }

      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas 2D context unavailable");

      // Wait for a fresh <img> to load. `img.decode()` can stall on some
      // browsers when the src is a blob URL, so we use the load/error
      // events directly which are rock-solid across engines.
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error("Image load failed"));
        i.src = imgSrc;
      });

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);

      const type =
        outputType ??
        (file.type === "image/png" ? "image/png" : "image/jpeg");
      const blob: Blob | null = await new Promise((res) =>
        canvas.toBlob(res, type, type === "image/jpeg" ? quality : undefined),
      );
      if (!blob) throw new Error("canvas.toBlob returned null");

      const ext = type === "image/png" ? "png" : "jpg";
      const base = file.name.replace(/\.[^.]+$/, "") || "image";
      onConfirm({
        blob,
        filename: `${base}-cropped.${ext}`,
        type,
      });
    } catch (e) {
      console.error("[ImageCropModal] confirm failed", e);
    } finally {
      setProcessing(false);
    }
  }

  return (
    <AnimatePresence mode="wait">
      {open && (
        <motion.div
          key="crop-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[110] flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !processing && onCancel()}
            className="absolute inset-0 bg-black/85 backdrop-blur-md"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative w-full max-w-lg glass-strong rounded-2xl border border-border-strong overflow-hidden"
          >
            <div className="absolute -top-px left-1/2 -translate-x-1/2 w-[40%] h-px bg-gradient-to-r from-transparent via-bitcoin to-transparent" />

            <div className="relative flex items-center justify-between gap-3 px-6 pt-5 pb-4 border-b border-border">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-9 w-9 shrink-0 rounded-lg bg-bitcoin/15 border border-bitcoin/30 flex items-center justify-center">
                  <CropIcon className="h-4 w-4 text-bitcoin" />
                </div>
                <div className="min-w-0">
                  <h2 className="font-display font-bold text-lg leading-tight truncate">
                    {title}
                  </h2>
                  {hint && (
                    <p className="text-[10px] font-mono uppercase tracking-widest text-foreground-subtle">
                      {hint}
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => !processing && onCancel()}
                disabled={processing}
                className="p-2 rounded-lg text-foreground-muted hover:text-foreground hover:bg-white/5 transition-colors disabled:opacity-50"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="relative px-6 py-5">
              {/* Crop viewport */}
              <div className="flex justify-center">
                <div
                  style={{ width: viewport.w, height: viewport.h }}
                  className={cn(
                    "relative overflow-hidden rounded-lg bg-black/60 border border-border touch-none select-none",
                    imgReady ? "cursor-grab active:cursor-grabbing" : "cursor-progress",
                  )}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                  onWheel={onWheel}
                >
                  {imgSrc && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={imgSrc}
                      alt="Para recortar"
                      onLoad={(e) => {
                        const el = e.currentTarget;
                        setNatural({
                          w: el.naturalWidth,
                          h: el.naturalHeight,
                        });
                        setImgReady(true);
                      }}
                      style={
                        displayedDims
                          ? {
                              width: displayedDims.w,
                              height: displayedDims.h,
                              transform: `translate(${offset.x}px, ${offset.y}px)`,
                            }
                          : { opacity: 0 }
                      }
                      className="absolute top-0 left-0 max-w-none pointer-events-none"
                      draggable={false}
                    />
                  )}
                  {!imgReady && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Loader2 className="h-5 w-5 animate-spin text-foreground-muted" />
                    </div>
                  )}
                  {/* Subtle outline so user sees crop bounds even over a
                      busy image. */}
                  <div className="absolute inset-0 ring-1 ring-inset ring-white/20 pointer-events-none rounded-lg" />
                </div>
              </div>

              {/* Zoom controls */}
              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setScaleKeepCenter(scale - 0.25)}
                  disabled={scale <= MIN_SCALE || !imgReady || processing}
                  className="p-1.5 rounded-lg border border-border bg-white/[0.02] hover:bg-white/[0.06] disabled:opacity-40"
                  aria-label="Reducir zoom"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <input
                  type="range"
                  min={MIN_SCALE}
                  max={MAX_SCALE}
                  step={0.01}
                  value={scale}
                  onChange={(e) => setScaleKeepCenter(Number(e.target.value))}
                  disabled={!imgReady || processing}
                  className="flex-1 accent-bitcoin"
                  aria-label="Zoom"
                />
                <button
                  type="button"
                  onClick={() => setScaleKeepCenter(scale + 0.25)}
                  disabled={scale >= MAX_SCALE || !imgReady || processing}
                  className="p-1.5 rounded-lg border border-border bg-white/[0.02] hover:bg-white/[0.06] disabled:opacity-40"
                  aria-label="Aumentar zoom"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-2 text-[10px] font-mono text-foreground-subtle text-center">
                arrastrá para reposicionar · rueda o slider para zoom
              </p>
            </div>

            <div className="relative px-6 py-4 bg-black/30 border-t border-border flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onCancel}
                disabled={processing}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-foreground-muted hover:text-foreground hover:bg-white/5 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!imgReady || processing}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-bitcoin to-yellow-500 text-black disabled:opacity-60 disabled:cursor-progress"
              >
                {processing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Procesando…
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    Usar recorte
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
