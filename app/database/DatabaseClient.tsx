"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Database, Network, RefreshCw, Table2 } from "lucide-react";
import { DEFAULT_RELAYS } from "@/lib/nostrRelayConfig";
import { resolveLacryptaPubkey } from "@/lib/nostrReports";
import { cn } from "@/lib/cn";
import FullSyncModal from "./FullSyncModal";
import StructureCanvas from "./StructureCanvas";
import ExplorerStudio from "./ExplorerStudio";

type DatabaseView = "structure" | "explorer";

export default function DatabaseClient() {
  const [view, setView] = useState<DatabaseView>("structure");
  const [envPubkey, setEnvPubkey] = useState<string>("");
  const [effectivePubkey, setEffectivePubkey] = useState<string>("");
  const [pubkeyInput, setPubkeyInput] = useState<string>("");
  const [pubkeyError, setPubkeyError] = useState<string | null>(null);
  const [focusCategory, setFocusCategory] = useState<string | null>(null);
  const [fullSyncOpen, setFullSyncOpen] = useState(false);

  useEffect(() => {
    resolveLacryptaPubkey().then((pk) => {
      setEnvPubkey(pk);
      // Don't clobber an override the user may have applied while this resolved.
      if (pk) setEffectivePubkey((current) => current || pk);
    });
  }, []);

  const applyPubkeyOverride = useCallback(async () => {
    const raw = pubkeyInput.trim();
    if (!raw) {
      setPubkeyError("Pegá un npub o pubkey en hex");
      return;
    }
    if (/^[0-9a-f]{64}$/i.test(raw)) {
      setEffectivePubkey(raw.toLowerCase());
      setPubkeyError(null);
      return;
    }
    if (raw.startsWith("npub1")) {
      try {
        const { decode } = await import("nostr-tools/nip19");
        const r = decode(raw);
        if (r.type === "npub") {
          setEffectivePubkey(r.data as string);
          setPubkeyError(null);
          return;
        }
      } catch {
        /* fall through */
      }
    }
    setPubkeyError("Formato inválido (esperado npub1… o 64 hex)");
  }, [pubkeyInput]);

  const clearPubkeyOverride = useCallback(() => {
    setEffectivePubkey(envPubkey);
    setPubkeyInput("");
    setPubkeyError(null);
  }, [envPubkey]);

  const scanCategory = useCallback((categoryId: string) => {
    setFocusCategory(categoryId);
    setView("explorer");
  }, []);

  return (
    <div className="relative pt-24 pb-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <header className="space-y-2">
          <div className="inline-flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-foreground-subtle">
            <Database className="h-3 w-3" />
            Interno · no indexar
          </div>
          <h1 className="font-display text-4xl sm:text-5xl font-black tracking-tight">Database</h1>
          <p className="text-sm text-foreground-muted">Estructura y datos de los eventos Nostr.</p>
          <PubkeyOverride
            envPubkey={envPubkey}
            effectivePubkey={effectivePubkey}
            input={pubkeyInput}
            error={pubkeyError}
            onInputChange={(v) => {
              setPubkeyInput(v);
              if (pubkeyError) setPubkeyError(null);
            }}
            onApply={applyPubkeyOverride}
            onClear={clearPubkeyOverride}
          />
        </header>

        {/* ── Tabs ────────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 rounded-xl border border-border bg-background-card/50 w-fit">
            {(
              [
                { id: "structure", label: "Estructura", icon: Network },
                { id: "explorer", label: "Explorador", icon: Table2 },
              ] as const
            ).map((tab) => {
              const active = view === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setView(tab.id)}
                  className={cn(
                    "inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-colors",
                    active
                      ? "bg-bitcoin/15 text-bitcoin"
                      : "text-foreground-subtle hover:text-foreground hover:bg-white/[0.04]",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
          {view === "explorer" && (
            <button
              type="button"
              onClick={() => setFullSyncOpen(true)}
              title="Scanea todas las tablas y republica lo que falte en cada relay."
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-cyan/40 bg-cyan/10 hover:bg-cyan/15 text-cyan text-sm font-semibold transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Sincronizar todo
            </button>
          )}
        </div>

        {view === "structure" && <StructureCanvas onScanCategory={scanCategory} />}
        {view === "explorer" && (
          <ExplorerStudio
            pubkey={effectivePubkey}
            focusCategoryId={focusCategory}
            onConsumedFocus={() => setFocusCategory(null)}
          />
        )}
      </div>

      <FullSyncModal
        open={fullSyncOpen}
        onClose={() => setFullSyncOpen(false)}
        relays={[...DEFAULT_RELAYS]}
        pubkey={effectivePubkey}
      />
    </div>
  );
}

/* ───────────────────────────── Pubkey override ──────────────────────────── */

function PubkeyOverride({
  envPubkey,
  effectivePubkey,
  input,
  error,
  onInputChange,
  onApply,
  onClear,
}: {
  envPubkey: string;
  effectivePubkey: string;
  input: string;
  error: string | null;
  onInputChange: (v: string) => void;
  onApply: () => void;
  onClear: () => void;
}) {
  const isOverride = effectivePubkey !== "" && effectivePubkey !== envPubkey;

  if (effectivePubkey) {
    return (
      <div className="mt-1 inline-flex items-center gap-2 flex-wrap text-[10px] font-mono">
        <span
          className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border",
            isOverride
              ? "border-cyan/30 bg-cyan/[0.05] text-cyan"
              : "border-border text-foreground-subtle",
          )}
        >
          {isOverride ? "sobrescritura" : "env"} · {effectivePubkey.slice(0, 12)}…{effectivePubkey.slice(-8)}
        </span>
        {isOverride && (
          <button
            type="button"
            onClick={onClear}
            className="text-foreground-subtle hover:text-foreground underline underline-offset-2"
          >
            quitar sobrescritura
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-1.5 max-w-2xl">
      <div className="text-[10px] font-mono text-bitcoin inline-flex items-center gap-1">
        <AlertCircle className="h-3 w-3" />
        Pubkey oficial no resuelta. Pegá una pubkey para habilitar el resto de los eventos.
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onApply();
            }
          }}
          placeholder="npub1… o 64 caracteres hex"
          spellCheck={false}
          autoComplete="off"
          className="flex-1 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-border focus:border-bitcoin/50 focus:bg-white/[0.05] transition-colors text-xs font-mono placeholder:text-foreground-subtle"
        />
        <button
          type="button"
          onClick={onApply}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-cyan/40 bg-cyan/10 hover:bg-cyan/15 text-cyan text-xs font-semibold transition-colors"
        >
          Aplicar
        </button>
      </div>
      {error && <p className="text-[11px] text-danger font-mono">{error}</p>}
    </div>
  );
}
