"use client";

import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { setAuth } from "@/lib/auth";
import { DEFAULT_LOGIN_REDIRECT, safeLoginRedirect } from "@/lib/loginRedirect";
import { fetchNostrProfile } from "@/lib/nostrProfile";

type Phase = "loading" | "success" | "error";

export default function EmailLoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [phase, setPhase] = useState<Phase>("loading");
  const [message, setMessage] = useState("Validando enlace de ingreso...");

  useEffect(() => {
    let cancelled = false;
    let redirectTimer: number | undefined;
    const token = searchParams.get("token")?.trim();
    const fallbackRedirectTo = safeLoginRedirect(
      searchParams.get("next"),
      DEFAULT_LOGIN_REDIRECT,
    );
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
          redirectTo?: string;
        };
        if (!res.ok || !data.nsec || !data.pubkey) {
          throw new Error(data.error || "No se pudo validar el enlace.");
        }
        const redirectTo = safeLoginRedirect(
          data.redirectTo,
          fallbackRedirectTo,
        );

        const { decode } = await import("nostr-tools/nip19");
        const decoded = decode(data.nsec);
        if (decoded.type !== "nsec") throw new Error("El enlace no devolvio un nsec valido.");
        if (cancelled) return;
        setAuth({
          method: "local",
          pubkey: data.pubkey,
          localSecret: Array.from(decoded.data as Uint8Array),
        });

        // New users have no kind:0 profile at all → send them through the
        // onboarding wizard. Any existing kind:0 event counts as "has profile"
        // (sparse metadata still means the user already onboarded).
        let hasProfile = false;
        try {
          const existing = await fetchNostrProfile(data.pubkey, undefined, 2500);
          hasProfile = Boolean(existing);
        } catch {
          /* treat as new user on lookup failure */
        }
        if (cancelled) return;

        setPhase("success");
        if (hasProfile) {
          setMessage("Listo. Volviendo a donde estabas...");
          redirectTimer = window.setTimeout(
            () => router.replace(redirectTo),
            600,
          );
        } else {
          setMessage("Vamos a crear tu perfil...");
          redirectTimer = window.setTimeout(
            () =>
              router.replace(
                `/onboarding?next=${encodeURIComponent(redirectTo)}`,
              ),
            600,
          );
        }
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
      if (redirectTimer !== undefined) window.clearTimeout(redirectTimer);
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
