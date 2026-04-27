"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ImageIcon, Loader2, Upload } from "lucide-react";
import { cn } from "@/lib/cn";

export type UploadReveal = {
  localUrl: string;
  percent: number;
  fading?: boolean;
};

function RevealOverlay({
  localUrl,
  percent,
  fading,
  direction = "bottom-to-top",
}: {
  localUrl: string;
  percent: number;
  fading?: boolean;
  direction?: "left-to-right" | "bottom-to-top";
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const [phase, setPhase] = useState(0);
  const rafRef = useRef<number>(0);
  const clampedRef = useRef(clamped);
  const displayRef = useRef(clamped);
  clampedRef.current = clamped;

  useEffect(() => {
    if (direction !== "bottom-to-top") return;
    const tick = () => {
      displayRef.current += (clampedRef.current - displayRef.current) * 0.03;
      setPhase((p) => p + 0.0207);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [direction]);

  const clipPath = useMemo(() => {
    if (direction === "left-to-right") return `inset(0 ${100 - clamped}% 0 0)`;
    const yBase = 100 - displayRef.current;
    const n = 32;
    const amp = 5;
    const pts = Array.from({ length: n + 1 }, (_, i) => {
      const x = (i / n) * 100;
      const y = Math.max(0, Math.min(100, yBase + Math.sin((i / n) * Math.PI * 2 + phase) * amp));
      return `${x.toFixed(2)}% ${y.toFixed(2)}%`;
    });
    return `polygon(0% 100%, 100% 100%, ${[...pts].reverse().join(", ")})`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [direction, clamped, phase]);

  return (
    <div
      className={cn(
        "absolute inset-0 pointer-events-none transition-opacity duration-300 ease-out",
        fading ? "opacity-0" : "opacity-100",
      )}
      aria-hidden
    >
      <div
        className={cn(
          "absolute inset-0 overflow-hidden",
          direction === "left-to-right" && "transition-[clip-path] duration-1000 ease-out",
        )}
        style={{ clipPath }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={localUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
      </div>
      {direction === "left-to-right" && (
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-bitcoin shadow-[0_0_8px_rgba(247,147,26,0.9)] transition-[left,opacity] duration-1000 ease-out"
          style={{
            left: `calc(${clamped}% - 1px)`,
            opacity: clamped > 0 && clamped < 100 ? 1 : 0,
          }}
        />
      )}
      <div className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/70 border border-white/10 backdrop-blur-sm text-[10px] font-mono tabular-nums text-white">
        <span className="h-1.5 w-1.5 rounded-full bg-bitcoin animate-pulse" />
        {clamped}%
      </div>
    </div>
  );
}

export function AvatarUploader({
  src,
  name,
  uploading,
  disabled,
  onPick,
  reveal,
}: {
  src?: string;
  name: string;
  uploading: boolean;
  disabled: boolean;
  onPick: () => void;
  reveal: UploadReveal | null;
}) {
  const initials = name.slice(0, 2).toUpperCase();
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      className="relative h-24 w-24 rounded-2xl overflow-hidden border-4 border-background bg-background-card ring-1 ring-border-strong hover:ring-2 hover:ring-bitcoin/60 transition-all disabled:cursor-progress group shrink-0"
      aria-label="Cambiar avatar"
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name}
          className="w-full h-full object-cover"
          onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-bitcoin/30 to-nostr/30 text-2xl font-display font-bold">
          {initials}
        </div>
      )}
      {reveal && (
        <RevealOverlay
          localUrl={reveal.localUrl}
          percent={reveal.percent}
          fading={reveal.fading}
        />
      )}
      <div
        className={cn(
          "absolute inset-0 flex items-center justify-center text-white text-[10px] font-mono uppercase tracking-widest transition-opacity",
          uploading && !reveal
            ? "bg-black/60 opacity-100"
            : reveal
              ? "opacity-0"
              : "bg-black/50 opacity-0 group-hover:opacity-100",
        )}
      >
        {uploading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <div className="flex flex-col items-center gap-1">
            <Upload className="h-4 w-4" />
            Cambiar
          </div>
        )}
      </div>
    </button>
  );
}

export function BannerUploader({
  src,
  uploading,
  disabled,
  onPick,
  reveal,
}: {
  src?: string;
  uploading: boolean;
  disabled: boolean;
  onPick: () => void;
  reveal: UploadReveal | null;
}) {
  return (
    <div className="relative h-32 w-full bg-gradient-to-br from-bitcoin/20 via-nostr/15 to-cyan/15 overflow-hidden">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt="banner"
          className="w-full h-full object-cover"
          onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-foreground-subtle text-[10px] font-mono uppercase tracking-widest">
          <ImageIcon className="h-4 w-4 mr-2" />
          Sin banner
        </div>
      )}
      {reveal && (
        <RevealOverlay
          localUrl={reveal.localUrl}
          percent={reveal.percent}
          fading={reveal.fading}
          direction="left-to-right"
        />
      )}
      {uploading && !reveal && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-white" />
        </div>
      )}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/40">
        <button
          type="button"
          onClick={onPick}
          disabled={disabled}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/60 border border-white/20 hover:bg-black/80 text-white text-xs font-semibold disabled:opacity-50"
        >
          <Upload className="h-3.5 w-3.5" />
          Cambiar banner
        </button>
      </div>
    </div>
  );
}
