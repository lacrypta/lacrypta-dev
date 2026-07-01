"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Collapses the "Nuestro enfoque" (pilares) section behind a single big CTA
 * button — hidden by default so it doesn't compete with the hackathon
 * timeline above. `children` (eyebrow/heading/description + pilar grid) is
 * server-rendered in page.tsx and passed in, so only the toggle chrome needs
 * to be a client component.
 */
export default function PilaresDisclosure({
  children,
}: {
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="relative overflow-hidden border-t border-border bg-[radial-gradient(ellipse_at_top,_rgba(247,147,26,0.10),_transparent_55%),radial-gradient(ellipse_at_bottom,_rgba(168,85,247,0.10),_transparent_55%),linear-gradient(180deg,#0c1024_0%,#0a0d1a_100%)]">
      {/* Subtle ambient glows so the section doesn't read as a flat block. */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-1/4 h-72 w-72 rounded-full bg-bitcoin/[0.10] blur-3xl" />
        <div className="absolute -bottom-24 right-1/4 h-72 w-72 rounded-full bg-nostr/[0.10] blur-3xl" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 h-px w-full max-w-3xl bg-gradient-to-r from-transparent via-bitcoin/60 to-transparent" />
      </div>

      <div
        className={cn(
          "relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8",
          open ? "py-16 sm:py-24" : "py-12 sm:py-16",
        )}
      >
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className={cn(
              "group inline-flex items-center gap-3 rounded-2xl border border-bitcoin/40 bg-bitcoin/10 px-8 py-5 font-display text-lg sm:text-xl font-black uppercase tracking-wide text-bitcoin shadow-[0_0_40px_-12px_rgba(247,147,26,0.5)] transition-all hover:scale-[1.02] hover:bg-bitcoin/15 hover:shadow-[0_0_56px_-8px_rgba(247,147,26,0.65)] active:scale-[0.98]",
            )}
          >
            <Sparkles className="h-5 w-5" />
            Nuestro enfoque
            <ChevronDown
              className={cn(
                "h-5 w-5 transition-transform",
                open && "rotate-180",
              )}
            />
          </button>
        </div>

        {open && <div className="mt-12">{children}</div>}
      </div>
    </section>
  );
}
