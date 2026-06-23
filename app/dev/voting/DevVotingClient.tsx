"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, KeyRound, Plus, Trash2, UserCheck } from "lucide-react";
import { HACKATHONS, hackathonStatus } from "@/lib/hackathons";
import { useAuth, clearAuth } from "@/lib/auth";
import { useDevIdentities } from "@/lib/useDevIdentities";
import { cn } from "@/lib/cn";
import type { VotingPeriod } from "@/lib/voting";
import VotingSection from "@/app/hackathons/[id]/VotingSection";

export default function DevVotingClient({
  testNamespace,
}: {
  testNamespace: boolean;
}) {
  const { auth } = useAuth();
  const { identities, generateIdentity, removeIdentity, loginAs, copy } =
    useDevIdentities();

  const activeHackathon = useMemo(
    () => HACKATHONS.find((h) => hackathonStatus(h) === "active") ?? HACKATHONS[0],
    [],
  );
  const [hackathonId, setHackathonId] = useState(activeHackathon.id);
  const [period, setPeriod] = useState<VotingPeriod | null>(null);
  const [loadingPeriod, setLoadingPeriod] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingPeriod(true);
    fetch(`/api/hackathons/${hackathonId}/voting`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { period?: VotingPeriod | null } | null) => {
        if (!cancelled) setPeriod(data?.period ?? null);
      })
      .catch(() => {
        if (!cancelled) setPeriod(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingPeriod(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hackathonId]);

  return (
    <div className="mt-8 space-y-8">
      {/* ── Identity lab ── */}
      <section className="rounded-2xl border border-border bg-background-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-foreground-muted" />
            <h2 className="font-display font-bold text-sm uppercase tracking-widest text-foreground-muted">
              Identidades de prueba
            </h2>
          </div>
          <button
            type="button"
            onClick={generateIdentity}
            className="inline-flex items-center gap-2 rounded-lg border border-nostr/40 bg-nostr/10 px-3 py-1.5 text-[11px] font-mono font-bold uppercase tracking-widest text-nostr hover:bg-nostr/20 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Generar identidad
          </button>
        </div>

        <p className="text-xs text-foreground-muted leading-relaxed mb-4">
          Para actuar como <strong>admin</strong>: copiá el npub de una
          identidad a <code className="font-mono">NEXT_PUBLIC_LACRYPTA_ADMIN_NPUB</code>.
          Para habilitar <strong>votantes</strong>: copiá sus pubkeys hex a{" "}
          <code className="font-mono">VOTING_TEST_EXTRA_VOTERS</code> (formato{" "}
          <code className="font-mono">hexpk:presupuesto,hexpk:presupuesto</code>).
          Reiniciá el server tras cambiar el .env.local.
        </p>

        {identities.length === 0 ? (
          <p className="text-sm text-foreground-subtle">
            Sin identidades todavía — generá un par para empezar.
          </p>
        ) : (
          <ul className="space-y-2">
            {identities.map((identity) => {
              const active = auth?.pubkey === identity.pubkey;
              return (
                <li
                  key={identity.pubkey}
                  className={cn(
                    "flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2",
                    active
                      ? "border-success/40 bg-success/5"
                      : "border-border bg-white/[0.02]",
                  )}
                >
                  <span className="text-sm font-semibold">{identity.label}</span>
                  {active && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-success/10 text-[9px] font-mono font-bold tracking-widest text-success">
                      <UserCheck className="h-3 w-3" />
                      ACTIVA
                    </span>
                  )}
                  <span className="flex-1 min-w-[120px] text-[10px] font-mono text-foreground-subtle truncate">
                    {identity.npub}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => copy(identity.npub, "npub")}
                      className="rounded-md border border-border px-2 py-1 text-[10px] font-mono text-foreground-muted hover:text-foreground transition-colors"
                    >
                      <Copy className="h-3 w-3 inline mr-1" />
                      npub
                    </button>
                    <button
                      type="button"
                      onClick={() => copy(identity.pubkey, "pubkey hex")}
                      className="rounded-md border border-border px-2 py-1 text-[10px] font-mono text-foreground-muted hover:text-foreground transition-colors"
                    >
                      <Copy className="h-3 w-3 inline mr-1" />
                      hex
                    </button>
                    <button
                      type="button"
                      onClick={() => loginAs(identity)}
                      disabled={active}
                      className="rounded-md border border-nostr/40 bg-nostr/10 px-2 py-1 text-[10px] font-mono font-bold text-nostr hover:bg-nostr/20 disabled:opacity-50 transition-colors"
                    >
                      Usar esta identidad
                    </button>
                    <button
                      type="button"
                      onClick={() => removeIdentity(identity.pubkey)}
                      aria-label={`Borrar ${identity.label}`}
                      className="rounded-md border border-border px-2 py-1 text-foreground-subtle hover:text-danger transition-colors"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {auth && (
          <div className="mt-4 flex items-center gap-3 text-xs font-mono text-foreground-subtle">
            <span>
              Sesión actual: {auth.method} · {auth.pubkey.slice(0, 16)}…
            </span>
            <button
              type="button"
              onClick={() => clearAuth("user")}
              className="rounded-md border border-border px-2 py-1 text-[10px] text-foreground-muted hover:text-foreground transition-colors"
            >
              Cerrar sesión
            </button>
          </div>
        )}
      </section>

      {/* ── Period status + embedded production component ── */}
      <section>
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <label
            htmlFor="dev-voting-hackathon"
            className="text-xs font-mono font-semibold tracking-widest text-foreground-muted uppercase"
          >
            Hackatón
          </label>
          <select
            id="dev-voting-hackathon"
            value={hackathonId}
            onChange={(e) => setHackathonId(e.target.value)}
            className="rounded-lg border border-border bg-background-card px-3 py-1.5 text-sm"
          >
            {HACKATHONS.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name} ({h.id}) — {hackathonStatus(h)}
              </option>
            ))}
          </select>
          <span className="text-[10px] font-mono text-foreground-subtle">
            {loadingPeriod
              ? "Cargando estado…"
              : period
                ? `Estado: ${period.status} · ${period.eligible.length} votantes · ${period.projects.length} proyectos`
                : "Sin votación publicada"}
          </span>
          <span
            className={cn(
              "inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-mono font-bold tracking-widest",
              testNamespace
                ? "bg-lightning/10 border border-lightning/40 text-lightning"
                : "bg-danger/10 border border-danger/40 text-danger",
            )}
          >
            {testNamespace ? "NAMESPACE TEST" : "NAMESPACE PRODUCCIÓN"}
          </span>
        </div>

        {/* The real production component — what you test here is what ships. */}
        <VotingSection
          key={`${hackathonId}:${loadingPeriod ? "loading" : period ? "loaded" : "none"}`}
          hackathonId={hackathonId}
          hackathonName={
            HACKATHONS.find((h) => h.id === hackathonId)?.name ?? hackathonId
          }
          initialPeriod={period}
        />
      </section>
    </div>
  );
}
