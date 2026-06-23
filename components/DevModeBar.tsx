"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlaskConical,
  ChevronDown,
  Plus,
  Copy,
  LogOut,
  ShieldCheck,
  UserCheck,
  Trash2,
  Radio,
  VenetianMask,
  Users,
  KeyRound,
  Database,
  Loader2,
  Power,
  PowerOff,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useDevIdentities } from "@/lib/useDevIdentities";
import { useDevEnabled } from "@/lib/useDevEnabled";
import { useToast } from "@/components/Toast";
import { generateDummyData, loadDummyUsers, type DummyUser } from "@/lib/devSeed";
import { cn } from "@/lib/cn";

type ImpersonatableSoldier = { pubkey: string; name: string; maxVotes: number };

/** Host of the first configured local relay, for the "todo local" indicator. */
function relayHost(): string | null {
  const raw = process.env.NEXT_PUBLIC_NOSTR_RELAYS;
  if (!raw) return null;
  const first = raw.split(",")[0]?.trim();
  if (!first) return null;
  try {
    return new URL(first).host;
  } catch {
    return first;
  }
}

/**
 * Dev-only top strip + account-impersonation switcher. Rendered by the root
 * layout only when `isDevMode()` is true. Deliberately a <div> (not <header>)
 * so it dodges the `header.fixed` scroll-lock rule in globals.css; it
 * self-applies the same `--sbw` compensation so it tracks the header when a
 * modal locks scroll.
 */
export default function DevModeBar() {
  const { auth } = useAuth();
  const {
    identities,
    generateIdentity,
    removeIdentity,
    loginAs,
    loginAsAdmin,
    impersonate,
    logout,
    copy,
  } = useDevIdentities();
  const { push, dismiss } = useToast();
  const { enabled, setEnabled } = useDevEnabled();
  const [open, setOpen] = useState(false);
  const [adminPubkey, setAdminPubkey] = useState<string | null>(null);
  const [soldiers, setSoldiers] = useState<ImpersonatableSoldier[]>([]);
  // Map of soldier real pubkey → dev stand-in pubkey, so we can tell which
  // soldier the current session is impersonating.
  const [devPubkeys, setDevPubkeys] = useState<Record<string, string>>({});
  const [seeding, setSeeding] = useState(false);
  const [dummyUsers, setDummyUsers] = useState<DummyUser[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);
  const relay = relayHost();

  useEffect(() => {
    setDummyUsers(loadDummyUsers());
  }, []);

  const loadSoldiers = useCallback(async () => {
    try {
      const res = await fetch("/api/dev/soldiers");
      if (!res.ok) return;
      const data = (await res.json()) as { soldiers?: ImpersonatableSoldier[] };
      const list = data.soldiers ?? [];
      setSoldiers(list);
      const { devPubkeyForPubkey } = await import("@/lib/devImpersonation");
      const entries = await Promise.all(
        list.map(
          async (s) => [s.pubkey, await devPubkeyForPubkey(s.pubkey)] as const,
        ),
      );
      setDevPubkeys(Object.fromEntries(entries));
    } catch {
      /* ignore */
    }
  }, []);

  async function handleSeed() {
    if (seeding) return;
    setSeeding(true);
    const id = push({
      kind: "info",
      title: "Generando datos dummy…",
      duration: 60000,
    });
    try {
      const result = await generateDummyData((msg, doneN, total) => {
        // eslint-disable-next-line no-console
        console.log(`[dev-seed] ${doneN}/${total} ${msg}`);
      });
      setDummyUsers(result.users);
      await loadSoldiers();
      push({
        kind: "success",
        title: "Datos dummy generados",
        description: `${result.users.length} usuarios · ${result.projectsPublished} proyectos. nsecs en consola.`,
      });
    } catch (e) {
      push({
        kind: "error",
        title: "Falló la generación",
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      dismiss(id);
      setSeeding(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/lacrypta-pubkeys")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { adminPubkey?: string } | null) => {
        if (!cancelled) setAdminPubkey(data?.adminPubkey ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    loadSoldiers();
  }, [loadSoldiers]);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const isAdmin = !!auth?.pubkey && !!adminPubkey && auth.pubkey === adminPubkey;
  const activeIdentity = identities.find((i) => i.pubkey === auth?.pubkey);
  const activeSoldier = soldiers.find(
    (s) => devPubkeys[s.pubkey] && devPubkeys[s.pubkey] === auth?.pubkey,
  );
  const sessionLabel = !auth
    ? "Sin sesión"
    : isAdmin
      ? "La Crypta (admin)"
      : activeSoldier
        ? `${activeSoldier.name} (imp.)`
        : (activeIdentity?.label ?? `${auth.pubkey.slice(0, 8)}…`);

  return (
    <div
      role="status"
      className={cn(
        "fixed top-0 inset-x-0 z-[60] h-8",
        "flex items-center justify-between gap-3 px-3 pr-[var(--sbw,0px)]",
        "text-[11px] font-mono font-semibold border-b select-none transition-colors",
        enabled
          ? "bg-bitcoin text-black border-black/20"
          : "bg-zinc-700 text-zinc-300 border-black/40",
      )}
    >
      <span className="inline-flex items-center gap-1.5 min-w-0">
        <FlaskConical className="h-3.5 w-3.5 shrink-0" />
        <span className="font-bold tracking-widest uppercase">Dev Mode</span>
        {enabled ? (
          <>
            {relay && (
              <span className="hidden sm:inline-flex items-center gap-1 opacity-80">
                <Radio className="h-3 w-3" />
                relay {relay}
              </span>
            )}
            <span className="hidden md:inline opacity-60">
              · impersonación habilitada
            </span>
          </>
        ) : (
          <span className="opacity-70">· UI desactivada — solo botones reales</span>
        )}
      </span>

      <div className="flex items-center gap-2 shrink-0">
        {/* Master runtime switch: hide every dev-injected button at once. */}
        <button
          type="button"
          onClick={() => setEnabled(!enabled)}
          title={
            enabled
              ? "Desactivar la UI de dev (oculta los botones dummy)"
              : "Activar la UI de dev"
          }
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2 py-1 transition-colors",
            enabled
              ? "bg-black/15 hover:bg-black/25"
              : "bg-white/10 hover:bg-white/20 text-zinc-100",
          )}
        >
          {enabled ? (
            <Power className="h-3.5 w-3.5" />
          ) : (
            <PowerOff className="h-3.5 w-3.5" />
          )}
          <span className="font-bold tracking-widest uppercase">
            {enabled ? "ON" : "OFF"}
          </span>
        </button>

      {enabled && (
      <div ref={panelRef} className="relative shrink-0">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 rounded-md bg-black/15 hover:bg-black/25 px-2 py-1 transition-colors"
        >
          {isAdmin && <ShieldCheck className="h-3.5 w-3.5" />}
          <span className="max-w-[18ch] truncate">{sessionLabel}</span>
          <ChevronDown
            className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")}
          />
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-1.5 w-80 rounded-xl border border-border bg-background-elevated text-foreground shadow-2xl overflow-hidden z-[61]">
            <div className="p-2 space-y-1.5">
              <button
                type="button"
                onClick={() => loginAsAdmin()}
                className="w-full flex items-center gap-2 rounded-lg border border-nostr/40 bg-nostr/10 px-3 py-2 text-xs font-semibold text-nostr hover:bg-nostr/20 transition-colors"
              >
                <ShieldCheck className="h-4 w-4 shrink-0" />
                Entrar como La Crypta (admin)
              </button>
              <button
                type="button"
                onClick={() => generateIdentity()}
                className="w-full flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground-muted hover:text-foreground hover:bg-white/[0.04] transition-colors"
              >
                <Plus className="h-4 w-4 shrink-0" />
                Generar identidad
              </button>
              <button
                type="button"
                onClick={handleSeed}
                disabled={seeding}
                className="w-full flex items-center gap-2 rounded-lg border border-lightning/40 bg-lightning/10 px-3 py-2 text-xs font-semibold text-lightning hover:bg-lightning/20 disabled:opacity-50 transition-colors"
              >
                {seeding ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                ) : (
                  <Database className="h-4 w-4 shrink-0" />
                )}
                {seeding ? "Generando datos…" : "Generar datos dummy"}
              </button>
            </div>

            {/* Dummy users we generated (we hold their keys) — impersonate any. */}
            {dummyUsers.length > 0 && (
              <div className="border-t border-border">
                <div className="flex items-center gap-1.5 px-3 pt-2 pb-1 text-[10px] font-mono font-bold uppercase tracking-widest text-foreground-subtle">
                  <Database className="h-3 w-3" />
                  Usuarios dummy ({dummyUsers.length})
                </div>
                <div className="max-h-48 overflow-y-auto">
                  <ul className="divide-y divide-border/60">
                    {dummyUsers.map((u) => {
                      const active =
                        !!devPubkeys[u.pubkey] &&
                        devPubkeys[u.pubkey] === auth?.pubkey;
                      return (
                        <li
                          key={u.pubkey}
                          className={cn(
                            "flex items-center gap-2 px-3 py-1.5",
                            active && "bg-success/5",
                          )}
                        >
                          <span className="flex-1 min-w-0 flex items-center gap-1.5">
                            <span className="text-xs font-semibold truncate">
                              {u.name}
                            </span>
                            {active && (
                              <UserCheck className="h-3 w-3 text-success shrink-0" />
                            )}
                          </span>
                          <button
                            type="button"
                            onClick={() => copy(u.nsec, "nsec")}
                            aria-label="Copiar nsec"
                            className="rounded-md p-1 text-foreground-subtle hover:text-foreground transition-colors"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => impersonate(u.pubkey, u.name)}
                            disabled={active}
                            className="rounded-md border border-lightning/40 bg-lightning/10 px-2 py-1 text-[10px] font-mono font-bold text-lightning hover:bg-lightning/20 disabled:opacity-40 transition-colors inline-flex items-center gap-1"
                          >
                            <VenetianMask className="h-3 w-3" />
                            Impersonar
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            )}

            {/* Soldiers with a linked Nostr pubkey — impersonate any of them. */}
            <div className="border-t border-border">
              <div className="flex items-center gap-1.5 px-3 pt-2 pb-1 text-[10px] font-mono font-bold uppercase tracking-widest text-foreground-subtle">
                <Users className="h-3 w-3" />
                Soldados con Nostr ({soldiers.length})
              </div>
              <div className="max-h-48 overflow-y-auto">
                {soldiers.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-foreground-subtle text-center">
                    Cargando roster…
                  </p>
                ) : (
                  <ul className="divide-y divide-border/60">
                    {soldiers.map((s) => {
                      const active =
                        !!devPubkeys[s.pubkey] &&
                        devPubkeys[s.pubkey] === auth?.pubkey;
                      return (
                        <li
                          key={s.pubkey}
                          className={cn(
                            "flex items-center gap-2 px-3 py-1.5",
                            active && "bg-success/5",
                          )}
                        >
                          <span className="flex-1 min-w-0 flex items-center gap-1.5">
                            <span className="text-xs font-semibold truncate">
                              {s.name}
                            </span>
                            {active && (
                              <UserCheck className="h-3 w-3 text-success shrink-0" />
                            )}
                          </span>
                          <span
                            title={`${s.maxVotes} voto(s) — hackatones participados`}
                            className="text-[10px] font-mono text-foreground-subtle shrink-0"
                          >
                            {s.maxVotes}🗳
                          </span>
                          <button
                            type="button"
                            onClick={() => impersonate(s.pubkey, s.name)}
                            disabled={active}
                            className="rounded-md border border-bitcoin/40 bg-bitcoin/10 px-2 py-1 text-[10px] font-mono font-bold text-bitcoin hover:bg-bitcoin/20 disabled:opacity-40 transition-colors inline-flex items-center gap-1"
                          >
                            <VenetianMask className="h-3 w-3" />
                            Impersonar
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            <div className="border-t border-border">
              <div className="flex items-center gap-1.5 px-3 pt-2 pb-1 text-[10px] font-mono font-bold uppercase tracking-widest text-foreground-subtle">
                <KeyRound className="h-3 w-3" />
                Identidades descartables
              </div>
              <div className="max-h-44 overflow-y-auto">
                {identities.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-foreground-subtle text-center">
                    Sin identidades todavía.
                  </p>
                ) : (
                  <ul className="divide-y divide-border/60">
                    {identities.map((identity) => {
                    const active = auth?.pubkey === identity.pubkey;
                    return (
                      <li
                        key={identity.pubkey}
                        className={cn(
                          "flex items-center gap-2 px-3 py-2",
                          active && "bg-success/5",
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold truncate">
                              {identity.label}
                            </span>
                            {active && (
                              <UserCheck className="h-3 w-3 text-success shrink-0" />
                            )}
                          </div>
                          <span className="block text-[10px] font-mono text-foreground-subtle truncate">
                            {identity.npub}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => copy(identity.npub, "npub")}
                          aria-label="Copiar npub"
                          className="rounded-md p-1 text-foreground-subtle hover:text-foreground transition-colors"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => loginAs(identity)}
                          disabled={active}
                          className="rounded-md border border-nostr/40 bg-nostr/10 px-2 py-1 text-[10px] font-mono font-bold text-nostr hover:bg-nostr/20 disabled:opacity-40 transition-colors"
                        >
                          Usar
                        </button>
                        <button
                          type="button"
                          onClick={() => removeIdentity(identity.pubkey)}
                          aria-label={`Borrar ${identity.label}`}
                          className="rounded-md p-1 text-foreground-subtle hover:text-danger transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
                )}
              </div>
            </div>

            {auth && (
              <div className="border-t border-border p-2">
                <button
                  type="button"
                  onClick={() => logout()}
                  className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-foreground-muted hover:text-danger hover:bg-danger/5 transition-colors"
                >
                  <LogOut className="h-4 w-4 shrink-0" />
                  Cerrar sesión
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      )}
      </div>
    </div>
  );
}
