"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useNotifications } from "@/lib/notifications";
import NotificationList from "@/components/notifications/NotificationList";
import AdminBroadcastComposer from "@/components/notifications/AdminBroadcastComposer";
import type { AppNotification } from "@/lib/notifications/types";

export default function NotificationsClient() {
  const { auth, ready } = useAuth();
  const router = useRouter();
  const n = useNotifications();

  const activate = (item: AppNotification) => {
    n.markRead(item.id);
    if (item.href) router.push(item.href);
  };

  return (
    <main className="relative min-h-screen pt-28 pb-16">
      <div className="mx-auto max-w-2xl px-4 sm:px-6">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-widest text-foreground-muted transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver
        </Link>
        <h1 className="mb-6 font-display text-3xl font-bold tracking-tight">
          Notificaciones
        </h1>

        {ready && !auth ? (
          <div className="rounded-2xl border border-border bg-background-card/70 p-8 text-center text-foreground-muted">
            Ingresá para ver tus notificaciones.
          </div>
        ) : (
          <>
            <AdminBroadcastComposer onSent={n.refresh} />
            <div className="overflow-hidden rounded-2xl border border-border bg-background-elevated">
              <NotificationList
                notifications={n.notifications}
                requests={n.requests}
                readState={n.readState}
                loading={n.loading}
                unreadCount={n.unreadCount}
                onActivate={activate}
                onDismiss={n.dismiss}
                onMarkAllRead={n.markAllRead}
                scrollable={false}
              />
            </div>
          </>
        )}
      </div>
    </main>
  );
}
