"use client";

import { VenetianMask } from "lucide-react";
import { useDevIdentities } from "@/lib/useDevIdentities";
import { useDevEnabled } from "@/lib/useDevEnabled";

/**
 * Dev-only "impersonate this user" button on a soldier profile. Logs in as the
 * deterministic dev stand-in for the soldier's pubkey (we never have their real
 * secret), so the voting flow can be exercised as them. The page only renders
 * this when `isDevMode()` (env) is true; it additionally hides itself when the
 * runtime dev switch is OFF, and wears the dashed-amber "dev" style so it's
 * obvious it isn't a real production button.
 */
export default function ImpersonateButton({
  pubkey,
  name,
}: {
  pubkey: string;
  name: string;
}) {
  const { impersonate } = useDevIdentities();
  const { enabled } = useDevEnabled();
  if (!enabled) return null;
  return (
    <button
      type="button"
      onClick={() => impersonate(pubkey, name)}
      title="Botón de DEV — no existe en producción"
      className="inline-flex items-center gap-2 rounded-lg border border-dashed border-bitcoin/60 bg-bitcoin/10 px-3 py-2 text-sm font-semibold text-bitcoin hover:bg-bitcoin/20 transition-colors"
    >
      <VenetianMask className="h-4 w-4" />
      Impersonar
      <span className="text-[9px] font-mono font-bold tracking-widest rounded bg-bitcoin/20 px-1 py-0.5">
        DEV
      </span>
    </button>
  );
}
