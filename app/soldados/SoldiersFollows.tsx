"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import { Loader2, UserCheck, UserMinus, UserPlus, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import {
  fetchContactList,
  fetchContactLists,
  getCachedContactList,
  onContactsChanged,
  setFollow,
} from "@/lib/follows";
import { useScrollLock } from "@/lib/useScrollLock";
import { cn } from "@/lib/cn";
import ConfirmUnfollow from "./ConfirmUnfollow";

// Heavy client component (NIP-07/NIP-46/QR flows) on the prerendered soldiers
// list — fetch it the first time the user actually opens the login flow.
const LoginModal = dynamic(() => import("@/components/LoginModal"), {
  ssr: false,
});

function isHexPubkey(value?: string): value is string {
  return !!value && /^[0-9a-f]{64}$/iu.test(value);
}

type FollowsContextValue = {
  me: string | null;
  /** Pubkeys the logged-in user follows. */
  follows: Set<string>;
  /** Pubkeys (among the provided list) that follow the logged-in user back. */
  followsMe: Set<string>;
  /** Optimistically flip a follow locally; reverted by the caller on error. */
  setLocalFollow: (pubkey: string, value: boolean) => void;
};

const FollowsContext = createContext<FollowsContextValue | null>(null);

/**
 * Shares follow state across the whole soldiers list so we make at most two
 * batched relay round-trips (my contact list + everyone else's) instead of one
 * per card/row.
 */
export function SoldiersFollowsProvider({
  pubkeys,
  children,
}: {
  pubkeys: (string | undefined)[];
  children: ReactNode;
}) {
  const { auth } = useAuth();
  const me = auth?.pubkey ?? null;

  const targets = useMemo(
    () => [...new Set(pubkeys.filter(isHexPubkey))],
    [pubkeys],
  );
  const targetsKey = targets.join(",");

  const [follows, setFollows] = useState<Set<string>>(new Set());
  const [followsMe, setFollowsMe] = useState<Set<string>>(new Set());

  // My own follow set (seed from cache, then confirm against relays).
  useEffect(() => {
    if (!me) {
      setFollows(new Set());
      return;
    }
    const cached = getCachedContactList(me);
    if (cached) setFollows(new Set(cached.follows));

    let cancelled = false;
    fetchContactList(me)
      .then((list) => {
        if (!cancelled && list) setFollows(new Set(list.follows));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [me]);

  // Who (among the listed soldiers) follows me back.
  useEffect(() => {
    if (!me || targets.length === 0) {
      setFollowsMe(new Set());
      return;
    }
    let cancelled = false;
    fetchContactLists(targets)
      .then((map) => {
        if (cancelled) return;
        const next = new Set<string>();
        for (const [pk, list] of map) {
          if (list.follows.includes(me)) next.add(pk);
        }
        setFollowsMe(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [me, targetsKey, targets]);

  // Keep my follow set in sync with changes elsewhere.
  useEffect(() => {
    if (!me) return;
    return onContactsChanged((pk) => {
      if (pk !== me) return;
      const cached = getCachedContactList(me);
      if (cached) setFollows(new Set(cached.follows));
    });
  }, [me]);

  const setLocalFollow = useCallback((pubkey: string, value: boolean) => {
    setFollows((prev) => {
      const next = new Set(prev);
      if (value) next.add(pubkey);
      else next.delete(pubkey);
      return next;
    });
  }, []);

  const value = useMemo<FollowsContextValue>(
    () => ({ me, follows, followsMe, setLocalFollow }),
    [me, follows, followsMe, setLocalFollow],
  );

  return (
    <FollowsContext.Provider value={value}>{children}</FollowsContext.Provider>
  );
}

function useFollows(): FollowsContextValue | null {
  return useContext(FollowsContext);
}

/** Idle/hover label pair. In compact mode the text only appears from `lg` up. */
function LabelSwap({
  compact,
  idle,
  hover,
}: {
  compact: boolean;
  idle: string;
  hover: string;
}) {
  const inner = (
    <>
      <span className="group-hover:hidden">{idle}</span>
      <span className="hidden group-hover:inline">{hover}</span>
    </>
  );
  if (!compact) return inner;
  return <span className="hidden lg:inline">{inner}</span>;
}

/**
 * Compact follow control + relationship status for list/grid rows. Reads shared
 * state from SoldiersFollowsProvider; renders nothing on your own entry.
 */
export function InlineFollowButton({
  pubkey,
  name,
  avatar,
  className,
  compact = false,
}: {
  pubkey: string;
  name: string;
  avatar?: string | null;
  className?: string;
  /** Icon-only until `lg` to fit dense layouts like the ranking table. */
  compact?: boolean;
}) {
  const ctx = useFollows();
  const { auth } = useAuth();
  const { push } = useToast();

  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [pendingFollow, setPendingFollow] = useState(false);

  useScrollLock(confirmOpen);

  const me = ctx?.me ?? null;
  const isSelf = !!me && me === pubkey;
  const iFollow = ctx?.follows.has(pubkey) ?? false;
  const theyFollowMe = ctx?.followsMe.has(pubkey) ?? false;
  const mutual = iFollow && theyFollowMe;

  const apply = useCallback(
    async (next: boolean) => {
      if (!auth) return;
      setBusy(true);
      ctx?.setLocalFollow(pubkey, next);
      try {
        await setFollow(auth, pubkey, next);
        push({
          kind: "success",
          title: next ? `Siguiendo a ${name}` : `Dejaste de seguir a ${name}`,
        });
      } catch (error) {
        ctx?.setLocalFollow(pubkey, !next);
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
    [auth, ctx, pubkey, name, push],
  );

  // Resume a follow intent deferred behind the login flow.
  useEffect(() => {
    if (auth && pendingFollow) {
      setPendingFollow(false);
      setLoginOpen(false);
      void apply(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth, pendingFollow]);

  if (isSelf) return null;

  function handleClick() {
    if (!auth) {
      setPendingFollow(true);
      setLoginOpen(true);
      return;
    }
    if (busy) return;
    if (iFollow) setConfirmOpen(true);
    else void apply(true);
  }

  const pillVis = compact ? "lg:inline-flex" : "sm:inline-flex";

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {mutual ? (
        <span
          className={cn(
            "hidden items-center gap-1 rounded-full border border-nostr/40 bg-nostr/10 px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider text-nostr",
            pillVis,
          )}
        >
          <Users className="h-2.5 w-2.5" strokeWidth={3} />
          Se siguen
        </span>
      ) : theyFollowMe ? (
        <span
          className={cn(
            "hidden items-center gap-1 rounded-full border border-border bg-white/[0.04] px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider text-foreground-muted",
            pillVis,
          )}
        >
          Te sigue
        </span>
      ) : null}

      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        aria-pressed={iFollow}
        title={iFollow ? `Siguiendo a ${name}` : `Seguir a ${name}`}
        className={cn(
          "group inline-flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-display font-bold uppercase tracking-wide transition-all active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60",
          compact ? "px-2 lg:px-3 lg:min-w-[7rem]" : "px-3 min-w-[7rem]",
          iFollow
            ? "border border-nostr/40 bg-nostr/10 text-nostr hover:border-danger/50 hover:bg-danger/10 hover:text-danger"
            : "bg-nostr text-white shadow-sm shadow-nostr/30 hover:bg-nostr/90",
        )}
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : iFollow ? (
          <>
            <UserCheck className="h-3.5 w-3.5 group-hover:hidden" strokeWidth={3} />
            <UserMinus
              className="hidden h-3.5 w-3.5 group-hover:inline"
              strokeWidth={3}
            />
            <LabelSwap compact={compact} idle="Siguiendo" hover="Dejar" />
          </>
        ) : (
          <>
            <UserPlus className="h-3.5 w-3.5" strokeWidth={3} />
            <span className={compact ? "hidden lg:inline" : undefined}>
              Seguir
            </span>
          </>
        )}
      </button>

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
        targetName={name}
        targetAvatar={avatar}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          void apply(false);
        }}
      />
    </div>
  );
}
