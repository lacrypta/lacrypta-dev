"use client";

import { useEffect } from "react";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { RotateCw, Zap } from "lucide-react";
import BrokenCableAnimation from "@/components/ui/BrokenCableAnimation";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export default function GlobalError({
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
    <html
      lang="es"
      className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <head>
        <title>Falla crítica · La Crypta Dev</title>
      </head>
      <body className="min-h-full bg-background text-foreground">
        <section className="relative min-h-screen flex items-center justify-center overflow-hidden px-4 sm:px-6 lg:px-8 py-16">
          <div className="absolute inset-0 -z-10 pointer-events-none">
            <div className="absolute inset-0 bg-grid bg-grid-fade opacity-40" />
            <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] bg-danger/15 blur-[140px] rounded-full" />
          </div>

          <div className="relative max-w-3xl mx-auto w-full text-center">
            <BrokenCableAnimation
              className="mx-auto w-full max-w-xl aspect-[3/2]"
              ariaLabel="Animación de un cable cortado con chispas"
            />

            <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-white/5 text-xs font-mono tracking-wider text-foreground-muted">
              <Zap size={12} className="text-danger" />
              FALLA CRÍTICA
            </div>

            <h1 className="mt-6 font-display text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-[1.05]">
              Se cayó <span className="text-gradient-bitcoin">todo</span>
            </h1>

            <p className="mt-5 text-lg text-foreground-muted max-w-xl mx-auto leading-relaxed">
              Hubo una falla profunda en el sistema. Estamos al tanto. Probá
              recargar en un momento.
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
              <a
                href="/"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-border bg-white/5 text-foreground font-semibold text-sm hover:bg-white/10 transition"
              >
                Volver al inicio
              </a>
            </div>

            {error.digest && (
              <p className="mt-10 text-xs font-mono text-foreground-subtle tracking-wider">
                $ ref:{" "}
                <span className="text-foreground-muted">{error.digest}</span>
              </p>
            )}
          </div>
        </section>
      </body>
    </html>
  );
}
