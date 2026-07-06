"use client";

/**
 * Example trigger for the user→user notification backbone: request the project's
 * author to pitch their project. Sends a `pitch-request` app-notification
 * (kind 1616). Hidden for logged-out viewers and for the author themselves.
 */
import { useState } from "react";
import { Check, Handshake, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getSigner } from "@/lib/nostrSigner";
import { sendAppNotification } from "@/lib/notifications/appNotificationEvent";
import { useToast } from "@/components/Toast";

export default function RequestPitchButton({
  recipientPubkey,
  projectId,
  projectName,
}: {
  recipientPubkey?: string;
  projectId: string;
  projectName: string;
}) {
  const { auth } = useAuth();
  const { push } = useToast();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  if (!recipientPubkey || !auth || auth.pubkey === recipientPubkey) return null;

  async function request() {
    if (busy || sent || !auth || !recipientPubkey) return;
    setBusy(true);
    let signer: Awaited<ReturnType<typeof getSigner>> | null = null;
    try {
      signer = await getSigner(auth);
      await sendAppNotification(signer, {
        recipientPubkey,
        ntype: "pitch-request",
        title: `Te pidieron un pitch de ${projectName}`,
        body: "Alguien de la comunidad quiere ver un pitch de tu proyecto.",
        meta: { projectId },
      });
      setSent(true);
      push({
        kind: "success",
        title: "Pitch solicitado",
        description: "Le va a llegar una notificación al equipo.",
      });
    } catch (e) {
      push({
        kind: "error",
        title: "No se pudo solicitar el pitch",
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      await signer?.close?.().catch(() => {});
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={request}
      disabled={busy || sent}
      className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-bitcoin/35 bg-bitcoin/10 px-4 py-2 text-sm font-bold text-bitcoin transition-colors hover:bg-bitcoin/15 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : sent ? (
        <Check className="h-4 w-4" />
      ) : (
        <Handshake className="h-4 w-4" />
      )}
      {sent ? "Pitch solicitado" : "Solicitar pitch"}
    </button>
  );
}
