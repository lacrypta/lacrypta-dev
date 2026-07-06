"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useNostrProfile } from "@/lib/nostrProfile";
import { relativeTime } from "@/lib/notifications/format";
import { typeMeta } from "@/lib/notifications/typeMeta";
import type { AppNotification } from "@/lib/notifications/types";

export default function NotificationItem({
  notification,
  unread,
  onActivate,
  onDismiss,
}: {
  notification: AppNotification;
  unread: boolean;
  onActivate: (n: AppNotification) => void;
  onDismiss: (id: string) => void;
}) {
  const n = notification;
  const { profile } = useNostrProfile(n.actorPubkey ?? null);
  const meta = typeMeta(n.type);
  const Icon = meta.icon;
  const actorName =
    profile?.display_name ||
    profile?.name ||
    (n.actorPubkey ? `${n.actorPubkey.slice(0, 8)}…` : undefined);

  return (
    <div
      className={cn(
        "group relative flex gap-3 px-3 py-3 transition-colors hover:bg-white/[0.04]",
        unread && "bg-white/[0.03]",
      )}
    >
      {unread && (
        <span className="absolute inset-y-0 left-0 w-0.5 bg-bitcoin" aria-hidden />
      )}

      <div className="relative shrink-0">
        {n.actorPubkey && profile?.picture ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.picture}
            alt=""
            referrerPolicy="no-referrer"
            className="h-9 w-9 rounded-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <span
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full border border-border bg-white/[0.04]",
              meta.accent,
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
        )}
        {n.actorPubkey && (
          <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-border bg-background-elevated">
            <Icon className={cn("h-2.5 w-2.5", meta.accent)} />
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={() => onActivate(n)}
        className="min-w-0 flex-1 text-left"
      >
        <div className="text-sm leading-snug text-foreground">{n.title}</div>
        {n.body && (
          <div className="mt-0.5 line-clamp-2 text-xs text-foreground-muted">
            {n.body}
          </div>
        )}
        <div className="mt-1 text-[10px] font-mono uppercase tracking-wider text-foreground-subtle">
          {actorName ? `${actorName} · ` : ""}
          {relativeTime(n.createdAt)}
        </div>
      </button>

      <button
        type="button"
        onClick={() => onDismiss(n.id)}
        aria-label="Descartar notificación"
        className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md text-foreground-subtle opacity-0 transition-opacity hover:bg-white/[0.06] hover:text-foreground focus:opacity-100 group-hover:opacity-100"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
