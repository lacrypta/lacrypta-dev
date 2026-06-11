"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Loader2, X, Zap } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getSigner } from "@/lib/nostrSigner";
import {
  buildZapRequest,
  createAnonymousSigner,
  getZapRecipientInfo,
  isWeblnAvailable,
  payInvoiceWithWebln,
  requestZapInvoice,
  type ZapRecipientInfo,
} from "@/lib/zap";
import { useToast } from "@/components/Toast";
import { useScrollLock } from "@/lib/useScrollLock";
import { cn } from "@/lib/cn";

const PRESET_AMOUNTS = [21, 100, 500, 1000, 5000, 21000];
const DEFAULT_AMOUNT = 1000;

type Stage = "form" | "invoice" | "done";

function formatSats(n: number): string {
  return n.toLocaleString("es-AR");
}

export default function SoldierZapButton({
  recipientPubkey,
  recipientName,
  lud16,
}: {
  recipientPubkey: string;
  recipientName: string;
  lud16?: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-lightning to-bitcoin text-black font-display font-black text-sm uppercase tracking-wide shadow-lg shadow-lightning/30 hover:shadow-lightning/50 hover:scale-[1.03] active:scale-[0.97] transition-all"
      >
        <Zap className="h-4 w-4" strokeWidth={3} />
        Zapear
      </button>
      <ZapModal
        open={open}
        onClose={() => setOpen(false)}
        recipientPubkey={recipientPubkey}
        recipientName={recipientName}
        lud16={lud16 ?? null}
      />
    </>
  );
}

function ZapModal({
  open,
  onClose,
  recipientPubkey,
  recipientName,
  lud16,
}: {
  open: boolean;
  onClose: () => void;
  recipientPubkey: string;
  recipientName: string;
  lud16: string | null;
}) {
  const { auth } = useAuth();
  const { push } = useToast();
  useScrollLock(open);

  const [stage, setStage] = useState<Stage>("form");
  const [amount, setAmount] = useState<number>(DEFAULT_AMOUNT);
  const [customAmount, setCustomAmount] = useState("");
  const [comment, setComment] = useState("");
  const [info, setInfo] = useState<ZapRecipientInfo | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [invoice, setInvoice] = useState("");
  const [weblnAvailable, setWeblnAvailable] = useState(false);

  // Reset + discover the recipient's zap endpoint each time the modal opens.
  useEffect(() => {
    if (!open) return;
    setStage("form");
    setAmount(DEFAULT_AMOUNT);
    setCustomAmount("");
    setComment("");
    setInvoice("");
    setInfo(null);
    setInfoError(null);
    setWeblnAvailable(isWeblnAvailable());

    let cancelled = false;
    setLoadingInfo(true);
    getZapRecipientInfo(recipientPubkey)
      .then((result) => {
        if (cancelled) return;
        setInfo(result);
        if (!result.zapEndpoint && !result.payEndpoint) {
          setInfoError(
            "Este soldado no tiene una lightning address para recibir pagos.",
          );
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setInfoError(
          error instanceof Error
            ? error.message
            : "No se pudo cargar la info de zaps.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoadingInfo(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, recipientPubkey]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const effectiveAmount = useMemo(() => {
    const parsed = parseInt(customAmount, 10);
    if (customAmount.trim() && Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
    return amount;
  }, [amount, customAmount]);

  if (!open) return null;

  async function handleGenerate() {
    const endpoint = info?.zapEndpoint ?? info?.payEndpoint;
    if (!endpoint) return;
    if (effectiveAmount <= 0) {
      push({ kind: "error", title: "Elegí un monto válido en sats." });
      return;
    }
    setBusy(true);
    try {
      // When the recipient advertises NIP-57, sign a zap request (logged-in
      // users from their own key, otherwise an ephemeral anonymous key). For a
      // plain lightning address we just send a regular LNURL-pay with comment.
      let zapRequest = null;
      if (info?.supportsNostr && info.zapEndpoint) {
        const signer = auth
          ? await getSigner(auth)
          : await createAnonymousSigner();
        zapRequest = await signer.signEvent(
          buildZapRequest({
            senderPubkey: signer.pubkey,
            recipientPubkey,
            sats: effectiveAmount,
            comment: comment.trim(),
          }),
        );
      }
      const pr = await requestZapInvoice({
        endpoint,
        sats: effectiveAmount,
        zapRequest,
        comment: comment.trim(),
      });
      setInvoice(pr);
      setStage("invoice");

      // If WebLN is present, try to pay straight away.
      if (isWeblnAvailable()) {
        await handleWebln(pr);
      }
    } catch (error) {
      push({
        kind: "error",
        title: "No se pudo generar el pago",
        description:
          error instanceof Error ? error.message : "Error desconocido.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleWebln(pr: string) {
    setBusy(true);
    try {
      await payInvoiceWithWebln(pr);
      setStage("done");
      push({
        kind: "success",
        title: "⚡ Zap enviado",
        description: `${formatSats(effectiveAmount)} sats a ${recipientName}.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/cancel|reject|denied|declin|abort|user/i.test(message)) {
        push({
          kind: "error",
          title: "El pago con WebLN falló",
          description: message,
        });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[170] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border-strong bg-background-card shadow-2xl shadow-black/50">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-lightning" strokeWidth={2.5} />
            <h2 className="font-display font-black text-lg">
              Zapear a {recipientName}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-foreground-subtle hover:text-foreground transition-colors"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5">
          {loadingInfo ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-foreground-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Buscando endpoint de zaps…
            </div>
          ) : infoError ? (
            <p className="py-8 text-center text-sm text-foreground-muted">
              {infoError}
            </p>
          ) : stage === "form" ? (
            <ZapForm
              lightningAddress={info?.lightningAddress ?? lud16}
              amount={amount}
              setAmount={setAmount}
              customAmount={customAmount}
              setCustomAmount={setCustomAmount}
              comment={comment}
              setComment={setComment}
              effectiveAmount={effectiveAmount}
              weblnAvailable={weblnAvailable}
              busy={busy}
              onGenerate={handleGenerate}
            />
          ) : stage === "invoice" ? (
            <InvoiceView
              invoice={invoice}
              amount={effectiveAmount}
              weblnAvailable={weblnAvailable}
              busy={busy}
              onWebln={() => handleWebln(invoice)}
            />
          ) : (
            <DoneView amount={effectiveAmount} onClose={onClose} />
          )}
        </div>
      </div>
    </div>
  );
}

function ZapForm({
  lightningAddress,
  amount,
  setAmount,
  customAmount,
  setCustomAmount,
  comment,
  setComment,
  effectiveAmount,
  weblnAvailable,
  busy,
  onGenerate,
}: {
  lightningAddress?: string | null;
  amount: number;
  setAmount: (n: number) => void;
  customAmount: string;
  setCustomAmount: (s: string) => void;
  comment: string;
  setComment: (s: string) => void;
  effectiveAmount: number;
  weblnAvailable: boolean;
  busy: boolean;
  onGenerate: () => void;
}) {
  return (
    <div className="space-y-5">
      {lightningAddress && (
        <p className="text-xs font-mono text-lightning flex items-center gap-1.5">
          <Zap className="h-3 w-3" />
          {lightningAddress}
        </p>
      )}

      <div>
        <label className="block text-[10px] font-mono uppercase tracking-widest text-foreground-subtle mb-2">
          Monto (sats)
        </label>
        <div className="grid grid-cols-3 gap-2">
          {PRESET_AMOUNTS.map((preset) => {
            const active = !customAmount.trim() && amount === preset;
            return (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  setAmount(preset);
                  setCustomAmount("");
                }}
                className={cn(
                  "rounded-xl border px-3 py-2 text-sm font-mono font-bold tabular-nums transition-colors",
                  active
                    ? "border-lightning bg-lightning/15 text-lightning"
                    : "border-border bg-white/[0.03] text-foreground-muted hover:border-lightning/50",
                )}
              >
                {formatSats(preset)}
              </button>
            );
          })}
        </div>
        <input
          type="number"
          min={1}
          inputMode="numeric"
          value={customAmount}
          onChange={(e) => setCustomAmount(e.target.value)}
          placeholder="Otro monto…"
          className="mt-2 w-full rounded-xl border border-border bg-white/[0.03] px-3 py-2 text-sm font-mono tabular-nums outline-none focus:border-lightning/60"
        />
      </div>

      <div>
        <label className="block text-[10px] font-mono uppercase tracking-widest text-foreground-subtle mb-2">
          Mensaje (opcional)
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          maxLength={280}
          placeholder="¡Gran trabajo!"
          className="w-full resize-none rounded-xl border border-border bg-white/[0.03] px-3 py-2 text-sm outline-none focus:border-lightning/60"
        />
      </div>

      <button
        type="button"
        disabled={busy || effectiveAmount <= 0}
        onClick={onGenerate}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-lightning to-bitcoin px-4 py-3 text-black font-display font-black uppercase tracking-wide shadow-lg shadow-lightning/30 hover:shadow-lightning/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Zap className="h-4 w-4" strokeWidth={3} />
        )}
        {weblnAvailable
          ? `Pagar ${formatSats(effectiveAmount)} sats con WebLN`
          : `Generar invoice · ${formatSats(effectiveAmount)} sats`}
      </button>
    </div>
  );
}

function InvoiceView({
  invoice,
  amount,
  weblnAvailable,
  busy,
  onWebln,
}: {
  invoice: string;
  amount: number;
  weblnAvailable: boolean;
  busy: boolean;
  onWebln: () => void;
}) {
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    import("qrcode")
      .then((qr) =>
        qr.toDataURL(invoice.toUpperCase(), {
          margin: 1,
          width: 240,
          color: { dark: "#0b0f1a", light: "#ffffff" },
        }),
      )
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl("");
      });
    return () => {
      cancelled = true;
    };
  }, [invoice]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(invoice);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-center text-sm text-foreground-muted">
        Escaneá o pegá la invoice de{" "}
        <span className="font-mono font-bold text-lightning">
          {formatSats(amount)} sats
        </span>{" "}
        en tu wallet.
      </p>

      {qrDataUrl && (
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrDataUrl}
            alt="Invoice QR"
            className="rounded-xl border border-border bg-white p-2"
            width={240}
            height={240}
          />
        </div>
      )}

      <a
        href={`lightning:${invoice}`}
        className="block w-full truncate rounded-xl border border-border bg-white/[0.03] px-3 py-2 text-center text-xs font-mono text-foreground-muted hover:border-lightning/50 transition-colors"
        title={invoice}
      >
        {invoice}
      </a>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={copy}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-white/[0.03] px-3 py-2.5 text-sm font-semibold hover:border-lightning/50 transition-colors"
        >
          {copied ? (
            <Check className="h-4 w-4 text-lightning" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
          {copied ? "Copiada" : "Copiar"}
        </button>
        {weblnAvailable && (
          <button
            type="button"
            disabled={busy}
            onClick={onWebln}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-lightning to-bitcoin px-3 py-2.5 text-black font-display font-black uppercase tracking-wide text-sm disabled:opacity-50 transition-all"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Zap className="h-4 w-4" strokeWidth={3} />
            )}
            WebLN
          </button>
        )}
      </div>
    </div>
  );
}

function DoneView({
  amount,
  onClose,
}: {
  amount: number;
  onClose: () => void;
}) {
  return (
    <div className="space-y-4 py-4 text-center">
      <div className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full bg-lightning/15 text-lightning">
        <Zap className="h-8 w-8" strokeWidth={2.5} />
      </div>
      <div>
        <p className="font-display font-black text-xl">¡Zap enviado!</p>
        <p className="mt-1 text-sm text-foreground-muted">
          {formatSats(amount)} sats en camino. ⚡
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="w-full rounded-xl border border-border bg-white/[0.03] px-4 py-2.5 text-sm font-semibold hover:border-lightning/50 transition-colors"
      >
        Cerrar
      </button>
    </div>
  );
}
