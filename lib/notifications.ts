"use client";

/**
 * Notification aggregation engine + `useNotifications()` hook.
 *
 * - Instant paint from localStorage caches, then a LIVE relay subscription
 *   (one shared pool, one sub per relay-source) streams new events while mounted.
 * - Relay events pass a join floor (`installedAt`) with a first-seen timestamp
 *   clamp; static (schedule-derived) sources are recomputed and exempt.
 * - Read/seen state lives in localStorage + a kind-30078 event (`readState.ts`),
 *   updated optimistically and republished (merged) after a debounce.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "./auth";
import { getSigner } from "./nostrSigner";
import { fetchLacryptaBadgePubkeys } from "./hackathonBadgeClient";
import { fetchContactList, getCachedContactList } from "./follows";
import { DEFAULT_RELAYS, mergeDataRelays } from "./nostrRelayConfig";
import {
  ENABLED_RELAY_SOURCES,
  ENABLED_STATIC_SOURCES,
} from "./notifications/registry";
import {
  STATIC_NOTIFICATION_TYPES,
  type AppNotification,
  type NostrEventLike,
  type NotificationSourceCtx,
  type NotificationType,
  type ReadState,
  type RelayNotificationSource,
} from "./notifications/types";
import {
  countUnread,
  effectiveCreatedAt,
  emptyReadState,
  isUnread,
  mergeReadState,
  nowSec,
  passesJoinFloor,
  pruneReadState,
} from "./notifications/logic";
import {
  fetchRemoteReadState,
  getCachedReadState,
  getOrCreateReadState,
  onReadStateChanged,
  publishReadState,
  setCachedReadState,
} from "./notifications/readState";

const ITEMS_PREFIX = "labs:notifications:items:v1:";
const SEEN_PREFIX = "labs:notifications:seen:v1:";
const MAX_ITEMS = 200;
const PUBLISH_DEBOUNCE_MS = 1800;

function getCachedItems(pubkey: string): AppNotification[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ITEMS_PREFIX + pubkey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as AppNotification[]) : [];
  } catch {
    return [];
  }
}

function setCachedItems(pubkey: string, items: AppNotification[]): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed = items.slice(0, MAX_ITEMS);
    window.localStorage.setItem(ITEMS_PREFIX + pubkey, JSON.stringify(trimmed));
  } catch {
    /* quota */
  }
}

function getCachedSeen(pubkey: string): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SEEN_PREFIX + pubkey);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function setCachedSeen(pubkey: string, seen: Record<string, number>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SEEN_PREFIX + pubkey, JSON.stringify(seen));
  } catch {
    /* quota */
  }
}

function resolveFollows(pubkey: string): Set<string> {
  const follows = new Set<string>(getCachedContactList(pubkey)?.follows ?? []);
  // Refresh in the background; mutate the live set so new events see fresh trust.
  void fetchContactList(pubkey)
    .then((list) => {
      if (list) for (const f of list.follows) follows.add(f);
    })
    .catch(() => {});
  return follows;
}

type StartLiveHandlers = {
  ingest: (
    ev: NostrEventLike,
    source: RelayNotificationSource,
    ctx: NotificationSourceCtx,
  ) => void;
  onReady: () => void;
};

/** Open one shared pool with a subscription per relay-source; returns teardown. */
function startLive(
  ctx: NotificationSourceCtx,
  { ingest, onReady }: StartLiveHandlers,
): () => void {
  let closed = false;
  let teardown: (() => void) | null = null;

  void (async () => {
    const { SimplePool } = await import("nostr-tools/pool");
    if (closed) return;
    const pool = new SimplePool();
    const relays = mergeDataRelays(DEFAULT_RELAYS);
    const since = ctx.installedAt;
    const closers: { close: () => void }[] = [];

    for (const source of ENABLED_RELAY_SOURCES) {
      for (const filter of source.filters(ctx)) {
        const closer = pool.subscribe(
          relays,
          { ...filter, since } as Parameters<typeof pool.subscribe>[1],
          {
            onevent(ev) {
              ingest(ev as NostrEventLike, source, ctx);
            },
            oneose() {
              onReady();
            },
          },
        );
        closers.push(closer);
      }
    }

    if (closers.length === 0) onReady();

    teardown = () => {
      for (const c of closers) {
        try {
          c.close();
        } catch {
          /* noop */
        }
      }
      try {
        pool.close(relays);
      } catch {
        /* noop */
      }
    };
    if (closed) teardown();
  })();

  return () => {
    closed = true;
    teardown?.();
  };
}

export type UseNotifications = {
  /** Trusted notifications, newest first (dismissed/muted excluded). */
  notifications: AppNotification[];
  /** Untrusted user→user pings — the "Solicitudes" bucket. */
  requests: AppNotification[];
  unreadCount: number;
  loading: boolean;
  hasCache: boolean;
  readState: ReadState;
  refresh: () => void;
  markAllRead: () => void;
  markRead: (id: string) => void;
  dismiss: (id: string) => void;
  muteType: (type: NotificationType) => void;
};

export function useNotifications(): UseNotifications {
  const { auth } = useAuth();
  const pubkey = auth?.pubkey ?? null;

  const [items, setItems] = useState<AppNotification[]>([]);
  const [readState, setReadStateState] = useState<ReadState>(() =>
    emptyReadState(nowSec()),
  );
  const [loading, setLoading] = useState(false);
  const [hasCache, setHasCache] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const itemsMapRef = useRef(new Map<string, AppNotification>());
  const firstSeenRef = useRef<Record<string, number>>({});
  const readStateRef = useRef<ReadState>(readState);
  const authRef = useRef(auth);
  const publishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  authRef.current = auth;

  const applyReadState = useCallback((next: ReadState) => {
    readStateRef.current = next;
    setReadStateState(next);
  }, []);

  // ── Engine ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!pubkey) {
      itemsMapRef.current = new Map();
      firstSeenRef.current = {};
      setItems([]);
      applyReadState(emptyReadState(nowSec()));
      setHasCache(false);
      setLoading(false);
      return;
    }

    let cancelled = false;
    let stopLive: (() => void) | null = null;
    const ctxHolder = { current: null as NotificationSourceCtx | null };

    const commit = () => {
      if (cancelled) return;
      const arr = [...itemsMapRef.current.values()].sort(
        (a, b) => b.createdAt - a.createdAt,
      );
      setItems(arr);
      setCachedItems(pubkey, arr);
    };

    const upsert = (n: AppNotification): boolean => {
      const existing = itemsMapRef.current.get(n.id);
      if (
        existing &&
        existing.createdAt >= n.createdAt &&
        existing.trusted === n.trusted
      ) {
        return false;
      }
      itemsMapRef.current.set(n.id, n);
      return true;
    };

    const ingest = (
      ev: NostrEventLike,
      source: RelayNotificationSource,
      ctx: NotificationSourceCtx,
    ) => {
      const n = source.normalize(ev, ctx);
      if (!n) return;
      let seen = firstSeenRef.current[n.id];
      if (seen === undefined) {
        seen = ctx.now;
        firstSeenRef.current[n.id] = seen;
        setCachedSeen(pubkey, firstSeenRef.current);
      }
      n.createdAt = effectiveCreatedAt(n.createdAt, seen);
      if (!passesJoinFloor(n, ctx.installedAt)) return;
      if (upsert(n)) commit();
    };

    const applyStatic = (ctx: NotificationSourceCtx) => {
      for (const [id, n] of itemsMapRef.current) {
        if (STATIC_NOTIFICATION_TYPES.has(n.type)) itemsMapRef.current.delete(id);
      }
      for (const source of ENABLED_STATIC_SOURCES) {
        for (const n of source.compute(ctx)) {
          if (firstSeenRef.current[n.id] === undefined) {
            firstSeenRef.current[n.id] = ctx.now;
          }
          itemsMapRef.current.set(n.id, n);
        }
      }
      commit();
    };

    // 1. Hydrate synchronously from caches.
    firstSeenRef.current = getCachedSeen(pubkey);
    const cachedItems = getCachedItems(pubkey);
    itemsMapRef.current = new Map(cachedItems.map((n) => [n.id, n]));
    const rs = getOrCreateReadState(pubkey);
    applyReadState(rs);
    setHasCache(cachedItems.length > 0);
    commit();

    // 2. Resolve context, run static sources, open the live subscription.
    setLoading(true);
    void (async () => {
      const follows = resolveFollows(pubkey);
      const pubkeys = await fetchLacryptaBadgePubkeys().catch(() => ({
        publisherPubkey: "",
        adminPubkey: "",
      }));
      if (cancelled) return;
      const ctx: NotificationSourceCtx = {
        pubkey,
        publisherPubkey: pubkeys.publisherPubkey || null,
        follows,
        installedAt: rs.installedAt,
        now: nowSec(),
      };
      ctxHolder.current = ctx;
      applyStatic(ctx);

      // Plaintext-only remote read-state merge (no signer → no decrypt prompt).
      void fetchRemoteReadState(pubkey)
        .then((remote) => {
          if (cancelled || !remote) return;
          const merged = pruneReadState(
            mergeReadState(readStateRef.current, remote),
          );
          applyReadState(merged);
          setCachedReadState(pubkey, merged);
        })
        .catch(() => {});

      stopLive = startLive(ctx, {
        ingest,
        onReady: () => {
          if (!cancelled) setLoading(false);
        },
      });
    })();

    // Static recompute + pause/resume the live sub with tab visibility.
    const restart = () => {
      const ctx = ctxHolder.current;
      if (!ctx) return;
      const next = { ...ctx, now: nowSec() };
      ctxHolder.current = next;
      applyStatic(next);
      stopLive?.();
      stopLive = startLive(next, { ingest, onReady: () => {} });
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") restart();
      else {
        stopLive?.();
        stopLive = null;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    const staticInterval = setInterval(() => {
      if (document.visibilityState === "visible" && ctxHolder.current) {
        const next = { ...ctxHolder.current, now: nowSec() };
        ctxHolder.current = next;
        applyStatic(next);
      }
    }, 5 * 60 * 1000);

    const offReadState = onReadStateChanged((pk) => {
      if (pk !== pubkey) return;
      const stored = getCachedReadState(pubkey);
      if (stored) applyReadState(stored);
    });

    return () => {
      cancelled = true;
      stopLive?.();
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(staticInterval);
      offReadState();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pubkey, refreshNonce, applyReadState]);

  // ── Mutations ───────────────────────────────────────────────────────────────
  const schedulePublish = useCallback(() => {
    if (publishTimerRef.current) clearTimeout(publishTimerRef.current);
    publishTimerRef.current = setTimeout(async () => {
      const a = authRef.current;
      if (!a) return;
      let signer: Awaited<ReturnType<typeof getSigner>> | null = null;
      try {
        signer = await getSigner(a);
        const merged = await publishReadState(signer, readStateRef.current);
        readStateRef.current = merged;
        setReadStateState(merged);
        setCachedReadState(a.pubkey, merged);
      } catch {
        /* keep local state; retry on next mutation */
      } finally {
        await signer?.close?.().catch(() => {});
      }
    }, PUBLISH_DEBOUNCE_MS);
  }, []);

  const mutate = useCallback(
    (fn: (state: ReadState) => ReadState) => {
      if (!pubkey) return;
      const next = pruneReadState(fn(readStateRef.current));
      readStateRef.current = next;
      setReadStateState(next);
      setCachedReadState(pubkey, next);
      schedulePublish();
    },
    [pubkey, schedulePublish],
  );

  const markAllRead = useCallback(() => {
    mutate((s) => {
      const unreadIds = [...itemsMapRef.current.values()]
        .filter((n) => isUnread(n, s))
        .map((n) => n.id);
      return {
        ...s,
        lastReadAt: Math.max(s.lastReadAt, nowSec()),
        readIds: [...s.readIds, ...unreadIds],
      };
    });
  }, [mutate]);

  const markRead = useCallback(
    (id: string) => mutate((s) => ({ ...s, readIds: [...s.readIds, id] })),
    [mutate],
  );

  const dismiss = useCallback(
    (id: string) =>
      mutate((s) => ({ ...s, dismissedIds: [...s.dismissedIds, id] })),
    [mutate],
  );

  const muteType = useCallback(
    (type: NotificationType) =>
      mutate((s) => ({ ...s, mutedTypes: [...s.mutedTypes, type] })),
    [mutate],
  );

  const refresh = useCallback(() => setRefreshNonce((n) => n + 1), []);

  // ── Derived views ─────────────────────────────────────────────────────────
  const visible = useMemo(
    () =>
      items.filter(
        (n) =>
          !readState.dismissedIds.includes(n.id) &&
          !readState.mutedTypes.includes(n.type),
      ),
    [items, readState],
  );
  const notifications = useMemo(() => visible.filter((n) => n.trusted), [visible]);
  const requests = useMemo(() => visible.filter((n) => !n.trusted), [visible]);
  const unreadCount = useMemo(
    () => countUnread(notifications, readState),
    [notifications, readState],
  );

  return {
    notifications,
    requests,
    unreadCount,
    loading,
    hasCache,
    readState,
    refresh,
    markAllRead,
    markRead,
    dismiss,
    muteType,
  };
}
