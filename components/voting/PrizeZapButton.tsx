"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ClipboardList,
  Copy,
  ExternalLink,
  FileJson,
  Loader2,
  ReceiptText,
  ScrollText,
  Trophy,
  X,
  Zap,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getSigner } from "@/lib/nostrSigner";
import type { SignedEvent } from "@/lib/nostrSigner";
import {
  findPrizeZapReceipt,
  getLocalPrizeZapReceipt,
  getLocalPrizeZap,
  payPrizeZap,
  type PrizeZapRecipientPaymentInfo,
  type PrizeZapProgress,
  type PrizeZapProgressStep,
  type PrizeZapRecord,
  type PrizeZapTarget,
} from "@/lib/prizeZaps";
import { formatSats, hackathonSlugForId } from "@/lib/hackathons";
import { useToast } from "@/components/Toast";
import { cn } from "@/lib/cn";

export default function PrizeZapButton({ target }: { target: PrizeZapTarget }) {
  const { auth, signerReady } = useAuth();
  const { push } = useToast();
  const [adminPubkey, setAdminPubkey] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);
  const [receipt, setReceipt] = useState<SignedEvent | null>(null);
  const [localRecord, setLocalRecord] = useState<PrizeZapRecord | null>(null);
  const [proofOpen, setProofOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressLog, setProgressLog] = useState<PrizeZapProgress[]>([]);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [recipientPaymentInfo, setRecipientPaymentInfo] =
    useState<PrizeZapRecipientPaymentInfo | null>(
      target.recipientLightningAddress
        ? {
            lightningAddress: target.recipientLightningAddress,
            zapEndpoint: target.recipientZapEndpoint ?? null,
            source: "lud16",
          }
        : target.recipientZapEndpoint
          ? {
              lightningAddress: null,
              zapEndpoint: target.recipientZapEndpoint,
              source: "zap-endpoint",
            }
        : null,
    );

  const isAdmin = !!auth && !!adminPubkey && auth.pubkey === adminPubkey;
  const disabled = checking || paying || (!paid && !signerReady);

  const label = useMemo(() => {
    if (paid) return "Pagado";
    if (paying) return "Pagando";
    if (checking) return "Chequeando";
    return `Pagar ${formatSats(target.sats)}`;
  }, [checking, paid, paying, target.sats]);

  useEffect(() => {
    // Gate on the ADMIN pubkey (NEXT_PUBLIC_LACRYPTA_ADMIN_NPUB), matching
    // every other admin control (PrizeBadgeButton, VotingSection, ...) — and
    // matching payPrizeZap, which keys the whole flow on the logged-in
    // signer (the admin). The publisher key (LACRYPTA_NSEC) is a different
    // identity and must not gate this button.
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

  useEffect(() => {
    if (!adminPubkey) return;
    const cachedReceipt = getLocalPrizeZapReceipt(target, adminPubkey);
    if (cachedReceipt) {
      setReceipt(cachedReceipt);
      setPaid(true);
      return;
    }
    const local = isAdmin && auth ? getLocalPrizeZap(target, auth.pubkey) : null;
    if (local) {
      setLocalRecord(local);
      setPaid(true);
      return;
    }
    let cancelled = false;
    setChecking(true);
    findPrizeZapReceipt(target, adminPubkey)
      .then((receipt) => {
        if (!cancelled && receipt) {
          setReceipt(receipt);
          setPaid(true);
        }
      })
      .catch(() => {
        /* keep payable if receipt check fails */
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
    // Depend on target's identifying fields, NOT the object reference — callers
    // (e.g. VotingHero) build `target` inline, so a new object every render
    // would re-run this probe endlessly and keep `checking` (→ disabled) stuck.
  }, [
    adminPubkey,
    auth,
    isAdmin,
    target.hackathonId,
    target.projectId,
    target.recipientPubkey,
    target.sats,
    target.position,
  ]);

  useEffect(() => {
    // When the caller pre-resolves the address (the hackathon page fetches the
    // winner's lud16 server-side), use it directly.
    if (target.recipientLightningAddress) {
      setRecipientPaymentInfo({
        lightningAddress: target.recipientLightningAddress,
        zapEndpoint: target.recipientZapEndpoint ?? null,
        source: "lud16",
      });
      return;
    }
    if (target.recipientZapEndpoint) {
      setRecipientPaymentInfo({
        lightningAddress: null,
        zapEndpoint: target.recipientZapEndpoint,
        source: "zap-endpoint",
      });
      return;
    }
    // Otherwise (e.g. the results podium only knows the pubkey), resolve it
    // server-side: profile lud16 → submission nip05 fallback (see
    // /api/prize-recipient). Fills "Destino" and gives the pay step an endpoint.
    if (!target.recipientPubkey) {
      setRecipientPaymentInfo(null);
      return;
    }
    let cancelled = false;
    setRecipientPaymentInfo(null);
    fetch(`/api/prize-recipient?pubkey=${target.recipientPubkey}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((info: PrizeZapRecipientPaymentInfo | null) => {
        if (cancelled) return;
        setRecipientPaymentInfo(
          info?.lightningAddress
            ? {
                lightningAddress: info.lightningAddress,
                zapEndpoint: info.zapEndpoint ?? null,
                source: info.source,
              }
            : { lightningAddress: null, zapEndpoint: null, source: "none" },
        );
      })
      .catch(() => {
        if (!cancelled)
          setRecipientPaymentInfo({
            lightningAddress: null,
            zapEndpoint: null,
            source: "none",
          });
      });
    return () => {
      cancelled = true;
    };
  }, [
    target.recipientLightningAddress,
    target.recipientZapEndpoint,
    target.recipientPubkey,
  ]);

  async function handlePay(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (paid) {
      setProofOpen(true);
      return;
    }
    if (!auth || disabled) return;
    setPaying(true);
    setProgressOpen(true);
    setProgressError(null);
    setProgressLog([]);
    try {
      const signer = await getSigner(auth);
      // Resolve the destination reliably from the server (profile lud16 →
      // submission nip05) instead of depending on the display effect having
      // finished. This keeps payPrizeZap off its flaky client-side profile
      // lookup (the source of "No encontré el perfil Nostr del ganador").
      let lightningAddress =
        target.recipientLightningAddress ??
        recipientPaymentInfo?.lightningAddress ??
        null;
      let zapEndpoint =
        target.recipientZapEndpoint ??
        recipientPaymentInfo?.zapEndpoint ??
        null;
      if (!zapEndpoint && target.recipientPubkey) {
        try {
          const res = await fetch(
            `/api/prize-recipient?pubkey=${target.recipientPubkey}`,
          );
          if (res.ok) {
            const info = (await res.json()) as PrizeZapRecipientPaymentInfo;
            if (info?.zapEndpoint) {
              zapEndpoint = info.zapEndpoint;
              lightningAddress = info.lightningAddress ?? lightningAddress;
            }
          }
        } catch {
          /* fall back to payPrizeZap's own lookup below */
        }
      }
      const effectiveTarget: PrizeZapTarget = {
        ...target,
        recipientLightningAddress: lightningAddress,
        recipientZapEndpoint: zapEndpoint,
      };
      const record = await payPrizeZap(effectiveTarget, signer, (progress) => {
        setProgressLog((prev) => [...prev, progress]);
      });
      setLocalRecord(record);
      setProgressLog((prev) => [
        ...prev,
        {
          step: "recording",
          status: "active",
          detail: "Buscando recibo NIP-57",
        },
      ]);
      const newReceipt = await findPrizeZapReceipt(target, signer.pubkey);
      if (newReceipt) {
        setReceipt(newReceipt);
        setProgressLog((prev) => [
          ...prev,
          {
            step: "recording",
            status: "done",
            detail: "Recibo NIP-57 encontrado",
          },
        ]);
      } else {
        setProgressLog((prev) => [
          ...prev,
          {
            step: "recording",
            status: "done",
            detail: "Pago guardado; recibo pendiente de indexar",
          },
        ]);
      }
      setPaid(true);
      push({
        kind: "success",
        title: "Premio pagado",
        description: `${target.projectName} recibió ${formatSats(target.sats)} sats.`,
      });
    } catch (err) {
      push({
        kind: "error",
        title: "No se pudo pagar",
        description: err instanceof Error ? err.message : String(err),
        duration: 12000,
      });
      setProgressError(err instanceof Error ? err.message : String(err));
      setProgressLog((prev) => [
        ...prev,
        {
          step: "done",
          status: "error",
          detail: err instanceof Error ? err.message : String(err),
        },
      ]);
    } finally {
      setPaying(false);
    }
  }

  if (!isAdmin && !paid) return null;

  return (
    <>
      <button
        type="button"
        onClick={handlePay}
        disabled={!paid && disabled}
        className={cn(
          "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-mono font-bold uppercase tracking-widest transition-colors",
          paid
            ? "border-success/30 bg-success/10 text-success hover:bg-success/15"
            : "border-bitcoin/40 bg-bitcoin/10 text-bitcoin hover:bg-bitcoin/20",
          !paid && disabled && "cursor-not-allowed opacity-70",
        )}
        title={
          paid
            ? "Ver prueba de pago"
            : `Zap NIP-57 por ${target.sats.toLocaleString("es-AR")} sats`
        }
      >
        {checking || paying ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : paid ? (
          <CheckCircle2 className="h-3.5 w-3.5" />
        ) : (
          <Zap className="h-3.5 w-3.5" />
        )}
        <span className="hidden sm:inline">{label}</span>
      </button>
      {proofOpen && (
        <PrizeZapProofModal
          target={target}
          receipt={receipt}
          localRecord={localRecord}
          adminPubkey={adminPubkey}
          onClose={() => setProofOpen(false)}
        />
      )}
      {progressOpen && (
        <PrizeZapProgressModal
          target={target}
          recipientPaymentInfo={recipientPaymentInfo}
          progressLog={progressLog}
          error={progressError}
          done={paid && !paying}
          onClose={() => setProgressOpen(false)}
          onOpenProof={() => {
            setProgressOpen(false);
            setProofOpen(true);
          }}
        />
      )}
    </>
  );
}

const PRIZE_ZAP_STEPS: Array<{
  id: PrizeZapProgressStep;
  label: string;
  description: string;
}> = [
  {
    id: "checking",
    label: "Pago previo",
    description: "Busca registros locales y recibos NIP-57 existentes.",
  },
  {
    id: "endpoint",
    label: "Endpoint",
    description: "Resuelve el callback LNURL/NIP-57 del ganador.",
  },
  {
    id: "signing",
    label: "Firma",
    description: "Firma el zap request 9734 con el admin.",
  },
  {
    id: "invoice",
    label: "Invoice",
    description: "Pide la invoice al servicio de zaps.",
  },
  {
    id: "paying",
    label: "Pago",
    description: "Detecta WebLN o muestra la invoice para pago externo.",
  },
  {
    id: "recording",
    label: "Registro",
    description: "Guarda el pago y busca el recibo 9735.",
  },
];

const PRIZE_ZAP_VISIBLE_STEPS = PRIZE_ZAP_STEPS.filter(
  (step, index, steps) =>
    steps.findIndex((candidate) => candidate.id === step.id) === index,
);

function latestProgress(
  log: PrizeZapProgress[],
  step: PrizeZapProgressStep,
): PrizeZapProgress | null {
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i].step === step) return log[i];
  }
  return null;
}

function latestProgressInvoice(log: PrizeZapProgress[]): string {
  for (let i = log.length - 1; i >= 0; i--) {
    const invoice = log[i].invoice;
    if (invoice) return invoice;
  }
  return "";
}

function latestProgressEndpoint(log: PrizeZapProgress[]): string {
  for (let i = log.length - 1; i >= 0; i--) {
    const endpoint = log[i].zapEndpoint;
    if (endpoint) return endpoint;
  }
  return "";
}

function lightningAddressFromEndpoint(endpoint: string): string | null {
  try {
    const url = new URL(endpoint);
    const parts = url.pathname.split("/").filter(Boolean);
    const lnurlpIndex = parts.findIndex((part) => part.toLowerCase() === "lnurlp");
    const username = lnurlpIndex >= 0 ? parts[lnurlpIndex + 1] : null;
    if (!username) return null;
    return `${decodeURIComponent(username)}@${url.hostname}`;
  } catch {
    return null;
  }
}

function ManualInvoicePanel({ invoice }: { invoice: string }) {
  const [qrDataUrl, setQrDataUrl] = useState("");

  useEffect(() => {
    let cancelled = false;
    import("qrcode")
      .then((qr) =>
        qr.toDataURL(invoice, {
          margin: 1,
          width: 220,
          color: {
            dark: "#0b0f1a",
            light: "#ffffff",
          },
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

  return (
    <div className="mt-4 rounded-xl border border-bitcoin/30 bg-bitcoin/10 p-3">
      <div className="mb-2 flex items-center gap-2 text-[10px] font-mono font-bold uppercase tracking-widest text-bitcoin">
        <ReceiptText className="h-3.5 w-3.5" />
        Invoice para pagar
      </div>
      <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
        <div className="flex h-[148px] w-[148px] items-center justify-center rounded-xl border border-border bg-white p-2">
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrDataUrl}
              alt="QR de invoice Lightning"
              className="h-full w-full"
            />
          ) : (
            <Loader2 className="h-6 w-6 animate-spin text-black/60" />
          )}
        </div>
        <div className="min-w-0">
          <div className="max-h-24 overflow-auto rounded-lg border border-border bg-black/25 p-2 text-[10px] font-mono leading-relaxed text-foreground-muted break-all">
            {invoice}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(invoice)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white/5 px-2.5 py-1.5 text-[10px] font-mono font-bold uppercase tracking-widest text-foreground-muted transition-colors hover:bg-white/10 hover:text-foreground"
            >
              <Copy className="h-3.5 w-3.5" />
              Copiar
            </button>
            <a
              href={`lightning:${invoice}`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-bitcoin px-2.5 py-1.5 text-[10px] font-mono font-bold uppercase tracking-widest text-black transition-colors hover:bg-bitcoin/90"
            >
              <Zap className="h-3.5 w-3.5" />
              Abrir wallet
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function PrizeZapProgressModal({
  target,
  recipientPaymentInfo,
  progressLog,
  error,
  done,
  onClose,
  onOpenProof,
}: {
  target: PrizeZapTarget;
  recipientPaymentInfo: PrizeZapRecipientPaymentInfo | null;
  progressLog: PrizeZapProgress[];
  error: string | null;
  done: boolean;
  onClose: () => void;
  onOpenProof: () => void;
}) {
  const stepState = (step: PrizeZapProgressStep) => {
    if (step === "paying") {
      return (
        latestProgress(progressLog, "paying") ??
        latestProgress(progressLog, "webln")
      );
    }
    return latestProgress(progressLog, step);
  };
  const completed = PRIZE_ZAP_VISIBLE_STEPS.filter(
    (step) => stepState(step.id)?.status === "done",
  ).length;
  const activeStep =
    PRIZE_ZAP_VISIBLE_STEPS.find(
      (step) => stepState(step.id)?.status === "active",
    ) ??
    PRIZE_ZAP_VISIBLE_STEPS[
      Math.min(completed, PRIZE_ZAP_VISIBLE_STEPS.length - 1)
    ];
  const progress = error
    ? Math.max(8, (completed / PRIZE_ZAP_VISIBLE_STEPS.length) * 100)
    : done
      ? 100
      : Math.max(8, (completed / PRIZE_ZAP_VISIBLE_STEPS.length) * 100);
  const destination = recipientPaymentInfo
    ? recipientPaymentInfo.lightningAddress || "Sin lightning address pública"
    : "Resolviendo lightning address…";
  const manualInvoice = latestProgressInvoice(progressLog);
  const progressEndpoint = latestProgressEndpoint(progressLog);
  const progressLightningAddress = progressEndpoint
    ? lightningAddressFromEndpoint(progressEndpoint)
    : null;
  const displayedDestination =
    recipientPaymentInfo?.lightningAddress ??
    progressLightningAddress ??
    progressEndpoint ??
    destination;
  const destinationLabel =
    recipientPaymentInfo?.lightningAddress || progressLightningAddress
      ? "Lightning address"
      : progressEndpoint
        ? "Endpoint"
        : "Destino";

  return (
    <div className="fixed inset-0 z-[170] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
        onClick={onClose}
        disabled={!done && !error}
        aria-label="Cerrar"
      />
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-border-strong bg-background-card shadow-2xl shadow-black/50">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-bitcoin/30 bg-bitcoin/10 px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-widest text-bitcoin">
              {error ? (
                <X className="h-3 w-3" />
              ) : done ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : (
                <Loader2 className="h-3 w-3 animate-spin" />
              )}
              Zap de premio
            </div>
            <h3 className="mt-2 font-display text-xl font-bold">
              {target.projectName}
            </h3>
            <p className="mt-0.5 text-xs text-foreground-muted">
              #{target.position} · {formatSats(target.sats)} sats
            </p>
            <div className="mt-3 inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border bg-black/20 px-2.5 py-1.5 text-xs text-foreground-muted">
              <Zap className="h-3.5 w-3.5 shrink-0 text-bitcoin" />
              <span className="shrink-0 text-foreground-subtle">
                {destinationLabel}
              </span>
              <span className="min-w-0 truncate font-mono text-foreground">
                {displayedDestination}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={!done && !error}
            className="rounded-lg p-2 text-foreground-muted transition-colors hover:bg-white/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-4">
          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between gap-3 text-xs">
              <span className="font-semibold text-foreground">
                {error
                  ? "Proceso detenido"
                  : done
                    ? "Pago completado"
                    : activeStep?.label}
              </span>
              <span className="font-mono text-foreground-subtle">
                {Math.round(progress)}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  error ? "bg-danger" : "bg-bitcoin",
                )}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <div className="space-y-2">
            {PRIZE_ZAP_VISIBLE_STEPS.map((step, index) => {
              const state = stepState(step.id);
              const isActive = state?.status === "active";
              const isDone = state?.status === "done";
              const isError = state?.status === "error";
              return (
                <div
                  key={`${index}-${step.id}`}
                  className={cn(
                    "rounded-xl border px-3 py-2.5 transition-colors",
                    isDone && "border-success/25 bg-success/5",
                    isActive && "border-bitcoin/35 bg-bitcoin/10",
                    isError && "border-danger/35 bg-danger/10",
                    !state && "border-border bg-white/[0.02]",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                        isDone && "border-success/40 bg-success/15 text-success",
                        isActive && "border-bitcoin/40 bg-bitcoin/15 text-bitcoin",
                        isError && "border-danger/40 bg-danger/15 text-danger",
                        !state && "border-border text-foreground-subtle",
                      )}
                    >
                      {isDone ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : isActive ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : isError ? (
                        <X className="h-3.5 w-3.5" />
                      ) : (
                        <span className="text-[10px] font-mono">
                          {index + 1}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-foreground">
                        {step.label}
                      </div>
                      <div className="text-xs text-foreground-muted">
                        {state?.detail || step.description}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {manualInvoice && (error || latestProgress(progressLog, "webln")?.status === "error") && (
            <ManualInvoicePanel invoice={manualInvoice} />
          )}

          {error && (
            <div className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">
              {error}
            </div>
          )}

          <div className="mt-4 flex justify-end gap-2">
            {(done || error) && (
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-foreground-muted transition-colors hover:bg-white/5 hover:text-foreground"
              >
                Cerrar
              </button>
            )}
            {done && (
              <button
                type="button"
                onClick={onOpenProof}
                className="rounded-lg bg-bitcoin px-3 py-2 text-sm font-semibold text-black transition-colors hover:bg-bitcoin/90"
              >
                Ver prueba
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function eventTag(event: SignedEvent | null, name: string): string | null {
  return event?.tags.find((tag) => tag[0] === name)?.[1] ?? null;
}

function parseZapRequest(receipt: SignedEvent | null): SignedEvent | null {
  const description = eventTag(receipt, "description");
  if (!description) return null;
  try {
    return JSON.parse(description) as SignedEvent;
  } catch {
    return null;
  }
}

type RelayPublicationStatus =
  | {
      relay: string;
      status: "checking" | "published" | "missing" | "publishing";
    }
  | {
      relay: string;
      status: "error";
      error: string;
    };

function zapRequestRelays(zapRequest: SignedEvent | null): string[] {
  const relays = zapRequest?.tags.find((tag) => tag[0] === "relays")?.slice(1) ?? [];
  return [...new Set(relays.map((relay) => relay.trim()).filter(Boolean))];
}

async function checkRelayForEvent(
  relay: string,
  eventId: string,
): Promise<RelayPublicationStatus> {
  const { SimplePool } = await import("nostr-tools/pool");
  const pool = new SimplePool();

  return new Promise((resolve) => {
    let settled = false;
    let closer: { close: () => void } | null = null;
    const finish = (status: RelayPublicationStatus) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      try {
        closer?.close();
        pool.close([relay]);
      } catch {
        /* noop */
      }
      resolve(status);
    };
    const timeout = window.setTimeout(() => {
      finish({ relay, status: "missing" });
    }, 3500);

    try {
      closer = pool.subscribe(
        [relay],
        { ids: [eventId], limit: 1 },
        {
          onevent(ev) {
            if ((ev as SignedEvent).id === eventId) {
              finish({ relay, status: "published" });
            }
          },
          oneose() {
            finish({ relay, status: "missing" });
          },
          onclose(reason) {
            finish({
              relay,
              status: "error",
              error: Array.isArray(reason)
                ? reason.filter(Boolean).join(", ") || "Conexión cerrada"
                : reason || "Conexión cerrada",
            });
          },
        },
      );
    } catch (error) {
      finish({
        relay,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

async function checkRelayPublication(
  relays: string[],
  eventId: string,
  onStatus: (status: RelayPublicationStatus) => void,
) {
  await Promise.all(
    relays.map(async (relay) => {
      const status = await checkRelayForEvent(relay, eventId);
      onStatus(status);
    }),
  );
}

async function publishEventToRelay(
  relay: string,
  event: SignedEvent,
): Promise<RelayPublicationStatus> {
  const { SimplePool } = await import("nostr-tools/pool");
  const pool = new SimplePool();
  try {
    const [published] = pool.publish([relay], event);
    await Promise.race([
      published,
      new Promise((_, reject) => {
        window.setTimeout(() => reject(new Error("Timeout publicando")), 5000);
      }),
    ]);
    return { relay, status: "published" };
  } catch (error) {
    return {
      relay,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    try {
      pool.close([relay]);
    } catch {
      /* noop */
    }
  }
}

function short(value?: string | null, head = 12, tail = 8): string {
  if (!value) return "—";
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function CopyButton({ value }: { value?: string | null }) {
  if (!value) return null;
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard?.writeText(value)}
      className="rounded-md p-1 text-foreground-subtle transition-colors hover:bg-white/5 hover:text-foreground"
      aria-label="Copiar"
    >
      <Copy className="h-3.5 w-3.5" />
    </button>
  );
}

function ProofRow({
  label,
  value,
  copyValue,
  href,
}: {
  label: string;
  value?: string | number | null;
  copyValue?: string | null;
  href?: string | null;
}) {
  const text = value === undefined || value === null || value === "" ? "—" : String(value);
  return (
    <div className="grid grid-cols-[100px_1fr_auto] items-start gap-2 border-b border-border/60 py-2 last:border-b-0">
      <div className="text-[10px] font-mono uppercase tracking-widest text-foreground-subtle">
        {label}
      </div>
      {href ? (
        <a
          href={href}
          target={href.startsWith("http") ? "_blank" : undefined}
          rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
          className="group/link min-w-0 break-all text-xs font-mono text-bitcoin transition-colors hover:text-bitcoin/80"
        >
          {text}
          <ExternalLink className="ml-1 inline h-3 w-3 opacity-70 transition-opacity group-hover/link:opacity-100" />
        </a>
      ) : (
        <div className="min-w-0 break-all text-xs font-mono text-foreground-muted">
          {text}
        </div>
      )}
      <CopyButton value={copyValue ?? text} />
    </div>
  );
}

type ProofTab = "summary" | "invoice" | "request" | "receipt";

function SectionTitle({
  icon,
  title,
}: {
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <div className="mb-3 flex items-center gap-2 text-[10px] font-mono font-bold uppercase tracking-widest text-foreground-subtle">
      <span className="text-bitcoin">{icon}</span>
      {title}
    </div>
  );
}

function JsonValue({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value === null) {
    return <span className="text-foreground-subtle">null</span>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-foreground-subtle">[]</span>;
    }
    return (
      <div className="space-y-1">
        {value.map((item, index) => (
          <div
            key={index}
            className="rounded-lg border border-border/70 bg-white/[0.02] px-2 py-1.5"
            style={{ marginLeft: depth ? 10 : 0 }}
          >
            <div className="mb-1 text-[9px] font-mono text-foreground-subtle">
              [{index}]
            </div>
            <JsonValue value={item} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return <span className="text-foreground-subtle">{"{}"}</span>;
    }
    return (
      <div className="space-y-2">
        {entries.map(([key, nested]) => (
          <div
            key={key}
            className="grid grid-cols-[110px_1fr_auto] items-start gap-2 border-b border-border/50 pb-2 last:border-b-0 last:pb-0"
          >
            <div className="break-all text-[10px] font-mono font-bold uppercase tracking-widest text-bitcoin/80">
              {key}
            </div>
            <div className="min-w-0 text-xs font-mono text-foreground-muted">
              <JsonValue value={nested} depth={depth + 1} />
            </div>
            <CopyButton value={JSON.stringify(nested)} />
          </div>
        ))}
      </div>
    );
  }

  if (typeof value === "string") {
    return <span className="break-all text-foreground-muted">{value}</span>;
  }

  if (typeof value === "number") {
    return <span className="text-bitcoin">{value}</span>;
  }

  if (typeof value === "boolean") {
    return <span className="text-success">{String(value)}</span>;
  }

  return <span className="break-all text-foreground-muted">{String(value)}</span>;
}

function JsonViewer({ value }: { value: unknown }) {
  return (
    <div className="max-h-[50vh] overflow-auto rounded-xl border border-border bg-black/20 p-3">
      <JsonValue value={value} />
    </div>
  );
}

function RelayPublicationList({
  relays,
  statuses,
  receipt,
  onStatus,
}: {
  relays: string[];
  statuses: RelayPublicationStatus[];
  receipt: SignedEvent | null;
  onStatus: (status: RelayPublicationStatus) => void;
}) {
  const statusByRelay = new Map(statuses.map((status) => [status.relay, status]));

  async function handlePublish(relay: string) {
    if (!receipt) return;
    onStatus({ relay, status: "publishing" });
    const status = await publishEventToRelay(relay, receipt);
    onStatus(status);
  }

  if (!relays.length) {
    return (
      <div className="rounded-xl border border-border bg-black/20 px-3 py-2.5 text-xs text-foreground-subtle">
        El zap request no declara relays.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-black/20 px-3">
      {relays.map((relay) => {
        const status = statusByRelay.get(relay) ?? { relay, status: "checking" };
        const isPublished = status.status === "published";
        const isMissing = status.status === "missing";
        const isError = status.status === "error";
        const isPublishing = status.status === "publishing";
        const canPublish = !!receipt && (isMissing || isError);
        const label = isPublished
          ? "Publicado"
          : isMissing
            ? "No encontrado"
            : isError
              ? "Error"
              : isPublishing
                ? "Publicando"
                : "Chequeando";
        const stateClass = cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[9px] font-mono font-bold uppercase tracking-widest transition-colors",
          isPublished && "border-success/30 bg-success/10 text-success",
          isMissing && "border-foreground-subtle/30 bg-white/5 text-foreground-subtle",
          isError && "border-danger/30 bg-danger/10 text-danger",
          (status.status === "checking" || isPublishing) &&
            "border-bitcoin/30 bg-bitcoin/10 text-bitcoin",
        );

        return (
          <div
            key={relay}
            className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-border/60 py-2 last:border-b-0"
          >
            <div className="min-w-0">
              <div className="break-all text-xs font-mono text-foreground-muted">
                {relay}
              </div>
              {isError && (
                <div className="mt-0.5 text-[10px] text-danger">
                  {status.error}
                </div>
              )}
            </div>
            {canPublish ? (
              <button
                type="button"
                onClick={() => handlePublish(relay)}
                className={cn(
                  "group/status",
                  stateClass,
                  "hover:border-bitcoin/50 hover:bg-bitcoin/15 hover:text-bitcoin",
                )}
                title={`Publicar receipt en ${relay}`}
              >
                <span className="inline-flex items-center gap-1.5 group-hover/status:hidden">
                  <X className="h-3 w-3" />
                  {label}
                </span>
                <span className="hidden items-center gap-1.5 group-hover/status:inline-flex">
                  <Zap className="h-3 w-3" />
                  Publicar
                </span>
              </button>
            ) : (
              <div className={stateClass}>
                {isPublished ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : isError || isMissing ? (
                  <X className="h-3 w-3" />
                ) : (
                  <Loader2 className="h-3 w-3 animate-spin" />
                )}
                {label}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

type DecodedBolt11 = {
  network: string;
  amountMsats: string | null;
  amountSats: string | null;
  timestamp: number;
  paymentHash?: string;
  description?: string;
  descriptionHash?: string;
  paymentSecret?: string;
  payeePubkey?: string;
  expirySeconds?: number;
  minFinalCltvExpiry?: number;
};

const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

function wordsToInt(words: number[]): number {
  return words.reduce((acc, word) => acc * 32 + word, 0);
}

function wordsToBytes(words: number[]): Uint8Array {
  const bytes: number[] = [];
  let value = 0;
  let bits = 0;
  for (const word of words) {
    value = (value << 5) | word;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      bytes.push((value >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function amountToMsats(amount: string): string | null {
  if (!amount) return null;
  const unit = amount.at(-1);
  const numberPart = /[munp]/.test(unit ?? "") ? amount.slice(0, -1) : amount;
  if (!/^\d+$/.test(numberPart)) return null;
  const n = BigInt(numberPart);
  const msats =
    unit === "m"
      ? n * BigInt("100000000")
      : unit === "u"
        ? n * BigInt("100000")
        : unit === "n"
          ? n * BigInt("100")
          : unit === "p"
            ? n / BigInt("10")
            : n * BigInt("100000000000");
  return msats.toString();
}

function decodeBolt11(invoice: string): DecodedBolt11 | null {
  const lower = invoice.trim().toLowerCase();
  const separator = lower.lastIndexOf("1");
  if (separator <= 0) return null;

  const hrp = lower.slice(0, separator);
  if (!hrp.startsWith("ln")) return null;

  const rawData = lower.slice(separator + 1);
  const allWords = [...rawData].map((char) => BECH32_CHARSET.indexOf(char));
  if (allWords.some((word) => word < 0) || allWords.length < 7 + 104 + 6) {
    return null;
  }

  const words = allWords.slice(0, -6);
  const timestamp = wordsToInt(words.slice(0, 7));
  const signatureWords = 104;
  const tagWords = words.slice(7, Math.max(7, words.length - signatureWords));
  const amount = hrp.slice(4);
  const amountMsats = amountToMsats(amount);
  const decoded: DecodedBolt11 = {
    network: hrp.slice(2, 4) || "bc",
    amountMsats,
    amountSats: amountMsats
      ? (BigInt(amountMsats) / BigInt("1000")).toString()
      : null,
    timestamp,
  };

  for (let i = 0; i + 3 <= tagWords.length; ) {
    const tag = BECH32_CHARSET[tagWords[i]];
    const length = wordsToInt(tagWords.slice(i + 1, i + 3));
    const data = tagWords.slice(i + 3, i + 3 + length);
    if (data.length !== length) break;
    const bytes = wordsToBytes(data);

    if (tag === "p") decoded.paymentHash = bytesToHex(bytes);
    if (tag === "d") decoded.description = new TextDecoder().decode(bytes);
    if (tag === "h") decoded.descriptionHash = bytesToHex(bytes);
    if (tag === "s") decoded.paymentSecret = bytesToHex(bytes);
    if (tag === "n") decoded.payeePubkey = bytesToHex(bytes);
    if (tag === "x") decoded.expirySeconds = wordsToInt(data);
    if (tag === "c") decoded.minFinalCltvExpiry = wordsToInt(data);

    i += 3 + length;
  }

  return decoded;
}

function Bolt11Decode({ invoice }: { invoice: string }) {
  const decoded = invoice ? decodeBolt11(invoice) : null;
  if (!decoded) {
    return (
      <div className="rounded-xl border border-border bg-black/20 px-3 py-2.5 text-xs text-foreground-subtle">
        No pude decodificar esta invoice.
      </div>
    );
  }

  const expiresAt =
    decoded.expirySeconds !== undefined
      ? decoded.timestamp + decoded.expirySeconds
      : null;

  return (
    <div className="rounded-xl border border-border bg-black/20 px-3">
      <ProofRow label="Red" value={decoded.network} />
      <ProofRow
        label="Monto"
        value={
          decoded.amountSats
            ? `${Number(decoded.amountSats).toLocaleString("es-AR")} sats (${decoded.amountMsats} msats)`
            : "Sin monto fijo"
        }
      />
      <ProofRow
        label="Creada"
        value={new Date(decoded.timestamp * 1000).toLocaleString("es-AR", {
          dateStyle: "medium",
          timeStyle: "short",
        })}
        copyValue={String(decoded.timestamp)}
      />
      <ProofRow
        label="Expira"
        value={
          expiresAt
            ? new Date(expiresAt * 1000).toLocaleString("es-AR", {
                dateStyle: "medium",
                timeStyle: "short",
              })
            : null
        }
        copyValue={expiresAt ? String(expiresAt) : undefined}
      />
      <ProofRow
        label="Payment hash"
        value={short(decoded.paymentHash)}
        copyValue={decoded.paymentHash}
      />
      <ProofRow label="Descripción" value={decoded.description} />
      <ProofRow
        label="Desc hash"
        value={short(decoded.descriptionHash)}
        copyValue={decoded.descriptionHash}
      />
      <ProofRow
        label="Secret"
        value={short(decoded.paymentSecret)}
        copyValue={decoded.paymentSecret}
      />
      <ProofRow
        label="Payee"
        value={short(decoded.payeePubkey)}
        copyValue={decoded.payeePubkey}
      />
      <ProofRow label="CLTV" value={decoded.minFinalCltvExpiry} />
    </div>
  );
}

function PrizeZapProofModal({
  target,
  receipt,
  localRecord,
  adminPubkey,
  onClose,
}: {
  target: PrizeZapTarget;
  receipt: SignedEvent | null;
  localRecord: PrizeZapRecord | null;
  adminPubkey: string | null;
  onClose: () => void;
}) {
  const zapRequest = useMemo(() => parseZapRequest(receipt), [receipt]);
  const bolt11 = eventTag(receipt, "bolt11") ?? localRecord?.invoice ?? "";
  const preimage = eventTag(receipt, "preimage") ?? localRecord?.preimage ?? "";
  const paidAt = receipt?.created_at ?? localRecord?.paidAt ?? null;
  const amountMsats =
    zapRequest?.tags.find((tag) => tag[0] === "amount")?.[1] ??
    String(target.sats * 1000);
  const [tab, setTab] = useState<ProofTab>("summary");
  const relayList = useMemo(() => zapRequestRelays(zapRequest), [zapRequest]);
  const [relayStatuses, setRelayStatuses] = useState<RelayPublicationStatus[]>([]);
  const updateRelayStatus = (status: RelayPublicationStatus) => {
    setRelayStatuses((prev) => {
      if (prev.some((item) => item.relay === status.relay)) {
        return prev.map((item) => (item.relay === status.relay ? status : item));
      }
      return [...prev, status];
    });
  };

  useEffect(() => {
    if (!receipt?.id || !relayList.length) {
      setRelayStatuses([]);
      return;
    }

    let cancelled = false;
    setRelayStatuses(
      relayList.map((relay) => ({
        relay,
        status: "checking",
      })),
    );
    checkRelayPublication(relayList, receipt.id, (status) => {
      if (cancelled) return;
      updateRelayStatus(status);
    }).catch(() => {
      /* per-relay status handles visible errors */
    });

    return () => {
      cancelled = true;
    };
  }, [receipt?.id, relayList]);

  const tabs: Array<{
    id: ProofTab;
    label: string;
    icon: React.ReactNode;
    disabled?: boolean;
  }> = [
    {
      id: "summary",
      label: "Resumen",
      icon: <ClipboardList className="h-3.5 w-3.5" />,
    },
    {
      id: "invoice",
      label: "Invoice",
      icon: <ReceiptText className="h-3.5 w-3.5" />,
      disabled: !bolt11,
    },
    {
      id: "request",
      label: "Request",
      icon: <ScrollText className="h-3.5 w-3.5" />,
      disabled: !zapRequest,
    },
    {
      id: "receipt",
      label: "Receipt",
      icon: <FileJson className="h-3.5 w-3.5" />,
      disabled: !receipt,
    },
  ];

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
        onClick={onClose}
        aria-label="Cerrar"
      />
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-border-strong bg-background-card shadow-2xl shadow-black/50">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-widest text-success">
              <CheckCircle2 className="h-3 w-3" />
              Premio pagado
            </div>
            <h3 className="mt-2 font-display text-xl font-bold">
              {target.projectName}
            </h3>
            <p className="mt-0.5 text-xs text-foreground-muted">
              #{target.position} · {formatSats(target.sats)} sats · {receipt ? "Recibo NIP-57" : "Registro local"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-foreground-muted transition-colors hover:bg-white/5 hover:text-foreground"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-border bg-black/20 px-5 py-2">
          <div className="grid grid-cols-4 gap-1 rounded-xl border border-border bg-white/[0.03] p-1">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => !item.disabled && setTab(item.id)}
                disabled={item.disabled}
                className={cn(
                  "flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[10px] font-mono font-bold uppercase tracking-widest transition-colors",
                  tab === item.id
                    ? "bg-bitcoin text-black"
                    : "text-foreground-muted hover:bg-white/5 hover:text-foreground",
                  item.disabled && "cursor-not-allowed opacity-35",
                )}
              >
                {item.icon}
                <span className="hidden sm:inline">{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="max-h-[62vh] overflow-y-auto px-5 py-4">
          {tab === "summary" && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-border bg-black/20 p-3">
                  <div className="mb-1 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-foreground-subtle">
                    <Trophy className="h-3 w-3 text-bitcoin" />
                    Puesto
                  </div>
                  <div className="font-display text-2xl font-bold">
                    #{target.position}
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-black/20 p-3">
                  <div className="mb-1 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-foreground-subtle">
                    <Zap className="h-3 w-3 text-bitcoin" />
                    Premio
                  </div>
                  <div className="font-display text-2xl font-bold">
                    {formatSats(target.sats)}
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-black/20 p-3">
                  <div className="mb-1 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-foreground-subtle">
                    <CheckCircle2 className="h-3 w-3 text-success" />
                    Estado
                  </div>
                  <div className="truncate text-sm font-semibold text-success">
                    Pagado
                  </div>
                </div>
              </div>

              <div>
                <SectionTitle
                  icon={<ClipboardList className="h-4 w-4" />}
                  title="Datos del pago"
                />
                <div className="rounded-xl border border-border bg-black/20 px-3">
                  <ProofRow
                    label="Estado"
                    value={receipt ? "Confirmado por zap receipt kind 9735" : "Pagado localmente, recibo no encontrado aún"}
                    copyValue={receipt ? receipt.id : undefined}
                  />
                  <ProofRow
                    label="Fecha"
                    value={
                      paidAt
                        ? new Date(paidAt * 1000).toLocaleString("es-AR", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })
                        : null
                    }
                    copyValue={paidAt ? String(paidAt) : undefined}
                  />
                  <ProofRow
                    label="Hackathon"
                    value={target.hackathonId}
                    href={`/hackathons/${hackathonSlugForId(target.hackathonId)}`}
                  />
                  <ProofRow
                    label="Proyecto"
                    value={target.projectId}
                    href={`/hackathons/${hackathonSlugForId(target.hackathonId)}/${target.projectId}`}
                  />
                  <ProofRow label="Puesto" value={`#${target.position}`} />
                  <ProofRow label="Monto" value={`${target.sats} sats (${amountMsats} msats)`} />
                  <ProofRow label="Admin" value={short(adminPubkey)} copyValue={adminPubkey} />
                  <ProofRow
                    label="Receptor"
                    value={short(target.recipientPubkey)}
                    copyValue={target.recipientPubkey}
                  />
                  <ProofRow
                    label="Receipt"
                    value={short(receipt?.id)}
                    copyValue={receipt?.id}
                  />
                  <ProofRow
                    label="Signer"
                    value={short(receipt?.pubkey)}
                    copyValue={receipt?.pubkey}
                  />
                  <ProofRow
                    label="Zap req"
                    value={short(zapRequest?.id ?? localRecord?.zapRequestId)}
                    copyValue={zapRequest?.id ?? localRecord?.zapRequestId}
                    href={
                      zapRequest?.id
                        ? `https://njump.me/${zapRequest.id}`
                        : localRecord?.zapRequestId
                          ? `https://njump.me/${localRecord.zapRequestId}`
                          : null
                    }
                  />
                  <ProofRow label="Preimage" value={short(preimage)} copyValue={preimage} />
                </div>
              </div>
            </div>
          )}

          {tab === "invoice" && (
            <div className="space-y-4">
              <SectionTitle
                icon={<ReceiptText className="h-4 w-4" />}
                title="Invoice bolt11"
              />
              <div className="rounded-xl border border-border bg-black/20 p-3 text-[10px] font-mono leading-relaxed text-foreground-muted break-all">
                {bolt11 || "—"}
              </div>
              <div>
                <SectionTitle
                  icon={<ClipboardList className="h-4 w-4" />}
                  title="Decode BOLT11"
                />
                <Bolt11Decode invoice={bolt11} />
              </div>
            </div>
          )}

          {tab === "request" && zapRequest && (
            <div>
              <SectionTitle
                icon={<ScrollText className="h-4 w-4" />}
                title="Zap request 9734"
              />
              <JsonViewer value={zapRequest} />
            </div>
          )}

          {tab === "receipt" && receipt && (
            <div className="space-y-4">
              <div>
                <SectionTitle
                  icon={<CheckCircle2 className="h-4 w-4" />}
                  title="Publicación en relays"
                />
                <RelayPublicationList
                  relays={relayList}
                  statuses={relayStatuses}
                  receipt={receipt}
                  onStatus={updateRelayStatus}
                />
              </div>
              <div>
                <SectionTitle
                  icon={<FileJson className="h-4 w-4" />}
                  title="Zap receipt 9735"
                />
                <JsonViewer value={receipt} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
