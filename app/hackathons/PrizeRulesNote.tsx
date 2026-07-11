"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Info, X } from "lucide-react";
import { useScrollLock } from "@/lib/useScrollLock";
import { PROGRAM, formatSats } from "@/lib/hackathons";

const TITLE_ID = "prize-rules-modal-title";

/**
 * Fine print + modal covering the two prize conditions: one prize per person
 * (a participant with several projects only wins with their best-ranked one)
 * and the scarcity rule (fewer participating projects than prize slots → the
 * smallest prizes go out first, with a worked example). Reused under the
 * `/hackathons` prize grid and each hackathon's "Premios" results card. Kept
 * as its own client component so the server pages stay server components.
 */
export default function PrizeRulesNote() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useScrollLock(open);

  useEffect(() => {
    if (!open) return;
    // Move focus into the dialog on open, and restore it to the trigger on
    // close so keyboard users don't lose their place behind the overlay.
    const trigger = triggerRef.current;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      trigger?.focus();
    };
  }, [open]);

  const slots = [...PROGRAM.prizeDistribution].sort(
    (a, b) => a.position - b.position,
  );
  const example = slots.slice(-3);

  return (
    <>
      <p className="mt-4 text-xs text-foreground-subtle leading-relaxed">
        * Un premio por persona · si participan menos de {slots.length}{" "}
        proyectos, se entregan los premios más chicos primero.{" "}
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="underline underline-offset-2 hover:text-foreground-muted transition-colors"
        >
          Ver condiciones
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
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={TITLE_ID}
              tabIndex={-1}
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative w-full max-w-md glass-strong rounded-2xl border border-border-strong overflow-hidden outline-none"
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
                  <h2 id={TITLE_ID} className="font-display font-bold text-lg">
                    Condiciones de los premios
                  </h2>
                </div>

                <div className="space-y-4 text-sm text-foreground-muted leading-relaxed">
                  <p>
                    Cada hackatón reparte{" "}
                    {formatSats(PROGRAM.prizePerHackathon)} sats entre los
                    mejores {slots.length} proyectos, del 1° al {slots.length}
                    °.
                  </p>

                  <div className="space-y-1.5">
                    <h3 className="text-xs font-mono font-semibold uppercase tracking-widest text-bitcoin">
                      Un premio por persona
                    </h3>
                    <p>
                      Cada persona puede ganar un solo premio. Si participás con
                      varios proyectos, solo se premia el mejor ranqueado; los
                      demás quedan fuera del reparto.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <h3 className="text-xs font-mono font-semibold uppercase tracking-widest text-bitcoin">
                      Menos proyectos que premios
                    </h3>
                    <p>
                      Si participan menos de {slots.length} proyectos, los
                      premios más chicos se entregan primero — así nadie se
                      lleva de más y no queda parte del pozo sin asignar.
                    </p>
                    <div className="mt-2 rounded-xl border border-border bg-white/[0.02] p-3">
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
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
