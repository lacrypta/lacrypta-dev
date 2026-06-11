"use client";

import { useEffect } from "react";
import { Loader2, UserMinus, X } from "lucide-react";

function unfollowInitials(name: string): string {
  const parts = name
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .trim()
    .split(/\s+/);
  if (parts.length === 0 || !parts[0]) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0]! + parts[1]![0]!).toUpperCase();
}

/** Styled confirmation dialog shown before removing someone from your follows. */
export default function ConfirmUnfollow({
  open,
  busy,
  targetName,
  targetAvatar,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  targetName: string;
  targetAvatar?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cancelar"
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
        onClick={onCancel}
      />
      <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-border-strong bg-background-card shadow-2xl shadow-black/50">
        {/* Red glow bleeding from the top, behind the avatar. */}
        <span
          aria-hidden
          className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 h-44 w-44 rounded-full bg-danger/25 blur-3xl"
        />

        <button
          type="button"
          onClick={onCancel}
          className="absolute right-4 top-4 z-10 text-foreground-subtle hover:text-foreground transition-colors"
          aria-label="Cerrar"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="relative px-6 pb-6 pt-8 text-center">
          {/* Avatar with a danger ring + unfollow badge. */}
          <div className="relative mx-auto w-fit">
            <span className="absolute inset-0 -m-1 rounded-full bg-danger/30 blur-md" />
            {targetAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={targetAvatar}
                alt={targetName}
                referrerPolicy="no-referrer"
                className="relative h-20 w-20 rounded-full object-cover ring-4 ring-background-card bg-background-card grayscale-[0.35]"
              />
            ) : (
              <span className="relative inline-flex h-20 w-20 items-center justify-center rounded-full ring-4 ring-background-card bg-gradient-to-br from-nostr/30 to-bitcoin/30 font-display font-black text-2xl">
                {unfollowInitials(targetName)}
              </span>
            )}
            <span className="absolute -bottom-1 -right-1 inline-flex h-8 w-8 items-center justify-center rounded-full bg-danger text-white ring-4 ring-background-card">
              <UserMinus className="h-4 w-4" strokeWidth={3} />
            </span>
          </div>

          <h2 className="mt-4 font-display font-black text-xl">
            ¿Dejar de seguir?
          </h2>
          <p className="mx-auto mt-1.5 max-w-[18rem] text-sm text-foreground-muted">
            Vas a dejar de seguir a{" "}
            <span className="font-semibold text-foreground">{targetName}</span>.
            Se actualizará tu lista de contactos en Nostr.
          </p>

          <div className="mt-6 flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-xl border border-border bg-white/[0.03] px-4 py-2.5 text-sm font-semibold hover:border-border-strong transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-danger px-4 py-2.5 text-white font-display font-black uppercase tracking-wide text-sm shadow-lg shadow-danger/30 hover:bg-danger/90 hover:shadow-danger/50 disabled:opacity-60 transition-all"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserMinus className="h-4 w-4" strokeWidth={2.75} />
              )}
              Dejar de seguir
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
