"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, UserCheck, UserMinus, UserPlus, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import {
  fetchFollowStatus,
  getCachedContactList,
  onContactsChanged,
  setFollow,
  type FollowStatus,
} from "@/lib/follows";
import { useScrollLock } from "@/lib/useScrollLock";
import { cn } from "@/lib/cn";
import LoginModal from "@/components/LoginModal";
import ConfirmUnfollow from "../ConfirmUnfollow";

export default function SoldierFollowButton({
  recipientPubkey,
  recipientName,
  recipientAvatar,
}: {
  recipientPubkey: string;
  recipientName: string;
  recipientAvatar?: string | null;
}) {
  const { auth, ready } = useAuth();
  const { push } = useToast();
  const me = auth?.pubkey ?? null;
  const isSelf = !!me && me === recipientPubkey;

  const [status, setStatus] = useState<FollowStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [pendingFollow, setPendingFollow] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useScrollLock(confirmOpen);

  // Load the follow relationship once we know who the viewer is.
  useEffect(() => {
    if (!ready) return;
    if (!me || isSelf) {
      setStatus(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    // Instant optimistic seed from the cached contact list.
    const cached = getCachedContactList(me);
    if (cached) {
      setStatus((prev) => ({
        iFollow: cached.follows.includes(recipientPubkey),
        followsMe: prev?.followsMe ?? false,
      }));
    }

    fetchFollowStatus(me, recipientPubkey)
      .then((res) => {
        if (!cancelled) setStatus(res);
      })
      .catch(() => {
        /* keep whatever the cache gave us */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ready, me, isSelf, recipientPubkey]);

  // Keep `iFollow` in sync when the list changes elsewhere (another tab, the
  // dashboard, a second follow button on screen).
  useEffect(() => {
    if (!me || isSelf) return;
    return onContactsChanged((pk) => {
      if (pk !== me) return;
      const cached = getCachedContactList(me);
      if (!cached) return;
      setStatus((prev) => ({
        iFollow: cached.follows.includes(recipientPubkey),
        followsMe: prev?.followsMe ?? false,
      }));
    });
  }, [me, isSelf, recipientPubkey]);

  const doFollow = useCallback(
    async (next: boolean) => {
      if (!auth) return;
      setBusy(true);
      setStatus((prev) => ({
        iFollow: next,
        followsMe: prev?.followsMe ?? false,
      }));
      try {
        await setFollow(auth, recipientPubkey, next);
        push({
          kind: "success",
          title: next
            ? `Siguiendo a ${recipientName}`
            : `Dejaste de seguir a ${recipientName}`,
        });
      } catch (error) {
        // Revert the optimistic flip.
        setStatus((prev) => ({
          iFollow: !next,
          followsMe: prev?.followsMe ?? false,
        }));
        push({
          kind: "error",
          title: "No se pudo actualizar el seguimiento",
          description:
            error instanceof Error ? error.message : "Error desconocido.",
        });
      } finally {
        setBusy(false);
      }
    },
    [auth, recipientPubkey, recipientName, push],
  );

  // Resume a follow intent that was deferred behind the login flow.
  const pendingRef = useRef(pendingFollow);
  pendingRef.current = pendingFollow;
  useEffect(() => {
    if (auth && pendingRef.current) {
      setPendingFollow(false);
      setLoginOpen(false);
      void doFollow(true);
    }
  }, [auth, doFollow]);

  function handleClick() {
    if (!auth) {
      setPendingFollow(true);
      setLoginOpen(true);
      return;
    }
    if (busy) return;
    // Following already → ask for confirmation before unfollowing.
    if (status?.iFollow) {
      setConfirmOpen(true);
      return;
    }
    void doFollow(true);
  }

  // Don't render a follow button on your own profile.
  if (isSelf) return null;

  const iFollow = status?.iFollow ?? false;
  const followsMe = status?.followsMe ?? false;
  const mutual = iFollow && followsMe;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleClick}
          disabled={busy || (loading && !!me)}
          aria-pressed={iFollow}
          className={cn(
            "group inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-display font-black uppercase tracking-wide transition-all active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60",
            iFollow
              ? "border border-nostr/40 bg-nostr/10 text-nostr hover:border-danger/50 hover:bg-danger/10 hover:text-danger"
              : "bg-gradient-to-r from-nostr to-purple-500 text-white shadow-lg shadow-nostr/30 hover:shadow-nostr/50 hover:scale-[1.03]",
          )}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : iFollow ? (
            <>
              {/* Swap to "unfollow" affordance on hover. */}
              <UserCheck className="h-4 w-4 group-hover:hidden" strokeWidth={3} />
              <UserMinus
                className="hidden h-4 w-4 group-hover:inline"
                strokeWidth={3}
              />
              <span className="group-hover:hidden">Siguiendo</span>
              <span className="hidden group-hover:inline">Dejar de seguir</span>
            </>
          ) : (
            <>
              <UserPlus className="h-4 w-4" strokeWidth={3} />
              Seguir
            </>
          )}
        </button>

        {/* Relationship status badges. */}
        {mutual ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-nostr/40 bg-nostr/10 px-2.5 py-1 text-[11px] font-mono font-bold uppercase tracking-wider text-nostr">
            <Users className="h-3 w-3" strokeWidth={3} />
            Se siguen
          </span>
        ) : followsMe ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-white/[0.04] px-2.5 py-1 text-[11px] font-mono font-bold uppercase tracking-wider text-foreground-muted">
            <UserCheck className="h-3 w-3" strokeWidth={3} />
            Te sigue
          </span>
        ) : null}
      </div>

      <LoginModal
        open={loginOpen}
        onClose={() => {
          setLoginOpen(false);
          setPendingFollow(false);
        }}
      />

      <ConfirmUnfollow
        open={confirmOpen}
        busy={busy}
        targetName={recipientName}
        targetAvatar={recipientAvatar}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          void doFollow(false);
        }}
      />
    </>
  );
}
