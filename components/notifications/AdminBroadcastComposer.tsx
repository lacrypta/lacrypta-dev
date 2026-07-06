"use client";

/**
 * Admin-only composer on /notifications: send a broadcast notification that
 * reaches every user. Self-hides for non-admins. The send is a two-step confirm
 * because it publishes to public relays (irreversible, outward-facing).
 */
import { useEffect, useState } from "react";
import { Loader2, Radio, Send } from "lucide-react";
import { cn } from "@/lib/cn";
import { useAuth } from "@/lib/auth";
import { getSigner } from "@/lib/nostrSigner";
import { fetchLacryptaBadgePubkeys } from "@/lib/hackathonBadgeClient";
import { requestBroadcastNotification } from "@/lib/notifications/broadcast";
import { useToast } from "@/components/Toast";

export default function AdminBroadcastComposer({
  onSent,
}: {
  onSent?: () => void;
}) {
  const { auth } = useAuth();
  const { push } = useToast();
  const [adminPubkey, setAdminPubkey] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [href, setHref] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchLacryptaBadgePubkeys()
      .then((p) => {
        if (!cancelled) setAdminPubkey(p.adminPubkey);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const isAdmin = !!auth && !!adminPubkey && auth.pubkey === adminPubkey;
  if (!isAdmin) return null;

  const hrefInvalid = href.trim() !== "" && !/^\/(?!\/)/.test(href.trim());
  const canSend = title.trim() !== "" && !hrefInvalid && !busy;

  async function send() {
    if (!auth || !canSend) return;
    setBusy(true);
    let signer: Awaited<ReturnType<typeof getSigner>> | null = null;
    try {
      signer = await getSigner(auth);
      await requestBroadcastNotification(signer, {
        title,
        body: body.trim() || undefined,
        href: href.trim() || undefined,
      });
      push({
        kind: "success",
        title: "Notificación enviada",
        description: "Le va a llegar a todos los usuarios.",
      });
      setTitle("");
      setBody("");
      setHref("");
      setConfirming(false);
      onSent?.();
    } catch (e) {
      push({
        kind: "error",
        title: "No se pudo enviar",
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      await signer?.close?.().catch(() => {});
      setBusy(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none placeholder:text-foreground-subtle focus:border-border-strong";

  return (
    <div className="mb-6 rounded-2xl border border-nostr/25 bg-nostr/[0.04] p-4 sm:p-5">
      <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-nostr/30 bg-nostr/10 px-3 py-1 text-[11px] font-mono font-semibold uppercase tracking-widest text-nostr">
        <Radio className="h-3.5 w-3.5" />
        Admin · Enviar a todos
      </div>

      <div className="space-y-2">
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setConfirming(false);
          }}
          placeholder="Título de la notificación"
          maxLength={120}
          disabled={busy}
          className={inputClass}
        />
        <textarea
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            setConfirming(false);
          }}
          placeholder="Mensaje (opcional)"
          maxLength={500}
          rows={2}
          disabled={busy}
          className={cn(inputClass, "resize-none")}
        />
        <input
          value={href}
          onChange={(e) => {
            setHref(e.target.value);
            setConfirming(false);
          }}
          placeholder="Link interno (opcional, ej: /hackathons)"
          disabled={busy}
          className={cn(inputClass, hrefInvalid && "border-red-400/50")}
        />
        {hrefInvalid && (
          <p className="text-xs text-red-300">
            El link tiene que ser una ruta interna que empiece con “/”.
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-foreground-subtle">
          Se publica en Nostr y llega a todos los usuarios. No se puede borrar.
        </span>
        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={!canSend}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-nostr/40 bg-nostr/15 px-4 py-2 text-sm font-bold text-nostr transition-colors hover:bg-nostr/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            Enviar a todos
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="inline-flex min-h-10 items-center rounded-xl border border-border px-3 py-2 text-sm font-semibold text-foreground-muted hover:text-foreground"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={send}
              disabled={busy}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-bitcoin/40 bg-bitcoin px-4 py-2 text-sm font-bold text-black transition-colors hover:bg-lightning disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Confirmar envío
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
