"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  UserRound,
  AlertCircle,
  BadgeCheck,
} from "lucide-react";
import { NIP05_REGEX, queryProfile } from "nostr-tools/nip05";
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
  type TeamMember,
  type UserProject,
} from "@/lib/userProjects";
import { HACKATHONS } from "@/lib/hackathons";
import { useNostrProfile } from "@/lib/nostrProfile";

type RelayResult = { relay: string; ok: boolean; error?: string };
type Phase = "signing" | "publishing" | "done";
import { cn } from "@/lib/cn";

type TeamRow = {
  /** stable local id for react keys; doesn't get serialised */
  key: string;
  /** NIP-05 identifier typed by the user (e.g. `kassis@lacrypta.ar`). */
  nip05: string;
  /** hex pubkey — either seeded (owner) or resolved from NIP-05. */
  pubkey?: string;
  /** display name snapshot (from profile, nip05 local part, or legacy value). */
  name?: string;
  /** avatar URL snapshot from profile. */
  picture?: string;
  /** legacy github handle preserved from older entries. */
  github?: string;
  /** whether this row represents the currently-authenticated user. */
  owner?: boolean;
  role: string;
};

type FormState = {
  id: string | null;
  name: string;
  description: string;
  demo: string;
  repo: string;
  tech: string[];
  team: TeamRow[];
  hackathon: string; // "" means no hackathon assigned
  /** preserved submittedAt so ediciones no cambian la fecha original */
  submittedAt?: string;
};

function newRowKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function emptyForm(): FormState {
  return {
    id: null,
    name: "",
    description: "",
    demo: "",
    repo: "",
    tech: [],
    team: [],
    hackathon: "",
  };
}

/** Common stack labels suggested in the autocomplete. Kept intentionally
 *  lacrypta-flavoured: Bitcoin / Lightning / Nostr / NIPs first, then the
 *  usual web and runtime bits people actually use in labs projects. */
const STACK_SUGGESTIONS: string[] = [
  // Nostr
  "Nostr",
  "NIP-01",
  "NIP-04",
  "NIP-05",
  "NIP-07",
  "NIP-09",
  "NIP-19",
  "NIP-42",
  "NIP-44",
  "NIP-46",
  "NIP-57",
  "NIP-58",
  "NIP-65",
  "NIP-78",
  "nostr-tools",
  "NDK",
  "Bunker",
  // Bitcoin / Lightning
  "Bitcoin",
  "Lightning",
  "LNURL",
  "LNURL-Pay",
  "LNURL-Auth",
  "BOLT-11",
  "BOLT-12",
  "LND",
  "Core Lightning",
  "LDK",
  "BDK",
  "LNbits",
  "NWC",
  "Taproot",
  "Miniscript",
  "PSBT",
  "Cashu",
  "Fedimint",
  "Ark",
  "RGB",
  // Frameworks / UI
  "React",
  "Next.js",
  "React Native",
  "Vue",
  "Svelte",
  "SvelteKit",
  "Remix",
  "Astro",
  "Solid",
  "Tailwind",
  "Shadcn",
  "Radix",
  "Framer Motion",
  "Three.js",
  // Langs / Runtimes
  "TypeScript",
  "JavaScript",
  "Rust",
  "Go",
  "Python",
  "Elixir",
  "Node.js",
  "Bun",
  "Deno",
  "Vite",
  // Storage / Infra
  "IPFS",
  "PostgreSQL",
  "SQLite",
  "Redis",
  "Supabase",
  "Vercel",
  "Fly.io",
  "Cloudflare Workers",
  "Railway",
  // Crypto / Misc
  "secp256k1",
  "schnorr",
  "Noble",
  "Zod",
  "tRPC",
  "WebSockets",
  "WASM",
  "Web of Trust",
];

export default function UserProjectsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const [form, setForm] = useState<FormState>(() => emptyForm());
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Profile for the currently-authenticated user — used to pre-fill the
  // owner row in the team editor (avatar + nip05 + display name).
  const { profile: ownerProfile } = useNostrProfile(auth?.pubkey);

  const ownerRow = useCallback((): TeamRow => {
    return {
      key: newRowKey(),
      nip05: ownerProfile?.nip05 ?? "",
      pubkey: auth?.pubkey,
      name:
        ownerProfile?.display_name ||
        ownerProfile?.name ||
        (auth?.pubkey ? `${auth.pubkey.slice(0, 8)}…` : ""),
      picture: ownerProfile?.picture,
      owner: true,
      role: "Lead",
    };
  }, [auth?.pubkey, ownerProfile]);

  // When the profile loads after the form is opened for creation, backfill
  // the owner row so the avatar + nip05 show up without a re-open.
  useEffect(() => {
    if (!formOpen || form.id) return;
    setForm((prev) => {
      const first = prev.team[0];
      if (!first?.owner) return prev;
      const hasPicture = !!first.picture;
      const hasNip05 = !!first.nip05;
      if (hasPicture && hasNip05) return prev;
      const seeded = ownerRow();
      const next = [...prev.team];
      next[0] = { ...first, ...seeded, key: first.key };
      return { ...prev, team: next };
    });
  }, [ownerRow, formOpen, form.id]);

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

  function openCreate(hackathonId?: string) {
    setForm({ ...emptyForm(), hackathon: hackathonId ?? "", team: [ownerRow()] });
    setFormOpen(true);
  }

  // Auto-open create form from ?hackathon=&new=1 query params (e.g. from hackathon inscription button)
  const autoOpenDone = useRef(false);
  useEffect(() => {
    if (autoOpenDone.current) return;
    if (!ready || loading) return;
    if (searchParams.get("new") !== "1") return;
    autoOpenDone.current = true;
    openCreate(searchParams.get("hackathon") ?? undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, loading, searchParams]);

  function openEdit(p: UserProject) {
    const rows: TeamRow[] =
      p.team && p.team.length > 0
        ? p.team.map((m) => ({
            key: newRowKey(),
            nip05: m.nip05 ?? "",
            pubkey: m.pubkey,
            name: m.name,
            picture: m.picture,
            github: m.github,
            owner: !!(auth?.pubkey && m.pubkey === auth.pubkey),
            role: m.role,
          }))
        : [ownerRow()];
    // Make sure the owner is represented — if the saved team doesn't
    // include the signer we prepend a fresh owner row so they can still
    // identify themselves on the next publish.
    if (auth?.pubkey && !rows.some((r) => r.pubkey === auth.pubkey)) {
      rows.unshift(ownerRow());
    }
    setForm({
      id: p.id,
      name: p.name,
      description: p.description ?? "",
      demo: p.demo ?? "",
      repo: p.repo ?? "",
      tech: p.tech ?? [],
      team: rows,
      hackathon: p.hackathon ?? "",
      submittedAt: p.submittedAt,
    });
    setFormOpen(true);
  }

  async function handleSave() {
    if (!doc || !auth) return;
    const now = Math.floor(Date.now() / 1000);
    const today = new Date().toISOString().slice(0, 10);
    const clean = (s: string) => s.trim();
    const tech = form.tech.map((t) => t.trim()).filter(Boolean);

    const team: TeamMember[] = form.team
      .map((row) => {
        const nip05 = clean(row.nip05);
        const name =
          clean(row.name ?? "") ||
          (nip05 ? nip05.split("@")[0] : "") ||
          (row.pubkey ? `${row.pubkey.slice(0, 8)}…` : "");
        return {
          name,
          role: clean(row.role) || "Builder",
          nip05: nip05 || undefined,
          pubkey: row.pubkey,
          picture: row.picture,
          github: row.github ? clean(row.github) || undefined : undefined,
        };
      })
      .filter((m) => m.name.length > 0 || m.nip05 || m.pubkey);

    const hackathon = clean(form.hackathon) || null;
    const status = hackathon ? "submitted" : "building";
    const existing = form.id
      ? doc.projects.find((p) => p.id === form.id)
      : undefined;
    const createdAt = existing?.createdAt ?? now;

    const base: UserProject = {
      id: form.id ?? crypto.randomUUID(),
      name: clean(form.name),
      description: clean(form.description) || "",
      team,
      repo: clean(form.repo) || undefined,
      demo: clean(form.demo) || undefined,
      tech: tech.length ? tech : undefined,
      status,
      hackathon,
      submittedAt: hackathon ? (existing?.submittedAt ?? today) : undefined,
      createdAt,
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
      setForm(emptyForm());
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
                  pubkey={auth?.pubkey}
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
          setForm(emptyForm());
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
  pubkey,
  onEdit,
  onDelete,
  disabled,
}: {
  project: UserProject;
  pubkey?: string;
  onEdit: () => void;
  onDelete: () => void;
  disabled: boolean;
}) {
  const detailHref = project.hackathon
    ? `/hackathons/${project.hackathon}/${project.id}`
    : pubkey
      ? `/projects/${pubkey}/${project.id}`
      : null;

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
        {detailHref ? (
          <Link
            href={detailHref}
            className="font-display text-lg font-bold tracking-tight flex-1 min-w-0 break-words hover:text-bitcoin transition-colors"
          >
            {project.name}
          </Link>
        ) : (
          <span className="font-display text-lg font-bold tracking-tight flex-1 min-w-0 break-words">
            {project.name}
          </span>
        )}
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

      {project.tech && project.tech.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {project.tech.map((t) => (
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
          {project.demo && (
            <a
              href={project.demo}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
            >
              <Globe className="h-3.5 w-3.5" />
              Demo
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
              <Field
                label="Hackatón"
                hint="asignalo para que aparezca en /hackathons"
              >
                <select
                  value={form.hackathon}
                  onChange={(e) =>
                    setForm({ ...form, hackathon: e.target.value })
                  }
                  disabled={publishing}
                  className="w-full px-3 py-2.5 rounded-lg bg-white/[0.03] border border-border focus:border-bitcoin/50 focus:bg-white/[0.05] transition-colors text-sm"
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

/* ───────────────────────── Stack tags input ───────────────────────── */

function TagsInput({
  value,
  onChange,
  disabled,
  placeholder,
  suggestions = [],
  maxTags,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
  suggestions?: string[];
  maxTags?: number;
}) {
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimer = useRef<number | null>(null);

  const normalized = useMemo(
    () => new Set(value.map((v) => v.trim().toLowerCase())),
    [value],
  );

  const filtered = useMemo(() => {
    const d = draft.trim().toLowerCase();
    return suggestions
      .filter((s) => !normalized.has(s.toLowerCase()))
      .filter((s) => !d || s.toLowerCase().includes(d))
      .slice(0, 8);
  }, [suggestions, draft, normalized]);

  function commit(raw: string) {
    const clean = raw.trim().replace(/^,+|,+$/g, "").trim();
    if (!clean) {
      setDraft("");
      return;
    }
    if (normalized.has(clean.toLowerCase())) {
      setDraft("");
      return;
    }
    if (maxTags && value.length >= maxTags) return;
    onChange([...value, clean]);
    setDraft("");
    setActiveIdx(-1);
  }

  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Read the live input value — React state (`draft`) may be stale when
    // two events (input + keydown) fire back-to-back in the same tick.
    const live = e.currentTarget.value;
    if (e.key === "Enter") {
      e.preventDefault();
      if (activeIdx >= 0 && filtered[activeIdx]) {
        commit(filtered[activeIdx]);
      } else if (live.trim()) {
        commit(live);
      }
    } else if (e.key === ",") {
      e.preventDefault();
      if (live.trim()) commit(live);
    } else if (e.key === "Tab") {
      if (live.trim()) commit(live);
      // let Tab do its default to advance focus
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
        className={cn(
          "flex flex-wrap items-center gap-1.5 min-h-[42px] px-2 py-1.5 rounded-lg bg-white/[0.03] border transition-colors cursor-text",
          focused && !disabled
            ? "border-bitcoin/50 bg-white/[0.05]"
            : "border-border",
          disabled && "opacity-60 cursor-not-allowed",
        )}
      >
        {value.map((tag, i) => (
          <span
            key={`${tag}-${i}`}
            className="inline-flex items-center gap-0.5 pl-2 pr-0.5 py-0.5 rounded-md border border-bitcoin/30 bg-bitcoin/10 text-[11px] font-mono text-bitcoin"
          >
            {tag}
            <button
              type="button"
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                remove(i);
              }}
              className="p-0.5 rounded hover:bg-bitcoin/20 disabled:opacity-50"
              aria-label={`Quitar ${tag}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setActiveIdx(-1);
          }}
          onKeyDown={onKeyDown}
          onFocus={() => {
            if (blurTimer.current) {
              window.clearTimeout(blurTimer.current);
              blurTimer.current = null;
            }
            setFocused(true);
          }}
          onBlur={() => {
            // small delay so clicks on suggestions land before dropdown hides
            blurTimer.current = window.setTimeout(() => {
              setFocused(false);
              if (draft.trim()) commit(draft);
            }, 120);
          }}
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
              onMouseDown={(e) => {
                // prevent input blur so focus stays after insertion
                e.preventDefault();
                commit(s);
                inputRef.current?.focus();
              }}
              onMouseEnter={() => setActiveIdx(i)}
              className={cn(
                "w-full text-left px-3 py-1.5 text-sm font-mono transition-colors",
                activeIdx === i
                  ? "bg-bitcoin/10 text-bitcoin"
                  : "hover:bg-white/5 text-foreground-muted",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Team editor (NIP-05) ──────────────────────── */

type Nip05State = {
  resolving: boolean;
  pubkey?: string;
  error?: string;
};

/** Resolves a NIP-05 identifier to a pubkey. Debounced, cancellable. */
function useNip05Resolution(nip05: string | undefined): Nip05State {
  const [state, setState] = useState<Nip05State>({ resolving: false });

  useEffect(() => {
    const value = (nip05 ?? "").trim();
    if (!value) {
      setState({ resolving: false });
      return;
    }
    if (!NIP05_REGEX.test(value)) {
      setState({ resolving: false, error: "formato inválido" });
      return;
    }

    let cancelled = false;
    setState({ resolving: true });

    const t = window.setTimeout(async () => {
      try {
        const res = await queryProfile(value);
        if (cancelled) return;
        if (res?.pubkey) {
          setState({ resolving: false, pubkey: res.pubkey });
        } else {
          setState({ resolving: false, error: "no encontrado" });
        }
      } catch {
        if (cancelled) return;
        setState({ resolving: false, error: "no se pudo resolver" });
      }
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [nip05]);

  return state;
}

function TeamEditor({
  team,
  onChange,
  disabled,
}: {
  team: TeamRow[];
  onChange: (team: TeamRow[]) => void;
  disabled: boolean;
}) {
  function updateRow(i: number, patch: Partial<TeamRow>) {
    onChange(team.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    onChange([
      ...team,
      { key: newRowKey(), nip05: "", role: "Builder" },
    ]);
  }
  function removeRow(i: number) {
    onChange(team.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-foreground-muted">
          Equipo
        </span>
        <span className="text-[10px] text-foreground-subtle">
          sumá miembros con su NIP-05
        </span>
      </div>
      <div className="space-y-2">
        {team.map((row, i) => (
          <TeamRowEditor
            key={row.key}
            row={row}
            disabled={disabled}
            onChange={(patch) => updateRow(i, patch)}
            onRemove={() => removeRow(i)}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={addRow}
        disabled={disabled}
        className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-border bg-white/[0.02] hover:bg-white/[0.05] text-xs font-semibold transition-colors disabled:opacity-50"
      >
        <Plus className="h-3.5 w-3.5" />
        Sumar miembro
      </button>
    </div>
  );
}

function TeamRowEditor({
  row,
  disabled,
  onChange,
  onRemove,
}: {
  row: TeamRow;
  disabled: boolean;
  onChange: (patch: Partial<TeamRow>) => void;
  onRemove: () => void;
}) {
  // Don't run NIP-05 resolution for the owner row — its pubkey was seeded
  // from the signer and the nip05 value reflects the owner's profile, which
  // we already have via useNostrProfile in the parent.
  const resolution = useNip05Resolution(row.owner ? "" : row.nip05);
  const effectivePubkey = row.owner ? row.pubkey : resolution.pubkey;
  const { profile, loading } = useNostrProfile(effectivePubkey);

  // Keep row.pubkey / name / picture in sync with the resolved profile.
  useEffect(() => {
    if (row.owner) return;
    if (resolution.pubkey && resolution.pubkey !== row.pubkey) {
      onChange({ pubkey: resolution.pubkey });
    }
    if (!resolution.pubkey && !resolution.resolving && row.pubkey) {
      onChange({ pubkey: undefined, picture: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolution.pubkey, resolution.resolving]);

  useEffect(() => {
    if (!profile) return;
    const name = profile.display_name || profile.name;
    const patch: Partial<TeamRow> = {};
    if (name && name !== row.name) patch.name = name;
    if (profile.picture && profile.picture !== row.picture) {
      patch.picture = profile.picture;
    }
    if (Object.keys(patch).length > 0) onChange(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.name, profile?.display_name, profile?.picture]);

  const busy = resolution.resolving || loading;
  const resolved = !!effectivePubkey && !resolution.error;
  const error = resolution.error;

  const displayName =
    row.name ||
    (row.nip05 ? row.nip05.split("@")[0] : "") ||
    (effectivePubkey ? `${effectivePubkey.slice(0, 8)}…` : "");

  return (
    <div>
      <div className="grid grid-cols-[auto_1fr_120px_auto] gap-2 items-center">
        <Avatar
          picture={row.picture}
          name={displayName}
          busy={busy}
          error={!!error}
        />
        <div className="relative min-w-0">
          <input
            type="text"
            value={row.nip05}
            onChange={(e) => onChange({ nip05: e.target.value })}
            disabled={disabled || row.owner}
            placeholder="vos@dominio.com"
            spellCheck={false}
            autoComplete="off"
            className={cn(
              "w-full px-2.5 py-2 pr-7 rounded-lg bg-white/[0.03] border transition-colors text-xs font-mono placeholder:text-foreground-subtle min-w-0",
              error
                ? "border-danger/50 focus:border-danger"
                : resolved
                  ? "border-success/40 focus:border-success/60"
                  : "border-border focus:border-bitcoin/50 focus:bg-white/[0.05]",
              row.owner && "bg-white/[0.02] text-foreground-muted",
            )}
          />
          {resolved && !error && (
            <BadgeCheck className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-success" />
          )}
          {error && (
            <AlertCircle className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-danger" />
          )}
          {busy && (
            <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-foreground-subtle" />
          )}
        </div>
        <input
          type="text"
          value={row.role}
          onChange={(e) => onChange({ role: e.target.value })}
          disabled={disabled}
          placeholder="Rol"
          className="px-2.5 py-2 rounded-lg bg-white/[0.03] border border-border focus:border-bitcoin/50 focus:bg-white/[0.05] transition-colors text-xs placeholder:text-foreground-subtle min-w-0"
        />
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          className="px-2 py-2 rounded-lg text-foreground-subtle hover:text-danger hover:bg-danger/10 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-foreground-subtle transition-colors"
          aria-label="Quitar miembro"
          title={row.owner ? "Quitarte del equipo" : "Quitar miembro"}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {(row.name || row.owner || error) && (
        <div className="mt-1 pl-[calc(28px+0.5rem)] text-[10px] font-mono flex items-center gap-2">
          {row.owner && (
            <span className="inline-flex items-center gap-0.5 text-bitcoin">
              <BadgeCheck className="h-3 w-3" /> vos
            </span>
          )}
          {error ? (
            <span className="text-danger">{error}</span>
          ) : row.name ? (
            <span className="text-foreground-subtle truncate">{row.name}</span>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Avatar({
  picture,
  name,
  busy,
  error,
}: {
  picture?: string;
  name?: string;
  busy?: boolean;
  error?: boolean;
}) {
  const initial = (name?.trim()?.[0] ?? "?").toUpperCase();
  return (
    <div
      className={cn(
        "relative h-7 w-7 rounded-full border flex items-center justify-center overflow-hidden shrink-0",
        error
          ? "border-danger/40 bg-danger/10"
          : picture
            ? "border-success/30"
            : "border-border bg-gradient-to-br from-bitcoin/30 to-nostr/30",
      )}
    >
      {picture ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={picture}
          alt={name ?? ""}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="text-[11px] font-display font-bold text-foreground">
          {initial}
        </span>
      )}
      {busy && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
          <Loader2 className="h-3 w-3 animate-spin text-white" />
        </div>
      )}
    </div>
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
