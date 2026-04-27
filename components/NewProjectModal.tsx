"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Loader2,
  Plus,
  Save,
  X,
  BadgeCheck,
  AlertCircle,
} from "lucide-react";
import { NIP05_REGEX, queryProfile } from "nostr-tools/nip05";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/lib/auth";
import { useScrollLock } from "@/lib/useScrollLock";
import { getSigner } from "@/lib/nostrSigner";
import {
  DEFAULT_USER_RELAYS,
  publishUserProject,
  type TeamMember,
  type UserProject,
} from "@/lib/userProjects";
import { HACKATHONS } from "@/lib/hackathons";
import { useNostrProfile } from "@/lib/nostrProfile";
import { cn } from "@/lib/cn";

type Phase = "signing" | "publishing" | "done";

type TeamRow = {
  key: string;
  nip05: string;
  pubkey?: string;
  name?: string;
  picture?: string;
  owner?: boolean;
  role: string;
};

type FormState = {
  name: string;
  description: string;
  demo: string;
  repo: string;
  tech: string[];
  team: TeamRow[];
  hackathon: string;
};

function newRowKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

const STACK_SUGGESTIONS = [
  "Nostr","NIP-01","NIP-04","NIP-05","NIP-07","NIP-19","NIP-42","NIP-44","NIP-46","NIP-57","NIP-58","NIP-65","NIP-78","nostr-tools","NDK","Bunker",
  "Bitcoin","Lightning","LNURL","LNURL-Pay","LNURL-Auth","BOLT-11","BOLT-12","LND","Core Lightning","LDK","BDK","LNbits","NWC","Taproot","Cashu","Fedimint",
  "React","Next.js","React Native","Vue","Svelte","SvelteKit","Remix","Astro","Tailwind","TypeScript","JavaScript","Rust","Go","Python","Node.js","Bun",
  "IPFS","PostgreSQL","SQLite","Redis","Supabase","Vercel","Fly.io","Cloudflare Workers",
];

export default function NewProjectModal({
  hackathonId,
  open,
  onClose,
}: {
  hackathonId?: string;
  open: boolean;
  onClose: () => void;
}) {
  const { auth } = useAuth();
  const { push: pushToast } = useToast();
  const { profile: ownerProfile } = useNostrProfile(auth?.pubkey);

  const [form, setForm] = useState<FormState>({
    name: "", description: "", demo: "", repo: "", tech: [], team: [], hackathon: hackathonId ?? "",
  });
  const [publishing, setPublishing] = useState(false);
  const [phase, setPhase] = useState<Phase | null>(null);
  const [phaseDetail, setPhaseDetail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const relays = useMemo(() => {
    const out = new Set<string>(DEFAULT_USER_RELAYS);
    auth?.bunker?.relays?.forEach((r) => out.add(r));
    return [...out];
  }, [auth]);

  const ownerRow = useCallback((): TeamRow => ({
    key: newRowKey(),
    nip05: ownerProfile?.nip05 ?? "",
    pubkey: auth?.pubkey,
    name: ownerProfile?.display_name || ownerProfile?.name || (auth?.pubkey ? `${auth.pubkey.slice(0, 8)}…` : ""),
    picture: ownerProfile?.picture,
    owner: true,
    role: "Lead",
  }), [auth?.pubkey, ownerProfile]);

  useEffect(() => {
    if (open) {
      setForm({ name: "", description: "", demo: "", repo: "", tech: [], team: [ownerRow()], hackathon: hackathonId ?? "" });
      setError(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Backfill owner row when profile loads after modal opens
  useEffect(() => {
    if (!open) return;
    setForm((prev) => {
      const first = prev.team[0];
      if (!first?.owner) return prev;
      if (first.picture && first.nip05) return prev;
      const seeded = ownerRow();
      const next = [...prev.team];
      next[0] = { ...first, ...seeded, key: first.key };
      return { ...prev, team: next };
    });
  }, [ownerRow, open]);

  useScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !publishing) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, publishing]);

  async function handleSave() {
    if (!auth) return;
    setError(null);
    const name = form.name.trim();
    if (!name) { setError("El nombre es obligatorio"); return; }

    const now = Math.floor(Date.now() / 1000);
    const today = new Date().toISOString().slice(0, 10);

    const team: TeamMember[] = form.team
      .map((row) => {
        const nip05 = row.nip05.trim();
        const nm = (row.name?.trim() ?? "") || (nip05 ? nip05.split("@")[0] : "") || (row.pubkey ? `${row.pubkey.slice(0, 8)}…` : "");
        return { name: nm, role: row.role.trim() || "Builder", nip05: nip05 || undefined, pubkey: row.pubkey, picture: row.picture };
      })
      .filter((m) => m.name.length > 0 || m.nip05 || m.pubkey);

    const hackathon = form.hackathon.trim() || null;
    const project: UserProject = {
      id: crypto.randomUUID(),
      name,
      description: form.description.trim(),
      team,
      repo: form.repo.trim() || undefined,
      demo: form.demo.trim() || undefined,
      tech: form.tech.length ? form.tech : undefined,
      status: hackathon ? "submitted" : "building",
      hackathon,
      submittedAt: hackathon ? today : undefined,
      createdAt: now,
      updatedAt: now,
    };

    setPublishing(true);
    setPhase("signing");
    setPhaseDetail(null);

    let signer: Awaited<ReturnType<typeof getSigner>> | null = null;
    try {
      signer = await getSigner(auth, {
        onAuthUrl: (url) => {
          pushToast({ kind: "info", title: "Autorizá la firma en tu bunker", description: url, duration: 20000 });
          try { window.open(url, "_blank", "noopener,noreferrer"); } catch { /* popup blocked */ }
        },
      });
      setPhase("publishing");
      setPhaseDetail(`${relays.length} relays`);
      const result = await publishUserProject(signer, project, relays);
      const okCount = result.relays.filter((r) => r.ok).length;
      setPhase("done");
      setPhaseDetail(`${okCount}/${result.relays.length} relays`);
      pushToast({ kind: "success", title: "Proyecto creado", description: `Publicado en ${okCount}/${result.relays.length} relays.` });
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      pushToast({ kind: "error", title: "No se pudo crear el proyecto", description: msg, duration: 12000 });
    } finally {
      signer?.close?.().catch(() => {});
      setPublishing(false);
      setPhase(null);
      setPhaseDetail(null);
    }
  }

  const phaseLabel =
    phase === "signing" ? "Esperando firma…"
    : phase === "publishing" ? `Publicando${phaseDetail ? ` en ${phaseDetail}` : "…"}`
    : phase === "done" ? `Publicado ${phaseDetail ?? ""}`
    : "Procesando…";

  return (
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
            onClick={() => !publishing && onClose()}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
          />
          <motion.form
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative w-full max-w-lg glass-strong rounded-2xl border border-border-strong overflow-hidden"
            onSubmit={(e) => { e.preventDefault(); handleSave(); }}
          >
            <div className="absolute -top-px left-1/2 -translate-x-1/2 w-[40%] h-px bg-gradient-to-r from-transparent via-bitcoin to-transparent" />

            <div className="relative px-6 pt-6 pb-5 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="font-display font-bold text-xl">Nuevo proyecto</h2>
                <p className="text-xs text-foreground-muted mt-0.5">
                  Se firma con tu clave y se publica en los relays.
                </p>
              </div>
              <button
                type="button"
                onClick={() => !publishing && onClose()}
                disabled={publishing}
                className="p-2 rounded-lg text-foreground-muted hover:text-foreground hover:bg-white/5 transition-colors disabled:opacity-50"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="relative px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
              {error && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-danger/10 border border-danger/30 text-sm text-danger">
                  <X className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}
              <Field label="Nombre" required>
                <input
                  type="text"
                  autoFocus
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  disabled={publishing}
                  placeholder="Mi proyecto genial"
                  className="w-full px-3 py-2.5 rounded-lg bg-white/[0.03] border border-border focus:border-bitcoin/50 focus:bg-white/[0.05] transition-colors text-sm placeholder:text-foreground-subtle"
                />
              </Field>
              <Field label="Descripción">
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  disabled={publishing}
                  rows={3}
                  placeholder="¿Qué hace? ¿Para quién?"
                  className="w-full px-3 py-2.5 rounded-lg bg-white/[0.03] border border-border focus:border-bitcoin/50 focus:bg-white/[0.05] transition-colors text-sm placeholder:text-foreground-subtle resize-none"
                />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Repositorio">
                  <input
                    type="url"
                    value={form.repo}
                    onChange={(e) => setForm({ ...form, repo: e.target.value })}
                    disabled={publishing}
                    placeholder="https://github.com/..."
                    className="w-full px-3 py-2.5 rounded-lg bg-white/[0.03] border border-border focus:border-bitcoin/50 focus:bg-white/[0.05] transition-colors text-sm font-mono placeholder:text-foreground-subtle"
                  />
                </Field>
                <Field label="Demo / Sitio">
                  <input
                    type="url"
                    value={form.demo}
                    onChange={(e) => setForm({ ...form, demo: e.target.value })}
                    disabled={publishing}
                    placeholder="https://..."
                    className="w-full px-3 py-2.5 rounded-lg bg-white/[0.03] border border-border focus:border-bitcoin/50 focus:bg-white/[0.05] transition-colors text-sm font-mono placeholder:text-foreground-subtle"
                  />
                </Field>
              </div>
              <Field label="Stack" hint="enter o coma para sumar">
                <TagsInput
                  value={form.tech}
                  onChange={(tech) => setForm({ ...form, tech })}
                  disabled={publishing}
                  placeholder="Lightning, Nostr, NIP-01…"
                  suggestions={STACK_SUGGESTIONS}
                />
              </Field>
              <Field label="Hackatón" hint={hackathonId ? undefined : "asignalo para que aparezca en /hackathons"}>
                <select
                  value={form.hackathon}
                  onChange={(e) => setForm({ ...form, hackathon: e.target.value })}
                  disabled={publishing || !!hackathonId}
                  className={cn("w-full px-3 py-2.5 rounded-lg bg-white/[0.03] border border-border focus:border-bitcoin/50 focus:bg-white/[0.05] transition-colors text-sm", hackathonId && "opacity-60 cursor-not-allowed")}
                >
                  <option value="">Sin hackatón asignado</option>
                  {HACKATHONS.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.icon} {h.name} · {h.monthShort} {h.year}
                    </option>
                  ))}
                </select>
              </Field>
              <TeamEditor
                team={form.team}
                onChange={(team) => setForm({ ...form, team })}
                disabled={publishing}
              />
            </div>

            <div className="relative px-6 py-4 bg-black/30 border-t border-border flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={publishing}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-foreground-muted hover:text-foreground hover:bg-white/5 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={publishing || !form.name.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-bitcoin to-yellow-500 text-black disabled:opacity-70 disabled:cursor-progress"
              >
                {publishing ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />{phaseLabel}</>
                ) : (
                  <><Save className="h-4 w-4" />Crear</>
                )}
              </button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ──────────────────────────────────── Field ──────────────────────────────────── */

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="flex items-center justify-between text-xs font-medium text-foreground-muted mb-1.5">
        <span>{label}{required && <span className="text-danger ml-0.5">*</span>}</span>
        {hint && <span className="text-[10px] text-foreground-subtle">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

/* ──────────────────────────────────── TagsInput ──────────────────────────────────── */

function TagsInput({ value, onChange, disabled, placeholder, suggestions = [] }: {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
  suggestions?: string[];
}) {
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimer = useRef<number | null>(null);

  const normalized = useMemo(() => new Set(value.map((v) => v.trim().toLowerCase())), [value]);
  const filtered = useMemo(() => {
    const d = draft.trim().toLowerCase();
    return suggestions.filter((s) => !normalized.has(s.toLowerCase())).filter((s) => !d || s.toLowerCase().includes(d)).slice(0, 8);
  }, [suggestions, draft, normalized]);

  function commit(raw: string) {
    const clean = raw.trim().replace(/^,+|,+$/g, "").trim();
    if (!clean || normalized.has(clean.toLowerCase())) { setDraft(""); return; }
    onChange([...value, clean]);
    setDraft("");
    setActiveIdx(-1);
  }

  function remove(index: number) { onChange(value.filter((_, i) => i !== index)); }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const live = e.currentTarget.value;
    if (e.key === "Enter") {
      e.preventDefault();
      if (activeIdx >= 0 && filtered[activeIdx]) commit(filtered[activeIdx]);
      else if (live.trim()) commit(live);
    } else if (e.key === ",") {
      e.preventDefault();
      if (live.trim()) commit(live);
    } else if (e.key === "Backspace" && !live && value.length > 0) {
      e.preventDefault();
      remove(value.length - 1);
    } else if (e.key === "ArrowDown" && filtered.length > 0) {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % filtered.length);
    } else if (e.key === "ArrowUp" && filtered.length > 0) {
      e.preventDefault();
      setActiveIdx((i) => (i <= 0 ? filtered.length - 1 : i - 1));
    } else if (e.key === "Escape") {
      setActiveIdx(-1);
      inputRef.current?.blur();
    }
  }

  return (
    <div className="relative">
      <div
        onClick={() => !disabled && inputRef.current?.focus()}
        className={cn("flex flex-wrap items-center gap-1.5 min-h-[42px] px-2 py-1.5 rounded-lg bg-white/[0.03] border transition-colors cursor-text",
          focused && !disabled ? "border-bitcoin/50 bg-white/[0.05]" : "border-border",
          disabled && "opacity-60 cursor-not-allowed")}
      >
        {value.map((tag, i) => (
          <span key={`${tag}-${i}`} className="inline-flex items-center gap-0.5 pl-2 pr-0.5 py-0.5 rounded-md border border-bitcoin/30 bg-bitcoin/10 text-[11px] font-mono text-bitcoin">
            {tag}
            <button type="button" disabled={disabled} onClick={(e) => { e.stopPropagation(); remove(i); }} className="p-0.5 rounded hover:bg-bitcoin/20 disabled:opacity-50" aria-label={`Quitar ${tag}`}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setActiveIdx(-1); }}
          onKeyDown={onKeyDown}
          onFocus={() => { if (blurTimer.current) { window.clearTimeout(blurTimer.current); blurTimer.current = null; } setFocused(true); }}
          onBlur={() => { blurTimer.current = window.setTimeout(() => { setFocused(false); if (draft.trim()) commit(draft); }, 120); }}
          disabled={disabled}
          placeholder={value.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[80px] bg-transparent text-sm placeholder:text-foreground-subtle focus:outline-none py-0.5"
        />
      </div>
      {focused && filtered.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-10 rounded-lg border border-border bg-background-card shadow-xl overflow-hidden max-h-60 overflow-y-auto">
          {filtered.map((s, i) => (
            <button
              type="button"
              key={s}
              onMouseDown={(e) => { e.preventDefault(); commit(s); inputRef.current?.focus(); }}
              onMouseEnter={() => setActiveIdx(i)}
              className={cn("w-full text-left px-3 py-1.5 text-sm font-mono transition-colors", activeIdx === i ? "bg-bitcoin/10 text-bitcoin" : "hover:bg-white/5 text-foreground-muted")}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────── Team editor ──────────────────────────────────── */

function TeamEditor({ team, onChange, disabled }: { team: TeamRow[]; onChange: (t: TeamRow[]) => void; disabled: boolean }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-foreground-muted">Equipo</span>
        <span className="text-[10px] text-foreground-subtle">sumá miembros con su NIP-05</span>
      </div>
      <div className="space-y-2">
        {team.map((row, i) => (
          <TeamRowEditor
            key={row.key}
            row={row}
            disabled={disabled}
            onChange={(patch) => onChange(team.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))}
            onRemove={() => onChange(team.filter((_, idx) => idx !== i))}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...team, { key: newRowKey(), nip05: "", role: "Builder" }])}
        disabled={disabled}
        className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-border bg-white/[0.02] hover:bg-white/[0.05] text-xs font-semibold transition-colors disabled:opacity-50"
      >
        <Plus className="h-3.5 w-3.5" />
        Sumar miembro
      </button>
    </div>
  );
}

type Nip05State = { resolving: boolean; pubkey?: string; error?: string };

function useNip05Resolution(nip05: string | undefined): Nip05State {
  const [state, setState] = useState<Nip05State>({ resolving: false });
  useEffect(() => {
    const value = (nip05 ?? "").trim();
    if (!value) { setState({ resolving: false }); return; }
    if (!NIP05_REGEX.test(value)) { setState({ resolving: false, error: "formato inválido" }); return; }
    let cancelled = false;
    setState({ resolving: true });
    const t = window.setTimeout(async () => {
      try {
        const res = await queryProfile(value);
        if (cancelled) return;
        if (res?.pubkey) setState({ resolving: false, pubkey: res.pubkey });
        else setState({ resolving: false, error: "no encontrado" });
      } catch {
        if (cancelled) return;
        setState({ resolving: false, error: "no se pudo resolver" });
      }
    }, 450);
    return () => { cancelled = true; window.clearTimeout(t); };
  }, [nip05]);
  return state;
}

function TeamRowEditor({ row, disabled, onChange, onRemove }: { row: TeamRow; disabled: boolean; onChange: (p: Partial<TeamRow>) => void; onRemove: () => void }) {
  const resolution = useNip05Resolution(row.owner ? "" : row.nip05);
  const effectivePubkey = row.owner ? row.pubkey : resolution.pubkey;
  const { profile, loading } = useNostrProfile(effectivePubkey);

  useEffect(() => {
    if (row.owner) return;
    if (resolution.pubkey && resolution.pubkey !== row.pubkey) onChange({ pubkey: resolution.pubkey });
    if (!resolution.pubkey && !resolution.resolving && row.pubkey) onChange({ pubkey: undefined, picture: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolution.pubkey, resolution.resolving]);

  useEffect(() => {
    if (!profile) return;
    const patch: Partial<TeamRow> = {};
    const name = profile.display_name || profile.name;
    if (name && name !== row.name) patch.name = name;
    if (profile.picture && profile.picture !== row.picture) patch.picture = profile.picture;
    if (Object.keys(patch).length > 0) onChange(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.name, profile?.display_name, profile?.picture]);

  const busy = resolution.resolving || loading;
  const resolved = !!effectivePubkey && !resolution.error;
  const displayName = row.name || (row.nip05 ? row.nip05.split("@")[0] : "") || (effectivePubkey ? `${effectivePubkey.slice(0, 8)}…` : "");

  return (
    <div>
      <div className="grid grid-cols-[auto_1fr_120px_auto] gap-2 items-center">
        <Avatar picture={row.picture} name={displayName} busy={busy} error={!!resolution.error} />
        <div className="relative min-w-0">
          <input
            type="text"
            value={row.nip05}
            onChange={(e) => onChange({ nip05: e.target.value })}
            disabled={disabled || row.owner}
            placeholder="vos@dominio.com"
            spellCheck={false}
            autoComplete="off"
            className={cn("w-full px-2.5 py-2 pr-7 rounded-lg bg-white/[0.03] border transition-colors text-xs font-mono placeholder:text-foreground-subtle min-w-0",
              resolution.error ? "border-danger/50" : resolved ? "border-success/40" : "border-border focus:border-bitcoin/50",
              row.owner && "bg-white/[0.02] text-foreground-muted")}
          />
          {resolved && !resolution.error && <BadgeCheck className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-success" />}
          {resolution.error && <AlertCircle className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-danger" />}
          {busy && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-foreground-subtle" />}
        </div>
        <input
          type="text"
          value={row.role}
          onChange={(e) => onChange({ role: e.target.value })}
          disabled={disabled}
          placeholder="Rol"
          className="px-2.5 py-2 rounded-lg bg-white/[0.03] border border-border focus:border-bitcoin/50 transition-colors text-xs placeholder:text-foreground-subtle"
        />
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          className="px-2 py-2 rounded-lg text-foreground-subtle hover:text-danger hover:bg-danger/10 disabled:opacity-30 transition-colors"
          aria-label="Quitar miembro"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {(row.name || row.owner || resolution.error) && (
        <div className="mt-1 pl-[calc(28px+0.5rem)] text-[10px] font-mono flex items-center gap-2">
          {row.owner && <span className="inline-flex items-center gap-0.5 text-bitcoin"><BadgeCheck className="h-3 w-3" /> vos</span>}
          {resolution.error ? <span className="text-danger">{resolution.error}</span> : row.name ? <span className="text-foreground-subtle truncate">{row.name}</span> : null}
        </div>
      )}
    </div>
  );
}

function Avatar({ picture, name, busy, error }: { picture?: string; name?: string; busy?: boolean; error?: boolean }) {
  const initial = (name?.trim()?.[0] ?? "?").toUpperCase();
  return (
    <div className={cn("relative h-7 w-7 rounded-full border flex items-center justify-center overflow-hidden shrink-0",
      error ? "border-danger/40 bg-danger/10" : picture ? "border-success/30" : "border-border bg-gradient-to-br from-bitcoin/30 to-nostr/30")}>
      {picture
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={picture} alt={name ?? ""} className="h-full w-full object-cover" />
        : <span className="text-[11px] font-display font-bold text-foreground">{initial}</span>}
      {busy && <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[1px]"><Loader2 className="h-3 w-3 animate-spin text-white" /></div>}
    </div>
  );
}
