"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  Check,
  Loader2,
  Mail,
  Sparkles,
  UserRoundSearch,
} from "lucide-react";
import { fetchNostrProfile, type NostrProfile } from "@/lib/nostrProfile";
import { DEFAULT_RELAYS, mergeDataRelays } from "@/lib/nostrRelayConfig";
import type { SignedEvent } from "@/lib/nostrSigner";
import { cn } from "@/lib/cn";

type ResolveStatus = "idle" | "resolving" | "found" | "missing" | "error";
type PublishPhase = "idle" | "signing" | "publishing" | "done" | "error";
type SubscribePhase = "idle" | "sending" | "sent" | "error";
type NotifyMode = "email" | "nostr" | "both";

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

function isLikelyNip05(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value.trim().toLowerCase());
}

async function resolveInput(raw: string): Promise<ResolvedUser> {
  const value = raw.trim();
  if (!value) throw new Error("Pegá un NIP-05.");
  if (!isLikelyNip05(value)) throw new Error("Ingresá un NIP-05 valido.");

  let pubkey = "";
  let relays: string[] = [];
  const inputType: ResolvedUser["inputType"] = "nip05";
  const normalized = value.toLowerCase();

  // Loaded on demand — nip05 resolution only happens inside the submit flow,
  // so keep nostr-tools out of the section's initial bundle.
  const { queryProfile } = await import("nostr-tools/nip05");
  const pointer = await queryProfile(normalized);
  if (!pointer?.pubkey) {
    throw new Error("No pudimos resolver ese NIP-05.");
  }
  pubkey = pointer.pubkey;
  relays = pointer.relays ?? [];

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
  const [subscribePhase, setSubscribePhase] = useState<SubscribePhase>("idle");
  const [subscribeError, setSubscribeError] = useState("");
  const [activeMode, setActiveMode] = useState<NotifyMode | null>(null);
  const [value, setValue] = useState("");
  const [resolveStatus, setResolveStatus] = useState<ResolveStatus>("idle");
  const [resolveError, setResolveError] = useState("");
  const [resolved, setResolved] = useState<ResolvedUser | null>(null);
  const [publishPhase, setPublishPhase] = useState<PublishPhase>("idle");
  const [publishError, setPublishError] = useState("");
  const [progress, setProgress] = useState<RelayProgress[]>([]);

  const isBusy =
    subscribePhase === "sending" ||
    ["signing", "publishing"].includes(publishPhase);
  const resolvedOk = !!resolved && resolveStatus === "found";
  const resolveFailed =
    resolveStatus === "error" || resolveStatus === "missing";
  const canNotify = resolvedOk && !isBusy;
  // Email only needs a valid email-format input — it stays available even when
  // the NIP-05 never resolves to a Nostr profile.
  const emailEnabled = isLikelyNip05(value) && !isBusy;
  // Nostr is shown (disabled) until the NIP-05 resolves, then hidden if it
  // resolves badly. The combined action is hidden until a clean resolution.
  const showNostr = !resolveFailed;
  const showBoth = resolvedOk;
  const visibleButtons = 1 + (showNostr ? 1 : 0) + (showBoth ? 1 : 0);

  const okCount = progress.filter((item) => item.ok).length;
  const totalCount = progress.length;
  const notifyEmail = resolved?.handle || value.trim().toLowerCase();
  const relaysRef = useRef<HTMLDivElement>(null);

  // Scroll the relay list into view as soon as a Nostr publish starts so the
  // user follows the per-relay progress animation.
  useEffect(() => {
    if (
      progress.length > 0 &&
      (publishPhase === "signing" || publishPhase === "publishing")
    ) {
      relaysRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [progress.length, publishPhase]);

  useEffect(() => {
    const raw = value.trim();
    setPublishPhase("idle");
    setPublishError("");
    setSubscribePhase("idle");
    setSubscribeError("");
    setActiveMode(null);
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

  async function handleNotify(mode: NotifyMode) {
    const wantsEmail = mode === "email" || mode === "both";
    const wantsNostr = mode === "nostr" || mode === "both";
    // Nostr / combined need a resolved profile; email just needs a valid input.
    if (wantsNostr && !resolvedOk) return;
    const emailValue = value.trim().toLowerCase();
    if (wantsEmail && !isLikelyNip05(emailValue)) return;
    if (isBusy) return;

    const nip05 = resolved?.handle ?? emailValue;
    setActiveMode(mode);
    setPublishError("");
    setSubscribeError("");
    if (wantsNostr) {
      const relays = mergeDataRelays(DEFAULT_RELAYS, resolved?.relays ?? []);
      setProgress(relays.map((relay) => ({ relay, state: "pending" })));
    } else {
      setProgress([]);
    }

    let subscriptionCreated = false;
    try {
      if (wantsEmail) {
        setSubscribePhase("sending");
      }

      // Register the subscriber in the La Crypta events CRM. The npub is
      // derived from the resolved NIP-05 (no manual entry); the email is only
      // included when the user opted into email notifications.
      const eventsRes = await fetch("/api/events-subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: wantsEmail ? nip05 : undefined,
          // Only send the npub when the user opted into Nostr. Sending both
          // identifiers for an email-only subscription triggers the CRM's
          // identity_conflict when the email already exists.
          npub: wantsNostr ? resolved?.pubkey : undefined,
          name:
            resolved?.profile.display_name?.trim() ||
            resolved?.profile.name?.trim() ||
            undefined,
        }),
      });
      const eventsData = (await eventsRes.json()) as { error?: string };
      if (!eventsRes.ok) {
        throw new Error(eventsData.error || "No se pudo crear la suscripcion.");
      }

      const subscribeRes = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: wantsEmail ? nip05 : undefined,
          handle: resolved?.profile.nip05 || resolved?.handle || nip05,
          recipientPubkey: wantsNostr ? resolved?.pubkey : undefined,
        }),
      });
      const subscribeData = (await subscribeRes.json()) as { error?: string };
      if (!subscribeRes.ok) {
        throw new Error(subscribeData.error || "No se pudo crear la suscripcion.");
      }
      subscriptionCreated = true;
      setSubscribePhase(wantsEmail ? "sent" : "idle");

      if (!wantsNostr) return;
      if (!resolved) return;
      setPublishPhase("signing");
      const relays = mergeDataRelays(DEFAULT_RELAYS, resolved.relays);
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
      const message =
        error instanceof Error ? error.message : "No se pudo crear la suscripcion.";
      if (!subscriptionCreated) {
        setPublishPhase("idle");
        setSubscribePhase("error");
        setSubscribeError(message);
      } else {
        setPublishPhase("error");
        setPublishError(message || "No se pudo enviar la notificacion.");
      }
    } finally {
      setActiveMode(null);
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
          Cero spam. Nuevas hackatons y oportunidades de trabajo por email o Nostr.
        </motion.p>

        <motion.form
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5, ease: "easeOut", delay: 0.15 }}
          onSubmit={(e) => e.preventDefault()}
          className="mx-auto mt-8 max-w-2xl"
          noValidate
        >
          <label htmlFor="newsletter-nostr" className="sr-only">
            NIP-05
          </label>
          <div className="relative">
            <UserRoundSearch
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-subtle"
              aria-hidden
            />
            <input
              id="newsletter-nostr"
              type="text"
              autoComplete="email"
              inputMode="email"
              placeholder="usuario@dominio.com"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-describedby="newsletter-status"
              className="w-full rounded-xl border border-border bg-background-card/60 py-3 pl-9 pr-3 text-sm transition-all placeholder:text-foreground-subtle focus:border-bitcoin/60 focus:bg-background-card focus:outline-none focus:ring-2 focus:ring-bitcoin/20"
            />
          </div>
          <div
            className={cn(
              "mt-3 grid gap-2",
              visibleButtons === 1
                ? "sm:grid-cols-1"
                : visibleButtons === 2
                  ? "sm:grid-cols-2"
                  : "sm:grid-cols-3",
            )}
          >
            <button
              type="button"
              onClick={() => void handleNotify("email")}
              disabled={!emailEnabled}
              className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-bitcoin to-bitcoin/80 px-5 py-3 text-sm font-semibold text-black shadow-lg shadow-bitcoin/20 transition-all hover:scale-[1.02] hover:shadow-bitcoin/40 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
            >
              {subscribePhase === "sending" && activeMode === "email" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Enviando
                </>
              ) : subscribePhase === "sent" && activeMode === null ? (
                <>
                  <Check className="h-4 w-4" />
                  Email enviado
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4" />
                  Notificar por email
                </>
              )}
            </button>
            {showNostr && (
              <button
                type="button"
                onClick={() => void handleNotify("nostr")}
                disabled={!canNotify}
                className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-nostr/30 bg-nostr/10 px-5 py-3 text-sm font-semibold text-nostr transition-all hover:scale-[1.02] hover:bg-nostr/15 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
              >
                {publishPhase === "signing" && activeMode === "nostr" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Firmando
                  </>
                ) : publishPhase === "publishing" && activeMode === "nostr" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Publicando
                  </>
                ) : publishPhase === "done" && !subscribePhase.includes("sent") ? (
                  <>
                    <Check className="h-4 w-4" />
                    Nostr enviado
                  </>
                ) : (
                  <>
                    <UserRoundSearch className="h-4 w-4" />
                    Notificar por Nostr
                  </>
                )}
              </button>
            )}
            {showBoth && (
              <button
                type="button"
                onClick={() => void handleNotify("both")}
                disabled={!canNotify}
                className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-bitcoin/40 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-foreground transition-all hover:scale-[1.02] hover:bg-white/[0.07] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
              >
                {activeMode === "both" && isBusy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Enviando
                  </>
                ) : publishPhase === "done" && subscribePhase === "sent" ? (
                  <>
                    <Check className="h-4 w-4" />
                    Ambos enviados
                  </>
                ) : (
                  <>
                    Email + Nostr
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            )}
          </div>
        </motion.form>

        <div id="newsletter-status" className="mt-4" aria-live="polite">
          {subscribePhase === "sent" && publishPhase === "done" ? (
            <StatusLine tone="success" icon={<Check className="h-3.5 w-3.5" />}>
              Te notificamos email y nostr a {notifyEmail}.
            </StatusLine>
          ) : subscribePhase === "sent" ? (
            <StatusLine tone="success" icon={<Check className="h-3.5 w-3.5" />}>
              Te notificamos por email a {notifyEmail}.
            </StatusLine>
          ) : null}
          {subscribePhase === "error" && subscribeError && (
            <StatusLine tone="error" icon={<AlertCircle className="h-3.5 w-3.5" />}>
              {subscribeError}
            </StatusLine>
          )}
          {resolveStatus === "resolving" && (
            <StatusLine icon={<Loader2 className="h-3.5 w-3.5 animate-spin" />}>
              Resolviendo identidad y verificando perfil en relays…
            </StatusLine>
          )}
          {resolveStatus === "idle" && (
            <p className="text-[11px] text-foreground-subtle">
              Ingresá un NIP-05. Lo resolvemos y verificamos el perfil antes de enviar.
            </p>
          )}
        </div>

        {resolved && (
          <ProfilePreview title={previewTitle} user={resolved} />
        )}

        {progress.length > 0 && (
          <motion.div
            ref={relaysRef}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto mt-4 w-full max-w-2xl rounded-2xl border border-border bg-background-card/70 p-4 text-left shadow-2xl shadow-black/25"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {publishPhase === "signing" || publishPhase === "publishing" ? (
                  <Loader2 className="h-4 w-4 animate-spin text-nostr" />
                ) : publishPhase === "done" ? (
                  <Check className="h-4 w-4 text-success" />
                ) : publishPhase === "error" ? (
                  <AlertCircle className="h-4 w-4 text-danger" />
                ) : (
                  <UserRoundSearch className="h-4 w-4 text-nostr" />
                )}
                <p className="text-sm font-semibold text-foreground">
                  {publishPhase === "signing"
                    ? "Firmando notificación…"
                    : publishPhase === "publishing"
                      ? "Publicando en relays…"
                      : publishPhase === "done"
                        ? "Notificación publicada en Nostr"
                        : publishPhase === "error"
                          ? "No se pudo publicar"
                          : "Relays"}
                </p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-nostr/10 px-2 py-1 text-[10px] font-mono font-bold tabular-nums text-nostr">
                {okCount}/{totalCount} relays
              </span>
            </div>

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

            {publishPhase === "done" && (
              <p className="mt-3 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
                Listo. La notificación fue aceptada por {okCount} relay
                {okCount === 1 ? "" : "s"}.
              </p>
            )}
            {publishPhase === "error" && publishError && (
              <p className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                {publishError}
              </p>
            )}
          </motion.div>
        )}
      </div>
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
  tone?: "muted" | "error" | "success";
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px]",
        tone === "error"
          ? "border-danger/30 bg-danger/10 text-danger"
          : tone === "success"
            ? "border-success/30 bg-success/10 text-success"
          : "border-border bg-white/[0.03] text-foreground-muted",
      )}
    >
      {icon}
      {children}
    </div>
  );
}

function ProfilePreview({
  title,
  user,
}: {
  title: string;
  user: ResolvedUser;
}) {
  const banner = user.profile.banner;
  const picture = user.profile.picture;
  const subtitle = user.profile.nip05 || user.handle || shortPubkey(user.pubkey);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto mt-6 w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-background-card/70 text-left shadow-2xl shadow-black/25"
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
      </div>
    </motion.div>
  );
}
