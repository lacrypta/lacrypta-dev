"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { Award, Check, Loader2, Save, X } from "lucide-react";
import { useToast } from "@/components/Toast";
import { useScrollLock } from "@/lib/useScrollLock";
import { cn } from "@/lib/cn";
import type { Auth } from "@/lib/auth";
import { getSigner } from "@/lib/nostrSigner";
import {
  publishProfileBadges,
  type AwardedBadge,
  type ProfileBadges,
} from "@/lib/nostrBadges";

export default function BadgesModal({
  open,
  onClose,
  auth,
  badges,
  loading,
  profileBadges,
  onProfileBadgesUpdated,
}: {
  open: boolean;
  onClose: () => void;
  auth: Auth;
  badges: AwardedBadge[];
  loading: boolean;
  profileBadges: ProfileBadges | null;
  onProfileBadgesUpdated: (pb: ProfileBadges) => void;
}) {
  const { push: pushToast } = useToast();
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);

  useScrollLock(open);

  // Hydrate selection from the live profile_badges whenever the modal opens.
  useEffect(() => {
    if (!open) return;
    setSelected(profileBadges?.aTags ?? []);
    setFocused(null);
  }, [open, profileBadges]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, saving]);

  const currentATags = useMemo(
    () => new Set(profileBadges?.aTags ?? []),
    [profileBadges],
  );
  const dirty = useMemo(() => {
    if (selected.length !== currentATags.size) return true;
    return selected.some((a) => !currentATags.has(a));
  }, [selected, currentATags]);

  function toggle(aTag: string) {
    if (saving) return;
    setSelected((prev) =>
      prev.includes(aTag) ? prev.filter((a) => a !== aTag) : [...prev, aTag],
    );
  }

  const focusedBadge = useMemo(
    () => badges.find((b) => b.aTag === focused) ?? null,
    [badges, focused],
  );

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    let signer: Awaited<ReturnType<typeof getSigner>> | null = null;
    try {
      signer = await getSigner(auth, {
        onAuthUrl: (url) => {
          pushToast({
            kind: "info",
            title: "Autorizá en tu bunker",
            description: url,
            duration: 15000,
          });
          try {
            window.open(url, "_blank", "noopener,noreferrer");
          } catch {
            /* popup blocked */
          }
        },
      });
      const worn = selected
        .map((a) => badges.find((b) => b.aTag === a))
        .filter((b): b is AwardedBadge => Boolean(b));
      const result = await publishProfileBadges(signer, worn);
      const ok = result.relays.filter((r) => r.ok).length;
      pushToast({
        kind: "success",
        title: "Badges actualizados",
        description: `Publicado en ${ok}/${result.relays.length} relays.`,
      });
      onProfileBadgesUpdated({
        aTags: worn.map((b) => b.aTag),
        eventIdByATag: Object.fromEntries(worn.map((b) => [b.aTag, b.awardId])),
        eventId: result.signed.id,
        eventCreatedAt: result.signed.created_at,
      });
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      pushToast({
        kind: "error",
        title: "No se pudo guardar",
        description: msg,
        duration: 12000,
      });
    } finally {
      signer?.close?.().catch(() => {});
      setSaving(false);
    }
  }

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
            onClick={() => !saving && onClose()}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative w-full max-w-3xl glass-strong rounded-2xl border border-border-strong overflow-hidden flex flex-col max-h-[92vh]"
          >
            <div className="absolute -top-px left-1/2 -translate-x-1/2 w-[40%] h-px bg-gradient-to-r from-transparent via-nostr to-transparent" />

            <div className="relative flex items-center justify-between gap-3 px-6 pt-6 pb-4 border-b border-border">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 shrink-0 rounded-xl bg-nostr/15 border border-nostr/30 flex items-center justify-center">
                  <Award className="h-5 w-5 text-nostr" />
                </div>
                <div className="min-w-0">
                  <h2 className="font-display font-bold text-xl truncate">
                    Mis badges
                  </h2>
                  <p className="text-xs text-foreground-muted">
                    NIP-58 · {badges.length} otorgado
                    {badges.length === 1 ? "" : "s"}
                    {selected.length > 0 && (
                      <>
                        {" · "}
                        <span className="text-nostr">
                          {selected.length} usado
                          {selected.length === 1 ? "" : "s"} en perfil
                        </span>
                      </>
                    )}
                  </p>
                </div>
              </div>
              <button
                onClick={() => !saving && onClose()}
                disabled={saving}
                className="p-2 rounded-lg text-foreground-muted hover:text-foreground hover:bg-white/5 transition-colors disabled:opacity-50"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="relative flex-1 overflow-y-auto px-6 py-5">
              {loading && badges.length === 0 ? (
                <div className="py-16 flex flex-col items-center gap-3 text-foreground-muted">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-xs font-mono uppercase tracking-widest">
                    buscando badges en relays…
                  </span>
                </div>
              ) : badges.length === 0 ? (
                <div className="py-16 flex flex-col items-center gap-3 text-center">
                  <Award className="h-8 w-8 text-foreground-subtle" />
                  <p className="font-display text-lg font-bold">
                    Todavía no recibiste badges
                  </p>
                  <p className="text-xs text-foreground-muted max-w-md">
                    Cuando alguien te otorgue un badge NIP-58 lo vas a ver acá
                    y vas a poder elegir cuáles mostrar en tu perfil.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-[1fr_260px] gap-5">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {badges.map((b) => {
                      const isSelected = selected.includes(b.aTag);
                      const isFocused = focused === b.aTag;
                      return (
                        <ModalBadgeTile
                          key={b.awardId}
                          badge={b}
                          selected={isSelected}
                          focused={isFocused}
                          onToggle={() => toggle(b.aTag)}
                          onFocus={() => setFocused(b.aTag)}
                          disabled={saving}
                        />
                      );
                    })}
                  </div>
                  <aside className="hidden md:block">
                    <div className="sticky top-0 rounded-xl border border-border bg-background-card/70 p-4">
                      <BadgeDetails
                        badge={focusedBadge}
                        worn={
                          focusedBadge
                            ? selected.includes(focusedBadge.aTag)
                            : false
                        }
                        onToggle={() =>
                          focusedBadge && toggle(focusedBadge.aTag)
                        }
                        disabled={saving}
                      />
                    </div>
                  </aside>
                </div>
              )}
            </div>

            <div className="relative flex items-center justify-between gap-3 px-6 py-4 bg-black/30 border-t border-border">
              <div className="text-[11px] text-foreground-subtle font-mono tabular-nums">
                {dirty
                  ? "Hay cambios sin guardar"
                  : "Sincronizado con tu perfil"}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => !saving && onClose()}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-foreground-muted hover:text-foreground hover:bg-white/5 disabled:opacity-50"
                >
                  Cerrar
                </button>
                <button
                  onClick={save}
                  disabled={!dirty || saving}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-nostr to-purple-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Firmando…
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      Guardar selección
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ModalBadgeTile({
  badge,
  selected,
  focused,
  onToggle,
  onFocus,
  disabled,
}: {
  badge: AwardedBadge;
  selected: boolean;
  focused: boolean;
  onToggle: () => void;
  onFocus: () => void;
  disabled: boolean;
}) {
  const def = badge.definition;
  const [imgOk, setImgOk] = useState(true);
  const image = imgOk ? (def?.thumb ?? def?.image) : null;
  const name = def?.name || def?.d || "Badge";

  return (
    <div
      className={cn(
        "relative flex flex-col gap-2 rounded-xl p-3 border bg-background-card/60 transition-all",
        selected
          ? "border-nostr/50 bg-nostr/[0.06]"
          : focused
            ? "border-border-strong"
            : "border-border hover:border-border-strong",
      )}
    >
      <button
        type="button"
        onClick={onFocus}
        className="relative aspect-square w-full rounded-lg overflow-hidden border border-border bg-gradient-to-br from-nostr/10 via-transparent to-bitcoin/5"
        aria-label={`Ver detalles de ${name}`}
      >
        {image ? (
          <img
            src={image}
            alt={name}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgOk(false)}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-nostr">
            <Award className="h-7 w-7" />
          </div>
        )}
        {selected && (
          <div className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-nostr flex items-center justify-center ring-2 ring-background-card">
            <Check className="h-3 w-3 text-white" strokeWidth={3} />
          </div>
        )}
      </button>
      <div className="text-xs font-semibold leading-tight line-clamp-2 min-h-[2rem]">
        {name}
      </div>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-semibold transition-colors disabled:opacity-50",
          selected
            ? "bg-nostr/15 border border-nostr/40 text-nostr hover:bg-nostr/25"
            : "border border-border bg-white/[0.02] hover:bg-white/[0.06] text-foreground-muted hover:text-foreground",
        )}
      >
        {selected ? (
          <>
            <Check className="h-3 w-3" />
            En el perfil
          </>
        ) : (
          <>Usar en perfil</>
        )}
      </button>
    </div>
  );
}

function BadgeDetails({
  badge,
  worn,
  onToggle,
  disabled,
}: {
  badge: AwardedBadge | null;
  worn: boolean;
  onToggle: () => void;
  disabled: boolean;
}) {
  if (!badge) {
    return (
      <div className="text-xs text-foreground-subtle text-center py-8">
        Tocá un badge para ver detalles
      </div>
    );
  }
  const def = badge.definition;
  const image = def?.thumb ?? def?.image;
  const name = def?.name || def?.d || "Badge";
  return (
    <div className="flex flex-col gap-3">
      <div className="aspect-square w-full rounded-lg overflow-hidden border border-border bg-gradient-to-br from-nostr/10 via-transparent to-bitcoin/5 relative">
        {image ? (
          <img
            src={image}
            alt={name}
            className="absolute inset-0 w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-nostr">
            <Award className="h-10 w-10" />
          </div>
        )}
      </div>
      <div>
        <div className="font-display font-bold text-base leading-tight">
          {name}
        </div>
        <div className="text-[10px] font-mono text-foreground-subtle mt-0.5">
          otorgado{" "}
          {new Date(badge.awardedAt * 1000).toLocaleDateString("es-AR", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}
        </div>
      </div>
      {def?.description && (
        <p className="text-xs text-foreground-muted leading-relaxed whitespace-pre-wrap">
          {def.description}
        </p>
      )}
      <div className="text-[10px] font-mono text-foreground-subtle">
        <span className="text-foreground-muted">issuer</span>{" "}
        {badge.issuer.slice(0, 10)}…{badge.issuer.slice(-6)}
      </div>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        className={cn(
          "inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50",
          worn
            ? "bg-nostr/15 border border-nostr/40 text-nostr hover:bg-nostr/25"
            : "bg-nostr text-white hover:bg-purple-600",
        )}
      >
        {worn ? (
          <>
            <Check className="h-3.5 w-3.5" />
            Usándolo en el perfil
          </>
        ) : (
          <>Usar en perfil</>
        )}
      </button>
    </div>
  );
}
