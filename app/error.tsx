"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, RotateCw, Zap } from "lucide-react";
import BrokenCableAnimation from "@/components/ui/BrokenCableAnimation";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="relative min-h-[calc(100vh-80px)] flex items-center justify-center overflow-hidden px-4 sm:px-6 lg:px-8 py-24">
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute inset-0 bg-grid bg-grid-fade opacity-40" />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] bg-danger/15 blur-[140px] rounded-full" />
        <div className="absolute bottom-10 right-10 w-[300px] h-[300px] bg-bitcoin/15 blur-[120px] rounded-full" />
      </div>

      <div className="relative max-w-3xl mx-auto w-full text-center">
        <BrokenCableAnimation
          className="mx-auto w-full max-w-xl aspect-[3/2]"
          ariaLabel="Animación de un cable cortado con chispas"
        />

        <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-white/5 text-xs font-mono tracking-wider text-foreground-muted">
          <Zap size={12} className="text-danger" />
          ERROR INESPERADO
        </div>

        <h1 className="mt-6 font-display text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-[1.05]">
          Algo se <span className="text-gradient-bitcoin">rompió</span>
        </h1>

        <p className="mt-5 text-lg text-foreground-muted max-w-xl mx-auto leading-relaxed">
          Hubo un cortocircuito de nuestro lado. Reintentá o volvé al inicio
          mientras lo arreglamos.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => unstable_retry()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-bitcoin text-black font-semibold text-sm hover:bg-bitcoin/90 transition shadow-lg shadow-bitcoin/20"
          >
            <RotateCw size={16} />
            Reintentar
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-border bg-white/5 text-foreground font-semibold text-sm hover:bg-white/10 transition"
          >
            <ArrowLeft size={16} />
            Volver al inicio
          </Link>
        </div>

        {error.digest && (
          <p className="mt-10 text-xs font-mono text-foreground-subtle tracking-wider">
            $ ref:{" "}
            <span className="text-foreground-muted">{error.digest}</span>
          </p>
        )}
      </div>
    </section>
  );
}
