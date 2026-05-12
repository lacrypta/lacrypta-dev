import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Zap } from "lucide-react";
import BrokenCableAnimation from "@/components/ui/BrokenCableAnimation";

export const metadata: Metadata = {
  title: "404 — Cable cortado",
  description: "La página que buscás se desconectó del aire.",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <section className="relative min-h-[calc(100vh-80px)] flex items-center justify-center overflow-hidden px-4 sm:px-6 lg:px-8 py-24">
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute inset-0 bg-grid bg-grid-fade opacity-40" />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] bg-bitcoin/15 blur-[140px] rounded-full" />
        <div className="absolute bottom-10 right-10 w-[300px] h-[300px] bg-nostr/15 blur-[120px] rounded-full" />
      </div>

      <div className="relative max-w-3xl mx-auto w-full text-center">
        <BrokenCableAnimation
          className="mx-auto w-full max-w-xl aspect-[3/2]"
          ariaLabel="Animación de un cable cortado con chispas"
        />

        <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-white/5 text-xs font-mono tracking-wider text-foreground-muted">
          <Zap size={12} className="text-bitcoin" />
          NOT FOUND
        </div>

        <h1 className="mt-6 font-display text-7xl sm:text-8xl md:text-9xl font-bold tracking-tight leading-[1] tabular-nums">
          <span className="text-gradient-bitcoin">404</span>
        </h1>

        <p className="mt-4 font-display text-2xl sm:text-3xl font-semibold text-foreground">
          Cable cortado
        </p>

        <p className="mt-4 text-lg text-foreground-muted max-w-xl mx-auto leading-relaxed">
          La página que buscás se desconectó del aire. Probá reconectarte desde
          otro lado.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-bitcoin text-black font-semibold text-sm hover:bg-bitcoin/90 transition shadow-lg shadow-bitcoin/20"
          >
            <ArrowLeft size={16} />
            Volver al inicio
          </Link>
          <Link
            href="/hackathons"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-border bg-white/5 text-foreground font-semibold text-sm hover:bg-white/10 transition"
          >
            Ver hackatones
          </Link>
        </div>

        <p className="mt-10 text-xs font-mono text-foreground-subtle tracking-wider">
          $ status: <span className="text-danger">DISCONNECTED</span>
        </p>
      </div>
    </section>
  );
}
