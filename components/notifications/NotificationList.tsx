"use client";

import { useState } from "react";
import { Bell, CheckCheck, ChevronDown, Inbox, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import NotificationItem from "./NotificationItem";
import { groupByBucket } from "@/lib/notifications/format";
import { isUnread } from "@/lib/notifications/logic";
import type { AppNotification, ReadState } from "@/lib/notifications/types";

export default function NotificationList({
  notifications,
  requests,
  readState,
  loading,
  unreadCount,
  onActivate,
  onDismiss,
  onMarkAllRead,
  scrollable = true,
}: {
  notifications: AppNotification[];
  requests: AppNotification[];
  readState: ReadState;
  loading: boolean;
  unreadCount: number;
  onActivate: (n: AppNotification) => void;
  onDismiss: (id: string) => void;
  onMarkAllRead: () => void;
  /** Constrain height + scroll (dropdown). false → full-page flow. */
  scrollable?: boolean;
}) {
  const [showRequests, setShowRequests] = useState(false);
  const groups = groupByBucket(notifications);
  const isEmpty = notifications.length === 0 && requests.length === 0;

  return (
    <div className="flex flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="font-display text-sm font-bold">Notificaciones</h2>
        <button
          type="button"
          onClick={onMarkAllRead}
          disabled={unreadCount === 0}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground-muted transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          <CheckCheck className="h-3.5 w-3.5" />
          Marcar todo como leído
        </button>
      </header>

      <div
        className={cn(
          "divide-y divide-border/60",
          scrollable && "max-h-[60vh] overflow-y-auto",
        )}
      >
        {loading && isEmpty && (
          <div className="flex items-center gap-2 px-4 py-6 text-sm text-foreground-muted">
            <Loader2 className="h-4 w-4 animate-spin text-bitcoin" />
            Buscando notificaciones…
          </div>
        )}

        {!loading && isEmpty && (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-foreground-muted">
            <Bell className="h-6 w-6 text-foreground-subtle" />
            <span className="text-sm">No tenés notificaciones.</span>
          </div>
        )}

        {groups.map((group) => (
          <div key={group.bucket}>
            <div className="bg-background/40 px-4 py-1.5 text-[10px] font-mono uppercase tracking-widest text-foreground-subtle">
              {group.bucket}
            </div>
            {group.items.map((n) => (
              <NotificationItem
                key={n.id}
                notification={n}
                unread={isUnread(n, readState)}
                onActivate={onActivate}
                onDismiss={onDismiss}
              />
            ))}
          </div>
        ))}

        {requests.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowRequests((v) => !v)}
              className="flex w-full items-center justify-between gap-2 bg-background/40 px-4 py-2 text-left text-xs font-semibold text-foreground-muted hover:text-foreground"
            >
              <span className="inline-flex items-center gap-2">
                <Inbox className="h-3.5 w-3.5" />
                Solicitudes ({requests.length})
              </span>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 transition-transform",
                  showRequests && "rotate-180",
                )}
              />
            </button>
            {showRequests &&
              requests.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  unread={false}
                  onActivate={onActivate}
                  onDismiss={onDismiss}
                />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
