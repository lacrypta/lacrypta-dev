"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  Check,
  Code2,
  Loader2,
  Sparkles,
  UserRoundSearch,
  X,
} from "lucide-react";
import { fetchNostrProfile, type NostrProfile } from "@/lib/nostrProfile";
import { DEFAULT_RELAYS, mergeDataRelays } from "@/lib/nostrRelayConfig";
import type { SignedEvent } from "@/lib/nostrSigner";
import { cn } from "@/lib/cn";

type ResolveStatus = "idle" | "resolving" | "found" | "missing" | "error";
type PublishPhase = "idle" | "signing" | "publishing" | "done" | "error";

type ResolvedUser = {
  handle: string;
  inputType: "npub" | "nip05";
  profile: NostrProfile;
  pubkey: string;
  relays: string[];
};

type RelayProgress = {
  error?: string;
  ok?: boolean;
  relay: string;
  state: "pending" | "publishing" | "ok" | "error";
};

function shortPubkey(pubkey: string): string {
  return `${pubkey.slice(0, 8)}…${pubkey.slice(-6)}`;
}

function displayName(user: ResolvedUser): string {
  return (
    user.profile.display_name?.trim() ||
    user.profile.name?.trim() ||
    user.profile.nip05?.trim() ||
    user.handle ||
    shortPubkey(user.pubkey)
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

async function resolveInput(raw: string): Promise<ResolvedUser> {
  const value = raw.trim();
  if (!value) throw new Error("Pegá un npub o NIP-05.");

  let pubkey = "";
  let relays: string[] = [];
  let inputType: ResolvedUser["inputType"] = "nip05";
  const normalized = value.toLowerCase();

  if (normalized.startsWith("npub1")) {
    const { decode } = await import("nostr-tools/nip19");
    const decoded = decode(normalized);
    if (decoded.type !== "npub") throw new Error("npub invalido.");
    pubkey = decoded.data as string;
    inputType = "npub";
  } else {
    const { queryProfile } = await import("nostr-tools/nip05");
    const pointer = await queryProfile(normalized);
    if (!pointer?.pubkey) {
      throw new Error("No pudimos resolver ese NIP-05.");
    }
    pubkey = pointer.pubkey;
    relays = pointer.relays ?? [];
  }

  const readRelays = mergeDataRelays(DEFAULT_RELAYS, relays);
  const cached = await fetchNostrProfile(pubkey, readRelays, 4500);
  if (!cached) {
    throw new Error("La npub se resolvio, pero no encontramos perfil en relays.");
  }

  return {
    handle: normalized,
    inputType,
    profile: cached.profile,
    pubkey,
    relays: cached.relaysUsed.length ? cached.relaysUsed : readRelays,
  };
}

async function publishNotification(
  event: SignedEvent,
  relays: string[],
  onProgress: (relay: string, patch: Partial<RelayProgress>) => void,
): Promise<RelayProgress[]> {
  const { SimplePool } = await import("nostr-tools/pool");
  const pool = new SimplePool();
  const publishRelays = mergeDataRelays(DEFAULT_RELAYS, relays);
  const results = await Promise.all(
    publishRelays.map(async (relay) => {
      onProgress(relay, { state: "publishing" });
      try {
        const [published] = pool.publish([relay], event);
        await Promise.race([
          published,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Timeout publicando")), 7000),
          ),
        ]);
        onProgress(relay, { ok: true, state: "ok" });
        return { relay, ok: true, state: "ok" as const };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        onProgress(relay, { error: message, ok: false, state: "error" });
        return { relay, error: message, ok: false, state: "error" as const };
      }
    }),
  );
  try {
    pool.close(publishRelays);
  } catch {
    /* noop */
  }
  return results;
}

export default function NewsletterCTA() {
  const [value, setValue] = useState("");
  const [resolveStatus, setResolveStatus] = useState<ResolveStatus>("idle");
  const [resolveError, setResolveError] = useState("");
  const [resolved, setResolved] = useState<ResolvedUser | null>(null);
  const [publishPhase, setPublishPhase] = useState<PublishPhase>("idle");
  const [publishError, setPublishError] = useState("");
  const [signedEvent, setSignedEvent] = useState<SignedEvent | null>(null);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [progress, setProgress] = useState<RelayProgress[]>([]);

  const okCount = progress.filter((item) => item.ok).length;
  const totalCount = progress.length;
  const canNotify = !!resolved && !["signing", "publishing"].includes(publishPhase);

  useEffect(() => {
    const raw = value.trim();
    setPublishPhase("idle");
    setPublishError("");
    setSignedEvent(null);
    setEventModalOpen(false);
    setProgress([]);
    if (!raw) {
      setResolveStatus("idle");
      setResolveError("");
      setResolved(null);
      return;
    }

    let cancelled = false;
    setResolveStatus("resolving");
    setResolveError("");
    setResolved(null);
    const timeout = window.setTimeout(() => {
      resolveInput(raw)
        .then((user) => {
          if (cancelled) return;
          setResolved(user);
          setResolveStatus("found");
        })
        .catch((error) => {
          if (cancelled) return;
          setResolveError(error instanceof Error ? error.message : String(error));
          setResolveStatus("error");
        });
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [value]);

  const previewTitle = useMemo(
    () => (resolved ? displayName(resolved) : ""),
    [resolved],
  );

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!resolved || !canNotify) return;

    setPublishPhase("signing");
    setPublishError("");
    setSignedEvent(null);
    setEventModalOpen(false);
    const relays = mergeDataRelays(DEFAULT_RELAYS, resolved.relays);
    setProgress(relays.map((relay) => ({ relay, state: "pending" })));

    try {
      const res = await fetch("/api/nostr-opportunity-notification", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          handle: resolved.profile.nip05 || resolved.handle,
          recipientPubkey: resolved.pubkey,
        }),
      });
      const data = (await res.json()) as { error?: string; event?: SignedEvent };
      if (!res.ok || !data.event) {
        throw new Error(data.error || "No se pudo generar la notificacion.");
      }
      setSignedEvent(data.event);

      setPublishPhase("publishing");
      const results = await publishNotification(data.event, relays, (relay, patch) => {
        setProgress((prev) =>
          prev.map((item) => (item.relay === relay ? { ...item, ...patch } : item)),
        );
      });
      const accepted = results.filter((item) => item.ok).length;
      if (accepted === 0) {
        throw new Error("Ningun relay acepto la notificacion.");
      }
      setPublishPhase("done");
    } catch (error) {
      setPublishPhase("error");
      setPublishError(
        error instanceof Error ? error.message : "No se pudo enviar la notificacion.",
      );
    }
  }

  return (
    <section
      id="oportunidades"
      className="relative overflow-hidden border-t border-border bg-[linear-gradient(180deg,#0a0d1a_0%,#05070e_100%)]"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <motion.div
          className="absolute -top-32 left-1/2 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-bitcoin/[0.08] blur-3xl"
          animate={{ x: [-30, 30, -30], y: [0, -16, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="absolute left-1/2 top-0 h-px w-full max-w-2xl -translate-x-1/2 bg-gradient-to-r from-transparent via-bitcoin/50 to-transparent" />
      </div>

      <div className="relative mx-auto max-w-3xl px-6 py-20 text-center sm:px-8 sm:py-24">
        <motion.span
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="inline-flex items-center gap-2 rounded-full border border-bitcoin/30 bg-bitcoin/[0.06] px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-[0.25em] text-bitcoin"
        >
          <Sparkles className="h-3 w-3" />
          Oportunidades
        </motion.span>

        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5, ease: "easeOut", delay: 0.05 }}
          className="mt-5 font-display text-3xl font-black leading-[1.05] tracking-tight sm:text-4xl md:text-5xl"
        >
          La data que importa{" "}
          <span className="text-gradient-hero">en tu inbox</span>
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5, ease: "easeOut", delay: 0.1 }}
          className="mt-4 text-sm leading-relaxed text-foreground-muted sm:text-base"
        >
          Cero spam. Nuevas hackatons y oportunidades de trabajo por Nostr.
        </motion.p>

        <motion.form
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5, ease: "easeOut", delay: 0.15 }}
          onSubmit={handleSubmit}
          className="mx-auto mt-8 max-w-2xl"
          noValidate
        >
          <label htmlFor="newsletter-nostr" className="sr-only">
            npub o NIP-05
          </label>
          <div className="flex flex-col items-stretch gap-2 sm:flex-row">
            <div className="relative flex-1">
              <UserRoundSearch
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-subtle"
                aria-hidden
              />
              <input
                id="newsletter-nostr"
                type="text"
                autoComplete="off"
                inputMode="text"
                placeholder="npub1… o usuario@dominio.com"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                aria-describedby="newsletter-status"
                className="w-full rounded-xl border border-border bg-background-card/60 py-3 pl-9 pr-3 text-sm transition-all placeholder:text-foreground-subtle focus:border-bitcoin/60 focus:bg-background-card focus:outline-none focus:ring-2 focus:ring-bitcoin/20"
              />
            </div>
            <button
              type="submit"
              disabled={!canNotify}
              className="group inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-bitcoin to-bitcoin/80 px-5 py-3 text-sm font-semibold text-black shadow-lg shadow-bitcoin/20 transition-all hover:scale-[1.02] hover:shadow-bitcoin/40 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
            >
              {publishPhase === "signing" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Firmando
                </>
              ) : publishPhase === "publishing" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Publicando
                </>
              ) : publishPhase === "done" ? (
                <>
                  <Check className="h-4 w-4" />
                  Enviado
                </>
              ) : (
                <>
                  Enviar notificación
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </motion.form>

        <div id="newsletter-status" className="mt-4" aria-live="polite">
          {resolveStatus === "resolving" && (
            <StatusLine icon={<Loader2 className="h-3.5 w-3.5 animate-spin" />}>
              Resolviendo identidad y verificando perfil en relays…
            </StatusLine>
          )}
          {resolveStatus === "error" && (
            <StatusLine tone="error" icon={<AlertCircle className="h-3.5 w-3.5" />}>
              {resolveError}
            </StatusLine>
          )}
          {resolveStatus === "idle" && (
            <p className="text-[11px] text-foreground-subtle">
              Pegá un NIP-05 o npub para verificar tu perfil público.
            </p>
          )}
        </div>

        {resolved && (
          <ProfilePreview
            event={signedEvent}
            okCount={okCount}
            onShowEvent={() => setEventModalOpen(true)}
            phase={publishPhase}
            progress={progress}
            title={previewTitle}
            totalCount={totalCount}
            user={resolved}
            error={publishError}
          />
        )}
      </div>
      {signedEvent && (
        <SignedEventModal
          event={signedEvent}
          open={eventModalOpen}
          onClose={() => setEventModalOpen(false)}
        />
      )}
    </section>
  );
}

function StatusLine({
  children,
  icon,
  tone = "muted",
}: {
  children: ReactNode;
  icon: ReactNode;
  tone?: "muted" | "error";
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px]",
        tone === "error"
          ? "border-danger/30 bg-danger/10 text-danger"
          : "border-border bg-white/[0.03] text-foreground-muted",
      )}
    >
      {icon}
      {children}
    </div>
  );
}

function ProfilePreview({
  error,
  event,
  okCount,
  onShowEvent,
  phase,
  progress,
  title,
  totalCount,
  user,
}: {
  error: string;
  event: SignedEvent | null;
  okCount: number;
  onShowEvent: () => void;
  phase: PublishPhase;
  progress: RelayProgress[];
  title: string;
  totalCount: number;
  user: ResolvedUser;
}) {
  const banner = user.profile.banner;
  const picture = user.profile.picture;
  const subtitle = user.profile.nip05 || user.handle || shortPubkey(user.pubkey);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto mt-6 max-w-xl overflow-hidden rounded-2xl border border-border bg-background-card/70 text-left shadow-2xl shadow-black/25"
    >
      <div className="relative h-28 bg-gradient-to-br from-bitcoin/20 via-cyan/10 to-nostr/30">
        {banner && (
          <img
            src={banner}
            alt=""
            className="h-full w-full object-cover opacity-75"
            referrerPolicy="no-referrer"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background-card via-transparent to-transparent" />
      </div>
      <div className="relative px-5 pb-5">
        <div className="-mt-9 flex items-end gap-4">
          <div className="flex h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-2xl border border-border-strong bg-gradient-to-br from-bitcoin/30 to-nostr/30 text-lg font-black text-foreground shadow-xl">
            {picture ? (
              <img
                src={picture}
                alt=""
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              initials(title)
            )}
          </div>
          <div className="min-w-0 pb-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-display text-xl font-bold">{title}</h3>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider text-success">
                <Check className="h-3 w-3" />
                Verificado
              </span>
            </div>
            <p className="truncate font-mono text-xs text-foreground-subtle">
              {subtitle}
            </p>
          </div>
        </div>

        {user.profile.about && (
          <p className="mt-4 max-h-16 overflow-hidden text-sm leading-relaxed text-foreground-muted">
            {user.profile.about}
          </p>
        )}

        <div className="mt-4 rounded-xl border border-border bg-white/[0.03] p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-foreground">
                Notificación NIP-17
              </p>
              <p className="mt-0.5 text-[11px] text-foreground-subtle">
                Firmada por La Crypta y publicada desde tu navegador.
              </p>
            </div>
            {phase === "done" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-1 text-[10px] font-mono font-bold text-success">
                {okCount}/{totalCount} relays
              </span>
            )}
          </div>

          {progress.length > 0 && (
            <div className="mt-3 space-y-2">
              {progress.map((item) => (
                <div key={item.relay}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-[10px]">
                    <span className="truncate font-mono text-foreground-subtle">
                      {item.relay.replace(/^wss?:\/\//u, "")}
                    </span>
                    <span
                      className={cn(
                        "font-mono uppercase",
                        item.state === "ok"
                          ? "text-success"
                          : item.state === "error"
                            ? "text-danger"
                            : "text-bitcoin",
                      )}
                    >
                      {item.state === "ok"
                        ? "ok"
                        : item.state === "error"
                          ? "error"
                          : item.state === "publishing"
                            ? "publicando"
                            : "pendiente"}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                    <motion.div
                      className={cn(
                        "h-full rounded-full",
                        item.state === "ok"
                          ? "bg-success"
                          : item.state === "error"
                            ? "bg-danger"
                            : "bg-bitcoin",
                      )}
                      initial={{ width: "8%" }}
                      animate={{
                        width:
                          item.state === "pending"
                            ? "8%"
                            : item.state === "publishing"
                              ? "58%"
                              : "100%",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {phase === "error" && error && (
            <p className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </p>
          )}
          {phase === "done" && (
            <p className="mt-3 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
              Listo. La notificación fue aceptada por {okCount} relay
              {okCount === 1 ? "" : "s"}.
            </p>
          )}
          {event && (
            <button
              type="button"
              onClick={onShowEvent}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border bg-white/[0.03] px-3 py-2 text-xs font-semibold text-foreground-muted transition-colors hover:bg-white/[0.06] hover:text-foreground"
            >
              <Code2 className="h-3.5 w-3.5" />
              Mostrar evento
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function SignedEventModal({
  event,
  onClose,
  open,
}: {
  event: SignedEvent;
  onClose: () => void;
  open: boolean;
}) {
  if (!open) return null;
  const json = JSON.stringify(event, null, 2);
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-4 py-8">
      <button
        type="button"
        aria-label="Cerrar modal"
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative flex max-h-[82vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border-strong bg-background-elevated shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="signed-event-title"
      >
        <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-bitcoin">
              Evento firmado
            </p>
            <h3 id="signed-event-title" className="mt-1 font-display text-xl font-bold">
              JSON Nostr kind {event.kind}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-foreground-muted transition-colors hover:bg-white/[0.06] hover:text-foreground"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <pre className="max-h-[62vh] overflow-auto whitespace-pre-wrap break-words bg-black/30 p-5 text-left font-mono text-[11px] leading-relaxed text-foreground-muted">
          {json}
        </pre>
      </motion.div>
    </div>
  );
}
