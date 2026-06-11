"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getSigner } from "@/lib/nostrSigner";
import { useToast } from "@/components/Toast";

type Step = "idle" | "signing" | "publishing";

/**
 * Admin-only control on /soldados: recomputes the ranking from all sources
 * (curated + Nostr) and publishes it as the official replaceable snapshot. The
 * server does the heavy lifting (compute + sign with LACRYPTA_NSEC + publish +
 * revalidate); the admin just signs an authorization request. Self-hides for
 * anyone whose pubkey isn't the configured La Crypta admin.
 */
export default function AdminRepublishRanking() {
  const { auth } = useAuth();
  const { push } = useToast();
  const router = useRouter();

  const [adminPubkey, setAdminPubkey] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("idle");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/lacrypta-pubkeys")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { adminPubkey?: string } | null) => {
        if (!cancelled) setAdminPubkey(data?.adminPubkey ?? null);
      })
      .catch(() => {
        if (!cancelled) setAdminPubkey(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isAdmin = !!auth?.pubkey && !!adminPubkey && auth.pubkey === adminPubkey;
  if (!isAdmin) return null;

  const busy = step !== "idle";

  async function handleClick() {
    if (!auth || busy) return;
    setStep("signing");
    try {
      const signer = await getSigner(auth);
      const request = await signer.signEvent({
        kind: 27235,
        pubkey: signer.pubkey,
        created_at: Math.floor(Date.now() / 1000),
        content: "Recompute & publish soldiers ranking",
        tags: [
          ["u", "/api/soldiers/ranking"],
          ["method", "POST"],
          ["action", "publish-soldiers-ranking"],
        ],
      });

      setStep("publishing");
      const res = await fetch("/api/soldiers/ranking", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ request }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        soldierCount?: number;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "No se pudo publicar el ranking.");
      }

      push({
        kind: "success",
        title: "Ranking publicado",
        description: `${data.soldierCount ?? 0} soldados actualizados y cacheados.`,
      });
      router.refresh();
    } catch (error) {
      push({
        kind: "error",
        title: "No se pudo recrear el ranking",
        description:
          error instanceof Error ? error.message : "Error desconocido.",
      });
    } finally {
      setStep("idle");
    }
  }

  const label =
    step === "signing"
      ? "Firmando…"
      : step === "publishing"
        ? "Publicando…"
        : "Recrear ranking";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      title="Recalcular y publicar el ranking oficial (curated + Nostr)"
      className="inline-flex items-center gap-2 rounded-lg border border-nostr/40 bg-nostr/10 px-3 py-1.5 text-[11px] font-mono font-bold uppercase tracking-widest text-nostr hover:bg-nostr/20 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <RefreshCw className="h-3.5 w-3.5" />
      )}
      {label}
    </button>
  );
}
