"use client";

import { AlertTriangle, CheckCircle2, X, Info } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

type ToastKind = "error" | "success" | "info";

type Toast = {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string;
  /** ms — 0 means sticky (user must dismiss) */
  duration?: number;
};

type ToastCtx = {
  push: (t: Omit<Toast, "id">) => string;
  dismiss: (id: string) => void;
};

const ctx = createContext<ToastCtx | null>(null);

export function useToast() {
  const v = useContext(ctx);
  if (!v) throw new Error("useToast must be used within <ToastProvider>");
  return v;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  const push = useCallback<ToastCtx["push"]>(
    (t) => {
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2);
      const duration = t.duration ?? (t.kind === "error" ? 10000 : 4000);
      setToasts((prev) => [...prev, { ...t, id }]);
      if (duration > 0) {
        window.setTimeout(() => dismiss(id), duration);
      }
      return id;
    },
    [dismiss],
  );

  return (
    <ctx.Provider value={{ push, dismiss }}>
      {children}
      <div
        className="fixed top-4 right-4 z-[200] flex flex-col gap-2 w-[min(92vw,380px)] pointer-events-none"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ctx.Provider>
  );
}

const KIND_STYLES: Record<
  ToastKind,
  { bg: string; border: string; text: string; Icon: typeof AlertTriangle }
> = {
  error: {
    bg: "bg-danger/10",
    border: "border-danger/40",
    text: "text-danger",
    Icon: AlertTriangle,
  },
  success: {
    bg: "bg-success/10",
    border: "border-success/40",
    text: "text-success",
    Icon: CheckCircle2,
  },
  info: {
    bg: "bg-cyan/10",
    border: "border-cyan/40",
    text: "text-cyan",
    Icon: Info,
  },
};

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: () => void;
}) {
  const style = KIND_STYLES[toast.kind];
  const Icon = style.Icon;
  return (
    <div
      className={cn(
        "pointer-events-auto relative rounded-xl border backdrop-blur-md glass-strong overflow-hidden",
        style.border,
      )}
      role={toast.kind === "error" ? "alert" : "status"}
    >
      <div
        className={cn(
          "absolute inset-0 pointer-events-none opacity-50",
          style.bg,
        )}
      />
      <div className="relative flex items-start gap-3 px-4 py-3">
        <Icon className={cn("h-5 w-5 shrink-0 mt-0.5", style.text)} />
        <div className="flex-1 min-w-0">
          <div className={cn("text-sm font-semibold", style.text)}>
            {toast.title}
          </div>
          {toast.description && (
            <div className="mt-0.5 text-xs text-foreground-muted whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
              {toast.description}
            </div>
          )}
        </div>
        <button
          onClick={onDismiss}
          className="shrink-0 inline-flex min-h-6 min-w-6 items-center justify-center rounded text-foreground-muted hover:text-foreground hover:bg-white/5"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
