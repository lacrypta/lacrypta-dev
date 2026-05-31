"use client";

import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { setAuth } from "@/lib/auth";

type Phase = "loading" | "success" | "error";

export default function EmailLoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [phase, setPhase] = useState<Phase>("loading");
  const [message, setMessage] = useState("Validando enlace de ingreso...");

  useEffect(() => {
    let cancelled = false;
    const token = searchParams.get("token")?.trim();
    if (!token) {
      setPhase("error");
      setMessage("El enlace no incluye token de ingreso.");
      return;
    }

    async function consume() {
      try {
        const res = await fetch("/api/auth/email/consume", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = (await res.json()) as {
          error?: string;
          nsec?: string;
          pubkey?: string;
        };
        if (!res.ok || !data.nsec || !data.pubkey) {
          throw new Error(data.error || "No se pudo validar el enlace.");
        }

        const { decode } = await import("nostr-tools/nip19");
        const decoded = decode(data.nsec);
        if (decoded.type !== "nsec") throw new Error("El enlace no devolvio un nsec valido.");
        if (cancelled) return;
        setAuth({
          method: "local",
          pubkey: data.pubkey,
          localSecret: Array.from(decoded.data as Uint8Array),
        });
        setPhase("success");
        setMessage("Listo. Entrando a tu dashboard...");
        window.setTimeout(() => router.replace("/dashboard"), 600);
      } catch (error) {
        if (cancelled) return;
        setPhase("error");
        setMessage(
          error instanceof Error ? error.message : "No se pudo validar el enlace.",
        );
      }
    }

    consume();
    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  return (
    <main className="min-h-screen px-6 pt-28 pb-16">
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-background-card/80 p-6 text-center shadow-xl">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-white/[0.03]">
          {phase === "loading" ? (
            <Loader2 className="h-6 w-6 animate-spin text-bitcoin" />
          ) : phase === "success" ? (
            <CheckCircle2 className="h-6 w-6 text-success" />
          ) : (
            <AlertCircle className="h-6 w-6 text-danger" />
          )}
        </div>
        <h1 className="font-display text-2xl font-bold">
          {phase === "error" ? "No pudimos ingresar" : "Ingreso por email"}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
          {message}
        </p>
        {phase === "error" && (
          <button
            type="button"
            onClick={() => router.replace("/")}
            className="mt-5 inline-flex items-center justify-center rounded-xl border border-border bg-white/[0.03] px-4 py-2 text-sm font-semibold text-foreground-muted transition-colors hover:bg-white/[0.06] hover:text-foreground"
          >
            Volver al inicio
          </button>
        )}
      </div>
    </main>
  );
}
