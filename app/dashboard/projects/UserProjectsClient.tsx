"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Plus,
  Loader2,
  Edit2,
  Trash2,
  ExternalLink,
  X,
  Check,
  FolderGit2,
  Globe,
  Calendar,
  Save,
} from "lucide-react";
import { GithubIcon } from "@/components/BrandIcons";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/lib/auth";
import { useScrollLock } from "@/lib/useScrollLock";
import { getSigner } from "@/lib/nostrSigner";
import {
  DEFAULT_USER_RELAYS,
  deleteUserProject,
  fetchUserProjects,
  getCachedUserProjects,
  publishUserProject,
  type ProjectsDoc,
  type UserProject,
} from "@/lib/userProjects";

type RelayResult = { relay: string; ok: boolean; error?: string };
type Phase = "signing" | "publishing" | "done";
import { cn } from "@/lib/cn";

type FormState = {
  id: string | null;
  name: string;
  description: string;
  url: string;
  repo: string;
  tags: string;
};

const EMPTY_FORM: FormState = {
  id: null,
  name: "",
  description: "",
  url: "",
  repo: "",
  tags: "",
};

export default function UserProjectsClient() {
  const router = useRouter();
  const { auth, ready } = useAuth();
  const { push: pushToast } = useToast();

  const [doc, setDoc] = useState<ProjectsDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorRelays, setErrorRelays] = useState<RelayResult[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [phase, setPhase] = useState<Phase | null>(null);
  const [phaseDetail, setPhaseDetail] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const relays = useMemo(() => {
    const out = new Set<string>(DEFAULT_USER_RELAYS);
    auth?.bunker?.relays?.forEach((r) => out.add(r));
    return [...out];
  }, [auth]);

  useEffect(() => {
    if (!ready) return;
    if (!auth) {
      router.replace("/");
    }
  }, [ready, auth, router]);

  useEffect(() => {
    if (!auth) return;

    // Hydrate from cache synchronously — no flicker, no loading state.
    const cached = getCachedUserProjects(auth.pubkey);
    if (cached) {
      setDoc(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }

    // Background refresh against relays; only updates UI if a newer event arrives.
    let cancelled = false;
    setRefreshing(true);
    setError(null);
    fetchUserProjects(auth.pubkey, relays)
      .then((fresh) => {
        if (cancelled) return;
        setDoc((prev) => {
          if (!prev) return fresh;
          // Merge: if relays have a newer per-project event, take it;
          // otherwise keep the local one (which may be the freshly edited one).
          const byId = new Map<string, UserProject>(
            prev.projects.map((p) => [p.id, p]),
          );
          for (const f of fresh.projects) {
            const local = byId.get(f.id);
            if (!local || f.updatedAt > local.updatedAt) {
              byId.set(f.id, f);
            }
          }
          // Drop local-only projects that don't appear in relays — unless they
          // were created very recently (in the last 60s) and might not have
          // propagated yet.
          const threshold = Math.floor(Date.now() / 1000) - 60;
          const merged = [...byId.values()].filter((p) => {
            const inFresh = fresh.projects.some((f) => f.id === p.id);
            return inFresh || p.updatedAt > threshold;
          });
          merged.sort((a, b) => b.updatedAt - a.updatedAt);
          return { projects: merged };
        });
      })
      .catch((e) => {
        if (cancelled) return;
        const msg =
          e instanceof Error ? e.message : "Error al cargar proyectos";
        console.warn("[labs] background refresh failed", msg);
        // Don't clobber cache on background-refresh errors — just toast if
        // we have nothing to show.
        if (!cached) {
          setError(msg);
          pushToast({
            kind: "error",
            title: "No se pudieron cargar los proyectos",
            description: msg,
          });
        }
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        setRefreshing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [auth, relays]);

  async function runSignerOp<T>(
    successTitle: string,
    errorTitle: string,
    op: (signer: Awaited<ReturnType<typeof getSigner>>) => Promise<T & {
      relays: RelayResult[];
    }>,
  ): Promise<T> {
    if (!auth) throw new Error("No auth");
    setPublishing(true);
    setError(null);
    setErrorRelays([]);
    setPhase("signing");
    setPhaseDetail(null);

    let signer: Awaited<ReturnType<typeof getSigner>> | null = null;
    try {
      signer = await getSigner(auth, {
        onAuthUrl: (url) => {
          pushToast({
            kind: "info",
            title: "Autorizá la firma en tu bunker",
            description: url,
            duration: 20000,
          });
          try {
            window.open(url, "_blank", "noopener,noreferrer");
          } catch {
            /* popup blocked */
          }
        },
      });
      setPhase("publishing");
      setPhaseDetail(`${relays.length} relays`);
      const result = await op(signer);
      const okCount = result.relays.filter((r) => r.ok).length;
      setPhase("done");
      setPhaseDetail(`${okCount}/${result.relays.length} relays`);
      pushToast({
        kind: "success",
        title: successTitle,
        description: `Publicado en ${okCount}/${result.relays.length} relays.`,
      });
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      const rr = (e as Error & { relayResults?: RelayResult[] })?.relayResults;
      if (Array.isArray(rr)) setErrorRelays(rr);
      console.error("[labs] signer op failed", e);
      const desc =
        Array.isArray(rr) && rr.length
          ? rr
              .map(
                (r) =>
                  `${r.ok ? "✓" : "✗"} ${r.relay.replace("wss://", "")}${r.error ? `: ${r.error}` : ""}`,
              )
              .join("\n")
          : msg;
      pushToast({
        kind: "error",
        title: errorTitle,
        description: desc,
        duration: 12000,
      });
      throw e;
    } finally {
      signer?.close?.().catch(() => {});
      setPublishing(false);
      setPhase(null);
      setPhaseDetail(null);
    }
  }

  async function persistProject(project: UserProject) {
    return runSignerOp(
      "Proyecto guardado",
      "No se pudo guardar el proyecto",
      (signer) => publishUserProject(signer, project, relays),
    );
  }

  async function removeProject(id: string) {
    return runSignerOp(
      "Proyecto eliminado",
      "No se pudo eliminar el proyecto",
      (signer) => deleteUserProject(signer, id, relays),
    );
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }

  function openEdit(p: UserProject) {
    setForm({
      id: p.id,
      name: p.name,
      description: p.description ?? "",
      url: p.url ?? "",
      repo: p.repo ?? "",
      tags: (p.tags ?? []).join(", "),
    });
    setFormOpen(true);
  }

  async function handleSave() {
    if (!doc || !auth) return;
    const now = Math.floor(Date.now() / 1000);
    const clean = (s: string) => s.trim();
    const tags = clean(form.tags)
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const base: UserProject = {
      id: form.id ?? crypto.randomUUID(),
      name: clean(form.name),
      description: clean(form.description) || undefined,
      url: clean(form.url) || undefined,
      repo: clean(form.repo) || undefined,
      tags: tags.length ? tags : undefined,
      createdAt: form.id
        ? (doc.projects.find((p) => p.id === form.id)?.createdAt ?? now)
        : now,
      updatedAt: now,
    };

    if (!base.name) {
      setError("El nombre es obligatorio");
      return;
    }

    try {
      await persistProject(base);
      // Replace the project in-place (or prepend if new) — only after the
      // relay accepted the event, so the UI reflects published state.
      setDoc((prev) => {
        const list = prev?.projects ?? [];
        const next = form.id
          ? list.map((p) => (p.id === form.id ? base : p))
          : [base, ...list];
        return { projects: next };
      });
      setFormOpen(false);
      setForm(EMPTY_FORM);
    } catch {
      /* persistProject already surfaced the error */
    }
  }

  async function handleDelete(id: string) {
    if (!doc) return;
    try {
      await removeProject(id);
      setDoc((prev) => ({
        projects: (prev?.projects ?? []).filter((p) => p.id !== id),
      }));
      setDeleteId(null);
    } catch {
      /* noop */
    }
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-foreground-muted" />
      </div>
    );
  }

  if (!auth) return null;

  const projects = doc?.projects ?? [];

  return (
    <div className="relative min-h-screen pt-28 pb-20">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground-muted hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al dashboard
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full border border-border bg-white/5 text-[10px] font-mono tracking-widest text-foreground-muted mb-3">
              <FolderGit2 className="h-3 w-3" />
              NIP-78 · KIND 30078
            </div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
              Mis proyectos
            </h1>
            <p className="mt-2 text-sm text-foreground-muted max-w-xl">
              Firmados con tu clave Nostr y guardados en un evento replaceable
              sobre {relays.length} relays abiertos. Editá o borrá cuando quieras.
            </p>
            {refreshing && doc && (
              <div className="mt-3 inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-foreground-subtle">
                <Loader2 className="h-3 w-3 animate-spin" />
                sincronizando con relays…
              </div>
            )}
          </div>
          <button
            onClick={openCreate}
            disabled={publishing}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-bitcoin to-yellow-500 text-black font-semibold text-sm shadow-lg shadow-bitcoin/20 hover:shadow-bitcoin/40 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-progress"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            Nuevo proyecto
          </button>
        </div>

        {error && (
          <div className="mb-6 rounded-xl bg-danger/10 border border-danger/30 overflow-hidden">
            <div className="px-4 py-3 text-sm text-danger flex items-start gap-2">
              <X className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-0.5 min-w-0">
                <div className="font-semibold">No se pudo guardar</div>
                <div className="text-foreground-muted whitespace-pre-wrap break-words">
                  {error.split("\n")[0]}
                </div>
              </div>
              <button
                onClick={() => {
                  setError(null);
                  setErrorRelays([]);
                }}
                className="text-danger/70 hover:text-danger shrink-0"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {errorRelays.length > 0 && (
              <div className="border-t border-danger/20 bg-black/20 px-4 py-3 space-y-1">
                <div className="text-[10px] font-mono uppercase tracking-widest text-foreground-subtle mb-2">
                  Relays
                </div>
                {errorRelays.map((r) => (
                  <div
                    key={r.relay}
                    className="flex items-start gap-2 text-xs font-mono"
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full shrink-0 mt-1.5",
                        r.ok ? "bg-success" : "bg-danger",
                      )}
                    />
                    <span className="text-foreground-muted truncate">
                      {r.relay.replace("wss://", "")}
                    </span>
                    {!r.ok && r.error && (
                      <span className="text-danger/80 flex-1 truncate">
                        — {r.error}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {loading && projects.length === 0 ? (
          <LoadingList />
        ) : projects.length === 0 ? (
          <EmptyState onCreate={openCreate} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <AnimatePresence mode="popLayout">
              {projects.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  onEdit={() => openEdit(p)}
                  onDelete={() => setDeleteId(p.id)}
                  disabled={publishing}
                />
              ))}
            </AnimatePresence>
          </div>
        )}

        {doc && doc.projects.length > 0 && (
          <p className="mt-8 text-[11px] font-mono text-foreground-subtle text-center">
            última actualización ·{" "}
            {new Date(
              Math.max(...doc.projects.map((p) => p.updatedAt)) * 1000,
            ).toLocaleString("es-AR", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        )}
      </div>

      <ProjectFormModal
        open={formOpen}
        form={form}
        setForm={setForm}
        onSave={handleSave}
        onClose={() => {
          setFormOpen(false);
          setForm(EMPTY_FORM);
        }}
        publishing={publishing}
        phase={phase}
        phaseDetail={phaseDetail}
      />

      <ConfirmDelete
        open={!!deleteId}
        onCancel={() => setDeleteId(null)}
        onConfirm={() => deleteId && handleDelete(deleteId)}
        publishing={publishing}
      />
    </div>
  );
}

function LoadingList() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {[0, 1].map((i) => (
        <div
          key={i}
          className="rounded-2xl border border-border bg-background-card p-6 h-48 shimmer"
        />
      ))}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="text-center py-20 rounded-3xl border border-dashed border-border bg-background-card/50">
      <div className="mx-auto h-12 w-12 rounded-2xl bg-bitcoin/10 border border-bitcoin/30 flex items-center justify-center mb-4">
        <FolderGit2 className="h-5 w-5 text-bitcoin" />
      </div>
      <p className="font-display text-xl font-bold mb-2">
        Todavía no hay proyectos
      </p>
      <p className="text-sm text-foreground-muted max-w-sm mx-auto mb-6">
        Creá tu primer proyecto. Se firma con tu clave y queda guardado en
        relays públicos — podés editarlo cuando quieras.
      </p>
      <button
        onClick={onCreate}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-bitcoin to-yellow-500 text-black font-semibold text-sm"
      >
        <Plus className="h-4 w-4" strokeWidth={2.5} />
        Crear el primero
      </button>
    </div>
  );
}

function ProjectCard({
  project,
  onEdit,
  onDelete,
  disabled,
}: {
  project: UserProject;
  onEdit: () => void;
  onDelete: () => void;
  disabled: boolean;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.25 }}
      className="group relative rounded-2xl border border-border bg-background-card p-6 flex flex-col hover:border-border-strong transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-lg font-bold tracking-tight flex-1 min-w-0 break-words">
          {project.name}
        </h3>
        <div className="flex items-center gap-1 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onEdit}
            disabled={disabled}
            className="p-1.5 rounded-lg hover:bg-white/10 text-foreground-muted hover:text-foreground transition-colors disabled:opacity-50"
            aria-label="Editar"
          >
            <Edit2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDelete}
            disabled={disabled}
            className="p-1.5 rounded-lg hover:bg-danger/10 text-foreground-muted hover:text-danger transition-colors disabled:opacity-50"
            aria-label="Borrar"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {project.description && (
        <p className="mt-2 text-sm text-foreground-muted leading-relaxed line-clamp-3">
          {project.description}
        </p>
      )}

      {project.tags && project.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {project.tags.map((t) => (
            <span
              key={t}
              className="px-1.5 py-0.5 rounded-md border border-border bg-white/[0.03] text-[10px] font-mono uppercase tracking-wider text-foreground-muted"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      <div className="mt-auto pt-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-xs text-foreground-muted">
          {project.repo && (
            <a
              href={project.repo}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
            >
              <GithubIcon className="h-3.5 w-3.5" />
              Repo
            </a>
          )}
          {project.url && (
            <a
              href={project.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
            >
              <Globe className="h-3.5 w-3.5" />
              Sitio
            </a>
          )}
        </div>
        <div className="inline-flex items-center gap-1 text-[10px] font-mono text-foreground-subtle">
          <Calendar className="h-3 w-3" />
          {new Date(project.updatedAt * 1000).toLocaleDateString("es-AR", {
            day: "2-digit",
            month: "short",
          })}
        </div>
      </div>
    </motion.div>
  );
}

function ProjectFormModal({
  open,
  form,
  setForm,
  onSave,
  onClose,
  publishing,
  phase,
  phaseDetail,
}: {
  open: boolean;
  form: FormState;
  setForm: (f: FormState) => void;
  onSave: () => void;
  onClose: () => void;
  publishing: boolean;
  phase: Phase | null;
  phaseDetail: string | null;
}) {
  const phaseLabel =
    phase === "signing"
      ? "Esperando firma…"
      : phase === "publishing"
        ? `Publicando${phaseDetail ? ` en ${phaseDetail}` : "…"}`
        : phase === "done"
          ? `Publicado ${phaseDetail ?? ""}`
          : "Procesando…";
  useScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !publishing) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, publishing]);

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
            onSubmit={(e) => {
              e.preventDefault();
              onSave();
            }}
          >
            <div className="absolute -top-px left-1/2 -translate-x-1/2 w-[40%] h-px bg-gradient-to-r from-transparent via-bitcoin to-transparent" />

            <div className="relative px-6 pt-6 pb-5 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="font-display font-bold text-xl">
                  {form.id ? "Editar proyecto" : "Nuevo proyecto"}
                </h2>
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
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
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
                <Field label="Sitio">
                  <input
                    type="url"
                    value={form.url}
                    onChange={(e) => setForm({ ...form, url: e.target.value })}
                    disabled={publishing}
                    placeholder="https://..."
                    className="w-full px-3 py-2.5 rounded-lg bg-white/[0.03] border border-border focus:border-bitcoin/50 focus:bg-white/[0.05] transition-colors text-sm font-mono placeholder:text-foreground-subtle"
                  />
                </Field>
              </div>
              <Field label="Tags" hint="separados por coma">
                <input
                  type="text"
                  value={form.tags}
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
                  disabled={publishing}
                  placeholder="bitcoin, lightning, nostr"
                  className="w-full px-3 py-2.5 rounded-lg bg-white/[0.03] border border-border focus:border-bitcoin/50 focus:bg-white/[0.05] transition-colors text-sm placeholder:text-foreground-subtle"
                />
              </Field>
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
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {phaseLabel}
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    {form.id ? "Guardar" : "Crear"}
                  </>
                )}
              </button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="flex items-center justify-between text-xs font-medium text-foreground-muted mb-1.5">
        <span>
          {label}
          {required && <span className="text-danger ml-0.5">*</span>}
        </span>
        {hint && (
          <span className="text-[10px] text-foreground-subtle">{hint}</span>
        )}
      </span>
      {children}
    </label>
  );
}

function ConfirmDelete({
  open,
  onCancel,
  onConfirm,
  publishing,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  publishing: boolean;
}) {
  useScrollLock(open);
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
            onClick={() => !publishing && onCancel()}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative w-full max-w-sm glass-strong rounded-2xl border border-border-strong p-6 text-center"
          >
            <div className="mx-auto h-12 w-12 rounded-full bg-danger/15 border border-danger/30 flex items-center justify-center mb-4">
              <Trash2 className="h-5 w-5 text-danger" />
            </div>
            <h3 className="font-display font-bold text-lg mb-1">
              ¿Borrar proyecto?
            </h3>
            <p className="text-sm text-foreground-muted mb-5">
              Esto reemplaza el evento en los relays. Podés volver a crearlo
              después.
            </p>
            <div className="flex gap-3">
              <button
                onClick={onCancel}
                disabled={publishing}
                className="flex-1 px-4 py-2.5 rounded-lg border border-border hover:bg-white/5 text-sm font-semibold transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={onConfirm}
                disabled={publishing}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-danger text-white text-sm font-semibold hover:bg-danger/90 transition-colors disabled:opacity-50 disabled:cursor-progress"
              >
                {publishing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Borrando…
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    Borrar
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
