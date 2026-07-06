"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, BellRing } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { useNotifications } from "@/lib/notifications";
import type { AppNotification } from "@/lib/notifications/types";
import NotificationList from "./NotificationList";

export default function NotificationBell() {
  const router = useRouter();
  const n = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const activate = (item: AppNotification) => {
    n.markRead(item.id);
    if (item.href) router.push(item.href);
    setOpen(false);
  };

  const badge = n.unreadCount > 99 ? "99+" : String(n.unreadCount);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notificaciones"
        aria-expanded={open}
        className={cn(
          "relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-white/[0.03] text-foreground-muted transition-all hover:bg-white/[0.06] hover:text-foreground hover:border-border-strong",
          open && "text-foreground border-border-strong",
        )}
      >
        {n.unreadCount > 0 ? (
          <BellRing className="h-[18px] w-[18px]" />
        ) : (
          <Bell className="h-[18px] w-[18px]" />
        )}
        {n.unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-bitcoin px-1 text-[10px] font-bold leading-none text-black">
            {badge}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute right-0 top-full z-50 mt-2 w-[min(92vw,380px)] overflow-hidden rounded-xl border border-border bg-background-elevated shadow-xl"
          >
            <NotificationList
              notifications={n.notifications}
              requests={n.requests}
              readState={n.readState}
              loading={n.loading}
              unreadCount={n.unreadCount}
              onActivate={activate}
              onDismiss={n.dismiss}
              onMarkAllRead={n.markAllRead}
            />
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="block border-t border-border px-4 py-2.5 text-center text-xs font-semibold text-bitcoin transition-colors hover:bg-white/[0.04]"
            >
              Ver todas
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
