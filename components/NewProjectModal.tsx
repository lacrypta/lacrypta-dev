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
  RefreshCw,
  Check,
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

function parseReadmeDescription(md: string): string {
  const lines = md.split("\n");
  const titleIdx = lines.findIndex(l => /^#\s/.test(l) || /<h1[\s>]/i.test(l));
  if (titleIdx === -1) return "";
  const body: string[] = [];
  for (let i = titleIdx + 1; i < lines.length; i++) {
    if (/^#{2,}\s/.test(lines[i]) || /^---+\s*$/.test(lines[i])) break;
    body.push(lines[i]);
  }
  const descParts: string[] = [];
  for (const para of body.join("\n").split(/\n{2,}/).map(p => p.trim()).filter(Boolean)) {
    if (/^\*\*[^*\n]+\*\*$/.test(para)) continue; // single-line all-bold tagline
    if (/^>\s*\*?\*?(?:⚠|pre-?alpha|wip|warning|note|caution|deprecated)/i.test(para)) continue; // warning blockquote
    if (/^!?\[/.test(para)) continue; // badge / image
    if (/^<[a-z]/i.test(para)) continue; // HTML element
    const text = para
      .replace(/<[^>]+>/g, "")
      .replace(/!?\[(?:[^\]]*)\]\([^)]*\)/g, "")
      .replace(/^>\s*/gm, "")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/&[a-zA-Z0-9]+;/g, " ")
      .replace(/\n/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length > 20) {
      descParts.push(text);
      if (descParts.length >= 2) break;
    }
  }
  return descParts.join(" ").slice(0, 500).trim();
}

function parseReadmeTech(md: string): string[] {
  const sectionRe = /^#{2,3}\s[^\n]*(?:stack|tecnolog[íi]|herramientas?)[^\n]*/im;
  const match = md.match(sectionRe);
  const items: string[] = [];

  if (match?.index !== undefined) {
    const after = md.slice(match.index + match[0].length);
    const nextHeading = after.search(/^#{2,3}\s/m);
    const section = nextHeading === -1 ? after : after.slice(0, nextHeading);

    const bulletRe = /^[-*+]\s+(.+)$/gm;
    let m: RegExpExecArray | null;
    while ((m = bulletRe.exec(section)) !== null) {
      const raw = m[1].trim();
      // Bold prefix is the tech name: **TypeScript** [v5.0+](url) — desc
      const boldMatch = raw.match(/^\*\*([^*]+)\*\*/);
      if (boldMatch) {
        const name = boldMatch[1].trim();
        if (name.length > 1 && name.length < 40) items.push(name);
        continue;
      }
      // Leading markdown link: [Radix UI](url) — desc
      const linkMatch = raw.match(/^\[([^\]]+)\]\([^)]+\)/);
      if (linkMatch) {
        const name = linkMatch[1].trim();
        if (name.length > 1 && name.length < 40) items.push(name);
        continue;
      }
      for (const part of raw.split(/\s*\+\s*/)) {
        const item = part
          .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
          .replace(/\s*\([^)]+\)/g, "")
          .replace(/<[^>]+>/g, "")
          .replace(/[`*]/g, "")
          .split(/\s+[—–-]\s+/)[0]
          .trim();
        if (item.length > 1 && item.length < 40) items.push(item);
      }
    }

    if (items.length === 0) {
      const tableRe = /^\|[^|\n]+\|([^|\n]+)\|/gm;
      while ((m = tableRe.exec(section)) !== null) {
        const cell = m[1].trim().replace(/\*\*/g, "");
        if (/^[-:\s]+$/.test(cell)) continue;
        if (/^(?:technology|tecnolog[íi]a|herramienta|tool|layer|capa|component)s?$/i.test(cell)) continue;
        for (const part of cell.split(/\s*[,+]\s*/)) {
          const item = part
            .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
            .replace(/\s*\([^)]+\)/g, "")
            .replace(/<[^>]+>/g, "")
            .replace(/[`*]/g, "")
            .split(/\s+[—–-]\s+/)[0]
            .trim();
          if (item.length > 1 && item.length < 40) items.push(item);
        }
      }
    }
  }

  if (items.length === 0) {
    const inlineMatch = md.match(/\*\*(?:tech\s+)?stack[^*]*\*\*\s*:?\s*(.+)/i);
    if (inlineMatch) {
      for (const part of inlineMatch[1].split(/\s*[·•,+/]\s*/)) {
        const item = part
          .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
          .replace(/\s*\([^)]+\)/g, "")
          .replace(/[`*]/g, "")
          .split(/\s+[—–-]\s+/)[0]
          .trim();
        if (item.length > 1 && item.length < 40) items.push(item);
      }
    }
  }

  // Filter out version strings, bracket artifacts, and prose fragments
  const validated = items.filter(item =>
    !/^v?\d/.test(item) && !/^[—–\[]/.test(item) && item.split(/\s+/).length <= 4
  );

  return [...new Set(validated)].slice(0, 8);
}

async function fetchGitHubMeta(repoUrl: string): Promise<{
  name: string;
  description: string | null;
  language: string | null;
  topics: string[];
  homepage: string | null;
  readmeDescription: string;
  readmeTech: string[];
}> {
  const m = repoUrl.match(/github\.com\/([^/]+?)\/([^/?#]+?)(?:\.git)?\/?(?:[?#].*)?$/);
  if (!m) throw new Error("URL de GitHub inválida");
  const [, owner, repo] = m;
  const [apiRes, readmeRes] = await Promise.allSettled([
    fetch(`https://api.github.com/repos/${owner}/${repo}`).then(r => {
      if (!r.ok) throw new Error(r.status === 404 ? "Repo no encontrado" : "Error al acceder a GitHub");
      return r.json();
    }),
    fetch(`https://raw.githubusercontent.com/${owner}/${repo}/HEAD/README.md`).then(r => r.ok ? r.text() : null),
  ]);
  if (apiRes.status === "rejected") throw apiRes.reason;
  const api = apiRes.value;
  const readme = readmeRes.status === "fulfilled" ? readmeRes.value : null;
  return {
    name: api.name,
    description: api.description,
    language: api.language,
    topics: api.topics ?? [],
    homepage: api.homepage,
    readmeDescription: readme ? parseReadmeDescription(readme) : "",
    readmeTech: readme ? parseReadmeTech(readme) : [],
  };
}

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
  const [step, setStep] = useState<"repo" | "fetching" | "form">("repo");
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [optimisticClosed, setOptimisticClosed] = useState(false);
  const [phase, setPhase] = useState<Phase | null>(null);
  const [phaseDetail, setPhaseDetail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [relayResults, setRelayResults] = useState<{ relay: string; ok: boolean; error?: string }[]>([]);

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
      setStep("repo");
      setFetchError(null);
      setOptimisticClosed(false);
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
    setRelayResults([]);

    let signer: Awaited<ReturnType<typeof getSigner>> | null = null;
    try {
      signer = await getSigner(auth, {
        onAuthUrl: (url) => {
          pushToast({ kind: "info", title: "Autorizá la firma en tu bunker", description: url, duration: 20000 });
          try { window.open(url, "_blank", "noopener,noreferrer"); } catch { /* popup blocked */ }
        },
      });
      setPhase("publishing");
      setOptimisticClosed(true);
      const result = await publishUserProject(signer, project, relays, {
        onRelayResult: (r) => setRelayResults((prev) => [...prev, r]),
      });
      const okCount = result.relays.filter((r) => r.ok).length;
      setPhase("done");
      pushToast({ kind: "success", title: "Proyecto creado", description: `Publicado en ${okCount}/${result.relays.length} relays.` });
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setOptimisticClosed(false);
      setError(msg);
      pushToast({ kind: "error", title: "No se pudo crear el proyecto", description: msg, duration: 12000 });
    } finally {
      signer?.close?.().catch(() => {});
      setPublishing(false);
      setTimeout(() => { setPhase(null); setPhaseDetail(null); setRelayResults([]); }, 2000);
    }
  }

  const phaseLabel =
    phase === "signing" ? "Esperando firma…"
    : phase === "publishing" ? "Publicando…"
    : phase === "done" ? "Publicado"
    : "Procesando…";

  async function handleFetch() {
    setFetchError(null);
    setStep("fetching");
    try {
      const meta = await fetchGitHubMeta(form.repo.trim());
      setForm((f) => ({
        ...f,
        name: meta.name.replace(/-/g, " "),
        description: meta.readmeDescription || meta.description || "",
        demo: meta.homepage ?? "",
        tech: meta.readmeTech.length > 0
          ? meta.readmeTech
          : [...(meta.language ? [meta.language] : []), ...(meta.topics ?? [])].slice(0, 8),
      }));
      setStep("form");
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Error al obtener datos");
      setStep("repo");
    }
  }

  return (
    <>
    <AnimatePresence>
      {open && !optimisticClosed && (
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
            onClick={() => !publishing && step !== "fetching" && onClose()}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
          />
          <motion.form
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative w-full max-w-lg glass-strong rounded-2xl border border-border-strong overflow-hidden"
            onSubmit={(e) => {
              e.preventDefault();
              if (step === "repo") handleFetch();
              else if (step === "form") handleSave();
            }}
          >
            <div className="absolute -top-px left-1/2 -translate-x-1/2 w-[40%] h-px bg-gradient-to-r from-transparent via-bitcoin to-transparent" />

            <div className="relative px-6 pt-6 pb-5 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="font-display font-bold text-xl">Nuevo proyecto</h2>
                <p className="text-xs text-foreground-muted mt-0.5">
                  Se firma con tu clave y se publica en los relays.
                </p>
              </div>
              <div className="flex items-center gap-3">
                {step !== "fetching" && (
                  <span className="text-[10px] font-mono text-foreground-subtle">
                    {step === "repo" ? "1" : "2"} / 2
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => !publishing && step !== "fetching" && onClose()}
                  disabled={publishing || step === "fetching"}
                  className="p-2 rounded-lg text-foreground-muted hover:text-foreground hover:bg-white/5 transition-colors disabled:opacity-50"
                  aria-label="Cerrar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {step === "fetching" ? (
              <div className="relative px-6 py-16 flex flex-col items-center justify-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-bitcoin" />
                <p className="text-sm text-foreground-muted">Cargando datos del repo…</p>
              </div>
            ) : step === "repo" ? (
              <div className="relative px-6 py-5 space-y-4">
                <p className="text-sm text-foreground-muted">
                  Ingresá la URL del repositorio en GitHub para autocompletar nombre, descripción y stack.
                </p>
                {fetchError && (
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-danger/10 border border-danger/30 text-sm text-danger">
                    <X className="h-4 w-4 shrink-0" />
                    {fetchError}
                  </div>
                )}
                <Field label="Repositorio de GitHub">
                  <input
                    type="url"
                    autoFocus
                    value={form.repo}
                    onChange={(e) => setForm({ ...form, repo: e.target.value })}
                    placeholder="https://github.com/owner/repo"
                    className="w-full px-3 py-2.5 rounded-lg bg-white/[0.03] border border-border focus:border-bitcoin/50 focus:bg-white/[0.05] transition-colors text-sm font-mono placeholder:text-foreground-subtle"
                  />
                </Field>
              </div>
            ) : (
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
                  <Field
                    label="Repositorio"
                    action={
                      <button
                        type="button"
                        onClick={handleFetch}
                        disabled={publishing || !form.repo.trim()}
                        title="Recargar desde GitHub"
                        className="p-0.5 rounded text-foreground-subtle hover:text-bitcoin disabled:opacity-40 transition-colors"
                      >
                        <RefreshCw className="h-3 w-3" />
                      </button>
                    }
                  >
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
                <button
                  type="button"
                  onClick={() => { setStep("repo"); setFetchError(null); }}
                  className="text-[11px] text-foreground-subtle hover:text-foreground-muted transition-colors"
                >
                  ← Cambiar repositorio
                </button>
              </div>
            )}

            <div className="relative px-6 py-4 bg-black/30 border-t border-border flex items-center justify-end gap-3">
              {step === "fetching" ? null : step === "repo" ? (
                <>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-lg text-sm font-semibold text-foreground-muted hover:text-foreground hover:bg-white/5 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={!form.repo.trim()}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-bitcoin to-yellow-500 text-black disabled:opacity-50"
                  >
                    Siguiente →
                  </button>
                </>
              ) : (
                <>
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
                </>
              )}
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
    <AnimatePresence>
      {phase && (
        <RelayPublishProgress relays={relays} results={relayResults} phase={phase} />
      )}
    </AnimatePresence>
    </>
  );
}

/* ──────────────────────────────── RelayPublishProgress ──────────────────────── */

function RelayPublishProgress({
  relays,
  results,
  phase,
}: {
  relays: string[];
  results: { relay: string; ok: boolean; error?: string }[];
  phase: "signing" | "publishing" | "done";
}) {
  const done = results.length;
  const total = relays.length;
  const progress = total > 0 ? done / total : 0;
  const hasError = results.some((r) => !r.ok);
  const radius = 18;
  const circumference = 2 * Math.PI * radius;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.92 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="fixed bottom-6 left-6 z-[200] glass-strong border border-border-strong rounded-2xl p-4 shadow-2xl shadow-black/40 w-72"
    >
      <div className="flex items-start gap-3.5">
        <div className="relative w-12 h-12 shrink-0">
          <svg viewBox="0 0 44 44" className="w-12 h-12 -rotate-90">
            <circle cx="22" cy="22" r={radius} fill="none" strokeWidth="3.5" className="stroke-white/10" />
            <motion.circle
              cx="22" cy="22" r={radius}
              fill="none" strokeWidth="3.5" strokeLinecap="round"
              strokeDasharray={circumference}
              className={hasError ? "stroke-danger" : "stroke-bitcoin"}
              animate={{ strokeDashoffset: circumference * (1 - progress) }}
              initial={{ strokeDashoffset: circumference }}
              transition={{ duration: 0.35, ease: "easeOut" }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            {phase === "signing" ? (
              <Loader2 className="h-4 w-4 animate-spin text-foreground-muted" />
            ) : phase === "done" && !hasError ? (
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 320, damping: 14 }}>
                <Check className="h-4 w-4 text-bitcoin" />
              </motion.div>
            ) : (
              <span className="text-[11px] font-mono font-bold text-foreground">{done}/{total}</span>
            )}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-foreground mb-2.5">
            {phase === "signing" ? "Firmando…" : phase === "done" ? (hasError ? `${done}/${total} relays` : "Publicado") : "Publicando…"}
          </div>
          <div className="space-y-1.5">
            {relays.map((relay) => {
              const result = results.find((r) => r.relay === relay);
              const name = relay.replace("wss://", "").split("/")[0];
              return (
                <div key={relay} className="flex items-center gap-2">
                  <motion.div
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    animate={{
                      backgroundColor: !result ? "rgba(255,255,255,0.15)" : result.ok ? "#f7931a" : "#ef4444",
                      scale: result ? [1, 1.5, 1] : 1,
                    }}
                    transition={{ duration: 0.25 }}
                  />
                  <span className={cn("text-[10px] font-mono flex-1 truncate transition-colors duration-300",
                    !result ? "text-foreground-subtle" : result.ok ? "text-foreground" : "text-danger")}>
                    {name}
                  </span>
                  <AnimatePresence>
                    {result && (
                      <motion.span initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.2 }}
                        className={cn("text-[10px] font-mono shrink-0", result.ok ? "text-bitcoin" : "text-danger")}>
                        {result.ok ? "✓" : "✗"}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ──────────────────────────────────── Field ──────────────────────────────────── */

function Field({ label, hint, required, action, children }: { label: string; hint?: string; required?: boolean; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="flex items-center justify-between text-xs font-medium text-foreground-muted mb-1.5">
        <span>{label}{required && <span className="text-danger ml-0.5">*</span>}</span>
        <span className="flex items-center gap-1.5">
          {hint && <span className="text-[10px] text-foreground-subtle">{hint}</span>}
          {action}
        </span>
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
