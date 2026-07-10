"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Info, X } from "lucide-react";
import { useScrollLock } from "@/lib/useScrollLock";
import { PROGRAM, formatSats } from "@/lib/hackathons";

/**
 * Fine print under the prize-structure grid: explains the partial-podium
 * rule (fewer participating projects than prize slots → the smallest prizes
 * go out first) and opens a modal with a worked example. Kept as its own
 * client component so the surrounding page.tsx stays a server component.
 */
export default function PrizeRulesNote() {
  const [open, setOpen] = useState(false);
  useScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const slots = [...PROGRAM.prizeDistribution].sort(
    (a, b) => a.position - b.position,
  );
  const example = slots.slice(-3);

  return (
    <>
      <p className="mt-4 text-xs text-foreground-subtle leading-relaxed">
        * Si hay menos proyectos participantes que premios, se entregan los
        premios más chicos primero.{" "}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="underline underline-offset-2 hover:text-foreground-muted transition-colors"
        >
          Ver cómo funciona
        </button>
      </p>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
              onClick={() => setOpen(false)}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative w-full max-w-md glass-strong rounded-2xl border border-border-strong overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-bitcoin/10 via-transparent to-nostr/10 pointer-events-none" />
              <div className="absolute -top-px left-1/2 -translate-x-1/2 w-[40%] h-px bg-gradient-to-r from-transparent via-bitcoin to-transparent" />

              <button
                onClick={() => setOpen(false)}
                className="absolute top-4 right-4 p-2 rounded-lg text-foreground-muted hover:text-foreground hover:bg-white/5 transition-colors z-10"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="relative px-6 pt-8 pb-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-bitcoin/10 text-bitcoin">
                    <Info className="h-5 w-5" />
                  </div>
                  <h2 className="font-display font-bold text-lg">
                    Cómo se reparten los premios
                  </h2>
                </div>

                <div className="space-y-3 text-sm text-foreground-muted leading-relaxed">
                  <p>
                    Cada hackatón reparte{" "}
                    {formatSats(PROGRAM.prizePerHackathon)} sats entre los
                    mejores {slots.length} proyectos, del 1° al {slots.length}
                    °.
                  </p>
                  <p>
                    Si participan menos de {slots.length} proyectos, los
                    premios más chicos se entregan primero — así nadie se
                    lleva de más y no queda parte del pozo sin asignar.
                  </p>

                  <div className="rounded-xl border border-border bg-white/[0.02] p-3">
                    <p className="mb-2 text-[10px] font-mono uppercase tracking-widest text-foreground-subtle">
                      Ejemplo con 3 proyectos participando
                    </p>
                    <ul className="space-y-1 text-xs font-mono">
                      {example.map((slot, i) => (
                        <li
                          key={slot.position}
                          className="flex items-center justify-between"
                        >
                          <span className="text-foreground-muted">
                            {i + 1}° lugar
                          </span>
                          <span className="font-bold tabular-nums">
                            {formatSats(slot.sats)} sats
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
