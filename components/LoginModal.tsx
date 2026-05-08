"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  X,
  Key,
  Shield,
  Mail,
  ArrowRight,
  Download,
  ChevronLeft,
  Check,
  Copy,
  Link as LinkIcon,
  QrCode,
  Loader2,
  Wand2,
  Smartphone,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Logo from "./Logo";
import { setAuth } from "@/lib/auth";
import { useScrollLock } from "@/lib/useScrollLock";
import { useToast } from "./Toast";
import { NIP46_LOGIN_RELAYS } from "@/lib/nostrRelayConfig";
import { cn } from "@/lib/cn";
import type { BunkerSigner as BunkerSignerType } from "nostr-tools/nip46";
import { Nip46Client, type EncryptionVersion } from "@/lib/nip46Client";

const QR_TIMEOUT_MS = 5 * 60_000;

type Method = "nostr" | "email";
type NcMode = "picker" | "url" | "qr";
type NcState =
  | "idle"
  | "form"
  | "qr"
  | "connecting"
  | "connected"
  | "error";

const DEFAULT_NC_RELAYS = NIP46_LOGIN_RELAYS;

const NC_DEBUG = true;
const nclog = (...args: unknown[]) => {
  if (NC_DEBUG) console.log("[nip46]", ...args);
};

export default function LoginModal({
  open,
  onClose,
  redirectTo = "/dashboard",
}: {
  open: boolean;
  onClose: () => void;
  redirectTo?: string;
}) {
  const router = useRouter();
  const { push: pushToast } = useToast();
  const [method, setMethod] = useState<Method>("nostr");
  const [email, setEmail] = useState("");
  const [nip07, setNip07] = useState<"checking" | "available" | "missing">(
    "checking",
  );

  const [ncState, setNcState] = useState<NcState>("idle");
  const [bunkerUrl, setBunkerUrl] = useState("");
  const [ncError, setNcError] = useState<string | null>(null);
  const [ncPubkey, setNcPubkey] = useState<string | null>(null);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [qrUri, setQrUri] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrExpiresAt, setQrExpiresAt] = useState<number | null>(null);
  const [ncDiag, setNcDiag] = useState<string[]>([]);
  const [nip07Loading, setNip07Loading] = useState(false);
  const signerRef = useRef<BunkerSignerType | Nip46Client | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  function pushDiag(msg: string) {
    const stamp = new Date().toLocaleTimeString("es-AR", { hour12: false });
    nclog(msg);
    setNcDiag((d) => [...d, `${stamp}  ${msg}`].slice(-10));
  }

  useScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    setNip07("checking");
    let cancelled = false;
    const check = () => {
      if (cancelled) return;
      setNip07(
        typeof window !== "undefined" && window.nostr ? "available" : "missing",
      );
    };
    check();
    const t = window.setTimeout(check, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [open]);

  useEffect(() => {
    if (open) return;
    // Reset Nostr Connect flow on close
    abortRef.current?.abort();
    abortRef.current = null;
    signerRef.current?.close().catch(() => {});
    signerRef.current = null;
    setNcState("idle");
    setBunkerUrl("");
    setNcError(null);
    setNcPubkey(null);
    setAuthUrl(null);
    setQrUri(null);
    setQrDataUrl(null);
    setQrExpiresAt(null);
    setNcDiag([]);
    setNip07Loading(false);
  }, [open]);

  function finishLogin() {
    setNcState("connected");
    router.push(redirectTo);
    onClose();
  }

  function persistAuth(
    pubkey: string,
    clientSecret: Uint8Array,
    relays: string[],
    bunkerPubkey?: string,
    secret?: string | null,
    encryption?: EncryptionVersion,
  ) {
    setAuth({
      method: "nip46",
      pubkey,
      bunker: {
        pubkey: bunkerPubkey,
        relays,
        secret: secret ?? null,
        ...(encryption ? { encryption } : {}),
      },
      clientSecret: Array.from(clientSecret),
    });
  }

  async function handleNip07() {
    if (nip07Loading) return;
    setNip07Loading(true);
    try {
      const pubkey = await window.nostr?.getPublicKey();
      if (!pubkey) {
        setNip07Loading(false);
        return;
      }
      setAuth({ method: "nip07", pubkey });
      router.push(redirectTo);
      onClose();
    } catch {
      setNip07Loading(false);
    }
  }

  /**
   * Creates a throwaway identity by generating a random nsec locally,
   * deriving the pubkey, and persisting both in `labs:auth` so the existing
   * signer flow (`getSigner` → `method:"local"`) can sign events without
   * any external extension or bunker. Intended for dev / quick demos.
   */
  async function handleRandomUser() {
    try {
      const { generateSecretKey, getPublicKey, nip19 } = await import(
        "nostr-tools"
      );
      const sk = generateSecretKey(); // Uint8Array (32 bytes)
      const pubkey = getPublicKey(sk);
      setAuth({
        method: "local",
        pubkey,
        localSecret: Array.from(sk),
      });
      const npub = nip19.npubEncode(pubkey);
      pushToast({
        kind: "info",
        title: "Usuario aleatorio creado",
        description: `${npub.slice(0, 14)}…${npub.slice(-6)} · la clave queda en localStorage (sólo dev).`,
        duration: 8000,
      });
      router.push(redirectTo);
      onClose();
    } catch (e) {
      pushToast({
        kind: "error",
        title: "No se pudo generar el usuario",
        description: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async function handleBunkerConnect() {
    setNcState("connecting");
    setNcError(null);
    setAuthUrl(null);
    setNcDiag([]);
    try {
      const { BunkerSigner, parseBunkerInput } = await import(
        "nostr-tools/nip46"
      );
      const { generateSecretKey } = await import("nostr-tools/pure");
      const { SimplePool } = await import("nostr-tools/pool");

      pushDiag(`parseando: ${bunkerUrl.trim().slice(0, 50)}`);
      const pointer = await parseBunkerInput(bunkerUrl.trim());
      if (!pointer) {
        throw new Error("URL inválida. Usá bunker:// o un NIP-05.");
      }
      pushDiag(`bunker=${pointer.pubkey.slice(0, 8)}… relays=${pointer.relays.length}`);

      const clientSecret = generateSecretKey();
      const pool = new SimplePool();
      const signer = BunkerSigner.fromBunker(clientSecret, pointer, {
        pool,
        onauth: (url) => {
          pushDiag(`auth_url recibida`);
          setAuthUrl(url);
        },
      });
      signerRef.current = signer;

      pushDiag(`enviando connect…`);
      await signer.connect();
      pushDiag(`✓ conectado, solicitando pubkey…`);
      const pubkey = await signer.getPublicKey();
      pushDiag(`✓ pubkey: ${pubkey.slice(0, 8)}…`);
      persistAuth(
        pubkey,
        clientSecret,
        pointer.relays,
        pointer.pubkey,
        pointer.secret,
      );
      setNcPubkey(pubkey);
      finishLogin();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo conectar";
      pushDiag(`✗ error: ${msg}`);
      setNcError(msg);
      setNcState("error");
    }
  }

  async function handleQrConnect() {
    setNcError(null);
    setAuthUrl(null);
    setQrUri(null);
    setQrDataUrl(null);
    setNcDiag([]);
    setNcState("qr");
    try {
      const { createNostrConnectURI } = await import("nostr-tools/nip46");
      const { generateSecretKey, getPublicKey } = await import(
        "nostr-tools/pure"
      );
      const QRCode = (await import("qrcode")).default;

      const clientSecret = generateSecretKey();
      const clientPubkey = getPublicKey(clientSecret);
      const secret = Math.random().toString(36).slice(2, 14);
      const relays = DEFAULT_NC_RELAYS;
      const siteOrigin =
        typeof window !== "undefined" ? window.location.origin : "";

      const uri = createNostrConnectURI({
        clientPubkey,
        relays,
        secret,
        name: "La Crypta Dev",
        url: siteOrigin,
        perms: ["get_public_key", "sign_event:1", "sign_event:22242"],
      });

      const dataUrl = await QRCode.toDataURL(uri, {
        width: 280,
        margin: 4,
        color: { dark: "#ffffff", light: "#000000" },
        errorCorrectionLevel: "M",
      });

      setQrUri(uri);
      setQrDataUrl(dataUrl);
      const expiresAt = Date.now() + QR_TIMEOUT_MS;
      setQrExpiresAt(expiresAt);

      pushDiag(`client=${clientPubkey.slice(0, 8)}… secret=${secret}`);
      pushDiag(`escuchando ${relays.length} relay(s)`);
      relays.forEach((r) => pushDiag(`  · ${r.replace("wss://", "")}`));

      const abort = new AbortController();
      abortRef.current = abort;

      const client = await Nip46Client.fromURI({
        clientSecret,
        relays,
        secret,
        timeoutMs: QR_TIMEOUT_MS,
        abortSignal: abort.signal,
        onAuthUrl: (url) => {
          pushDiag(`  → auth_url recibida`);
          setAuthUrl(url);
        },
        onDiag: pushDiag,
      });
      signerRef.current = client;

      setNcState("connecting");
      pushDiag(`solicitando pubkey del usuario…`);
      const pubkey = await client.getPublicKey();
      pushDiag(`✓ pubkey recibida: ${pubkey.slice(0, 8)}…`);
      persistAuth(
        pubkey,
        clientSecret,
        client.relays,
        client.bunkerPubkey,
        client.secret ?? secret,
        client.encryptionVersion,
      );
      setNcPubkey(pubkey);
      finishLogin();
    } catch (e) {
      if (abortRef.current?.signal.aborted) return;
      const msg = e instanceof Error ? e.message : "No se pudo conectar";
      if (msg === "__qr_timeout__") {
        pushDiag(`✗ timeout: el QR expiró después de 5 minutos`);
        setQrUri(null);
        setQrDataUrl(null);
        setQrExpiresAt(null);
        setAuthUrl(null);
        setNcError(null);
        setNcState("idle");
        pushToast({
          kind: "info",
          title: "El QR expiró",
          description:
            "Pasaron 5 minutos sin respuesta. Volvé a intentarlo cuando estés listo.",
        });
        return;
      }
      pushDiag(`✗ error: ${msg}`);
      setNcError(msg);
      setNcState("error");
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative w-full max-w-md glass-strong rounded-2xl border border-border-strong overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-bitcoin/10 via-transparent to-nostr/10 pointer-events-none" />
            <div className="absolute -top-px left-1/2 -translate-x-1/2 w-[40%] h-px bg-gradient-to-r from-transparent via-bitcoin to-transparent" />

            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-lg text-foreground-muted hover:text-foreground hover:bg-white/5 transition-colors z-10"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="relative px-6 pt-8 pb-6">
              <div className="flex items-center gap-3 mb-6">
                <Logo variant="mark" className="h-10 w-10" />
                <div>
                  <h2 className="font-display font-bold text-xl">
                    Hola de nuevo
                  </h2>
                  <p className="text-sm text-foreground-muted">
                    Ingresá a La Crypta Dev
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 p-1 bg-white/5 rounded-xl border border-border mb-5">
                {(
                  [
                    { id: "nostr", label: "Nostr", icon: Key, disabled: false },
                    {
                      id: "email",
                      label: "Correo",
                      icon: Mail,
                      disabled: true,
                    },
                  ] as const
                ).map((t) => {
                  const active = method === t.id;
                  const disabled = t.disabled;
                  return (
                    <button
                      key={t.id}
                      onClick={() => !disabled && setMethod(t.id)}
                      disabled={disabled}
                      aria-disabled={disabled}
                      title={disabled ? "Próximamente" : undefined}
                      className={`relative flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-semibold transition-colors ${
                        disabled
                          ? "text-foreground-subtle cursor-not-allowed opacity-60"
                          : active
                            ? "text-foreground"
                            : "text-foreground-muted hover:text-foreground"
                      }`}
                    >
                      {active && !disabled && (
                        <motion.div
                          layoutId="login-pill"
                          className="absolute inset-0 bg-gradient-to-br from-bitcoin/20 to-nostr/20 border border-bitcoin/30 rounded-lg"
                          transition={{
                            type: "spring",
                            bounce: 0.2,
                            duration: 0.4,
                          }}
                        />
                      )}
                      <t.icon className="relative h-3.5 w-3.5" />
                      <span className="relative">{t.label}</span>
                      {disabled && (
                        <span className="relative ml-0.5 px-1 py-0.5 rounded bg-white/5 border border-border text-[8px] font-mono tracking-widest text-foreground-subtle">
                          PRONTO
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <AnimatePresence mode="wait">
                {method === "nostr" && ncState === "idle" && (
                  <motion.div
                    key="nostr-idle"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-3"
                  >
                    {nip07 === "available" ? (
                      <button
                        onClick={handleNip07}
                        disabled={nip07Loading}
                        className="w-full group flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl bg-gradient-to-r from-nostr/20 to-nostr/10 hover:from-nostr/30 hover:to-nostr/20 border border-nostr/30 transition-all disabled:opacity-80 disabled:cursor-progress"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-lg bg-nostr/20 flex items-center justify-center">
                            {nip07Loading ? (
                              <Loader2 className="h-4 w-4 text-nostr animate-spin" />
                            ) : (
                              <Key className="h-4 w-4 text-nostr" />
                            )}
                          </div>
                          <div className="text-left">
                            <div className="text-sm font-semibold flex items-center gap-2">
                              Extensión del navegador
                              {nip07Loading ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-nostr/15 border border-nostr/30 text-[9px] font-mono font-bold tracking-wider text-nostr">
                                  FIRMANDO…
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-success/15 border border-success/30 text-[9px] font-mono font-bold tracking-wider text-success">
                                  <span className="h-1 w-1 rounded-full bg-success animate-pulse" />
                                  DETECTADA
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-foreground-muted">
                              {nip07Loading
                                ? "Aprobá la firma en tu extensión…"
                                : "NIP-07 · firmá con tu extensión"}
                            </div>
                          </div>
                        </div>
                        <ArrowRight className="h-4 w-4 text-foreground-muted group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
                      </button>
                    ) : nip07 === "missing" ? (
                      <a
                        href="https://getalby.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full group flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] border border-dashed border-border transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-lg bg-white/5 flex items-center justify-center">
                            <Download className="h-4 w-4 text-foreground-subtle" />
                          </div>
                          <div className="text-left">
                            <div className="text-sm font-semibold text-foreground-muted">
                              Sin extensión NIP-07
                            </div>
                            <div className="text-xs text-foreground-subtle">
                              Instalá Alby o nos2x para ingresar
                            </div>
                          </div>
                        </div>
                        <ArrowRight className="h-4 w-4 text-foreground-subtle group-hover:text-foreground-muted group-hover:translate-x-0.5 transition-all" />
                      </a>
                    ) : (
                      <div className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-white/[0.02] border border-border">
                        <div className="h-9 w-9 rounded-lg bg-white/5 flex items-center justify-center">
                          <div className="h-3 w-3 rounded-full border-2 border-foreground-subtle border-t-transparent animate-spin" />
                        </div>
                        <div className="text-sm text-foreground-muted">
                          Buscando extensión…
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleQrConnect()}
                        className="group flex flex-col items-center justify-center gap-2 p-4 rounded-xl bg-gradient-to-br from-cyan/10 to-nostr/10 hover:from-cyan/20 hover:to-nostr/20 border border-cyan/30 transition-all"
                      >
                        <QrCode className="h-5 w-5 text-cyan" />
                        <div className="text-sm font-semibold">Escanear QR</div>
                        <div className="text-[10px] text-foreground-muted leading-tight">
                          nostrconnect://
                        </div>
                      </button>
                      <button
                        onClick={() => setNcState("form")}
                        className="group flex flex-col items-center justify-center gap-2 p-4 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-border transition-all"
                      >
                        <LinkIcon className="h-5 w-5 text-nostr" />
                        <div className="text-sm font-semibold">URL bunker</div>
                        <div className="text-[10px] text-foreground-muted leading-tight">
                          bunker:// o NIP-05
                        </div>
                      </button>
                    </div>
                    <div className="text-center text-[10px] font-mono tracking-wider text-foreground-subtle">
                      NIP-46 · FIRMANTE REMOTO
                    </div>

                    <p className="text-xs text-center text-foreground-subtle pt-2">
                      ¿Nuevo en Nostr?{" "}
                      <a
                        href="https://nostr.how"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-bitcoin hover:underline"
                      >
                        Empezá acá →
                      </a>
                    </p>

                    <div className="pt-1 flex flex-col items-center gap-1">
                      <button
                        type="button"
                        onClick={handleRandomUser}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-dashed border-foreground-subtle/40 bg-white/[0.02] hover:bg-white/[0.06] hover:border-nostr/50 text-[11px] font-mono tracking-wider text-foreground-muted hover:text-nostr transition-colors"
                      >
                        <Wand2 className="h-3 w-3" />
                        Generar usuario random
                      </button>
                      <span className="text-[9px] text-foreground-subtle">
                        dev · nsec guardada en localStorage
                      </span>
                    </div>
                  </motion.div>
                )}

                {method === "nostr" && ncState !== "idle" && (
                  <motion.div
                    key="nostr-connect"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-4"
                  >
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          abortRef.current?.abort();
                          abortRef.current = null;
                          signerRef.current?.close().catch(() => {});
                          signerRef.current = null;
                          setNcState("idle");
                          setNcError(null);
                          setAuthUrl(null);
                          setQrUri(null);
                          setQrDataUrl(null);
                        }}
                        className="inline-flex items-center gap-1 text-xs font-medium text-foreground-muted hover:text-foreground"
                        disabled={ncState === "connecting"}
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                        Volver
                      </button>
                      <div className="flex-1 h-px bg-border" />
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono tracking-wider text-cyan">
                        <Shield className="h-3 w-3" />
                        NIP-46
                      </span>
                    </div>

                    {ncState === "form" && (
                      <NcForm
                        url={bunkerUrl}
                        setUrl={setBunkerUrl}
                        onSubmit={handleBunkerConnect}
                      />
                    )}

                    {ncState === "qr" && (
                      <NcQr
                        uri={qrUri}
                        dataUrl={qrDataUrl}
                        authUrl={authUrl}
                        diag={ncDiag}
                        expiresAt={qrExpiresAt}
                      />
                    )}

                    {ncState === "connecting" && (
                      <NcConnecting authUrl={authUrl} />
                    )}

                    {ncState === "connected" && ncPubkey && (
                      <NcConnected pubkey={ncPubkey} />
                    )}

                    {ncState === "error" && (
                      <NcError
                        error={ncError}
                        onRetry={() => setNcState("form")}
                      />
                    )}
                  </motion.div>
                )}

                {method === "email" && (
                  <motion.form
                    key="email"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                    }}
                  >
                    <label className="block">
                      <span className="block text-xs font-medium text-foreground-muted mb-1.5">
                        Correo electrónico
                      </span>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="vos@ejemplo.com"
                        className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-border focus:border-bitcoin/50 focus:bg-white/[0.05] transition-colors text-sm placeholder:text-foreground-subtle"
                      />
                    </label>
                    <button
                      type="submit"
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-bitcoin to-yellow-500 text-black font-semibold text-sm hover:shadow-lg hover:shadow-bitcoin/30 transition-all"
                    >
                      Enviar enlace mágico
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </motion.form>
                )}
              </AnimatePresence>
            </div>

            <div className="relative px-6 py-4 bg-black/30 border-t border-border">
              <p className="text-xs text-center text-foreground-subtle">
                Al ingresar aceptás nuestros{" "}
                <a
                  href="#"
                  className="text-foreground-muted hover:text-foreground"
                >
                  Términos
                </a>
                {" · "}
                <a
                  href="#"
                  className="text-foreground-muted hover:text-foreground"
                >
                  Privacidad
                </a>
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function NcForm({
  url,
  setUrl,
  onSubmit,
}: {
  url: string;
  setUrl: (v: string) => void;
  onSubmit: () => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (url.trim()) onSubmit();
      }}
      className="space-y-3"
    >
      <div>
        <h3 className="font-display font-bold text-lg mb-1">Conectá tu bunker</h3>
        <p className="text-xs text-foreground-muted leading-relaxed">
          Pegá la URL <span className="font-mono text-cyan">bunker://</span>{" "}
          que te da tu firmante remoto (o un NIP-05 tipo{" "}
          <span className="font-mono">usuario@dominio</span>).
        </p>
      </div>
      <label className="block">
        <span className="block text-xs font-medium text-foreground-muted mb-1.5">
          URL del bunker
        </span>
        <input
          type="text"
          required
          autoFocus
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="bunker://abc123...@relay.example.com"
          className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-border focus:border-cyan/50 focus:bg-white/[0.05] transition-colors text-sm font-mono placeholder:text-foreground-subtle"
        />
      </label>
      <button
        type="submit"
        disabled={!url.trim()}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-nostr to-purple-600 text-white font-semibold text-sm hover:shadow-lg hover:shadow-nostr/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Conectar
        <ArrowRight className="h-4 w-4" />
      </button>
      <p className="text-[11px] text-center text-foreground-subtle">
        Compatible con Amber, nsec.app, Keychat, nsecBunker y más.
      </p>
    </form>
  );
}

function NcQr({
  uri,
  dataUrl,
  authUrl,
  diag,
  expiresAt,
}: {
  uri: string | null;
  dataUrl: string | null;
  authUrl: string | null;
  diag: string[];
  expiresAt: number | null;
}) {
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  const remainingMs = expiresAt ? Math.max(0, expiresAt - now) : null;
  const countdown =
    remainingMs !== null
      ? `${Math.floor(remainingMs / 60000)}:${String(
          Math.floor((remainingMs % 60000) / 1000),
        ).padStart(2, "0")}`
      : null;
  async function copy() {
    if (!uri) return;
    try {
      await navigator.clipboard.writeText(uri);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  }
  return (
    <div className="flex flex-col items-center text-center gap-4">
      <div>
        <h3 className="font-display font-bold text-lg mb-1">
          Escaneá con tu firmante
        </h3>
        <p className="text-xs text-foreground-muted max-w-xs">
          Abrí Amber, nsec.app o cualquier firmante compatible con NIP-46 y
          escaneá este QR.
        </p>
      </div>

      <div className="relative rounded-xl overflow-hidden p-2 bg-black border border-cyan/30">
        {dataUrl ? (
          <img
            src={dataUrl}
            alt="nostrconnect QR"
            className="relative w-[260px] h-[260px] block"
          />
        ) : (
          <div className="relative w-[260px] h-[260px] flex items-center justify-center">
            <div className="h-6 w-6 rounded-full border-2 border-cyan border-t-transparent animate-spin" />
          </div>
        )}
      </div>

      {uri && (
        <a
          href={uri}
          className="md:hidden w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-nostr to-purple-600 text-white font-semibold text-sm hover:shadow-lg hover:shadow-nostr/30 transition-all"
        >
          <Smartphone className="h-4 w-4" />
          Abrir en Amber
        </a>
      )}

      <div className="flex items-center gap-3 text-[10px] font-mono">
        <div className="inline-flex items-center gap-1.5 text-cyan">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan" />
          </span>
          ESPERANDO FIRMANTE…
        </div>
        {countdown && (
          <span className="text-foreground-subtle">
            expira en{" "}
            <span
              className={cn(
                "text-foreground font-semibold tabular-nums",
                remainingMs !== null && remainingMs < 30_000 && "text-danger",
              )}
            >
              {countdown}
            </span>
          </span>
        )}
      </div>

      {uri && (
        <button
          onClick={copy}
          className="group w-full inline-flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-border hover:bg-white/[0.06] font-mono text-[11px]"
        >
          <span className="truncate text-foreground-muted">{uri}</span>
          {copied ? (
            <Check className="h-3.5 w-3.5 text-success shrink-0" />
          ) : (
            <Copy className="h-3.5 w-3.5 text-foreground-subtle group-hover:text-foreground-muted shrink-0" />
          )}
        </button>
      )}

      {authUrl && (
        <a
          href={authUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-nostr/10 border border-nostr/30 text-nostr text-xs font-semibold hover:bg-nostr/20 transition-colors"
        >
          Autorizar en el firmante
          <ArrowRight className="h-3.5 w-3.5" />
        </a>
      )}

      {diag.length > 0 && (
        <details className="w-full rounded-lg bg-black/40 border border-border">
          <summary className="px-3 py-2 text-[10px] font-mono tracking-wider text-foreground-muted cursor-pointer hover:text-foreground select-none">
            DEBUG · {diag.length} evento(s)
          </summary>
          <div className="max-h-40 overflow-y-auto border-t border-border p-2 space-y-0.5">
            {diag.map((line, i) => (
              <div
                key={i}
                className="font-mono text-[10px] text-foreground-muted whitespace-pre-wrap break-all text-left"
              >
                {line}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function NcConnecting({ authUrl }: { authUrl: string | null }) {
  return (
    <div className="flex flex-col items-center text-center gap-4 py-6">
      <div className="relative h-14 w-14">
        <div className="absolute inset-0 rounded-full border-2 border-nostr/20" />
        <div className="absolute inset-0 rounded-full border-2 border-nostr border-t-transparent animate-spin" />
        <Shield className="absolute inset-0 m-auto h-5 w-5 text-nostr" />
      </div>
      <div>
        <h3 className="font-display font-bold text-lg">Conectando…</h3>
        <p className="text-sm text-foreground-muted mt-1 max-w-xs">
          Esperando que aceptes la conexión desde tu firmante remoto.
        </p>
      </div>
      {authUrl && (
        <a
          href={authUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-nostr/10 border border-nostr/30 text-nostr text-xs font-semibold hover:bg-nostr/20 transition-colors"
        >
          Autorizar en el firmante
          <ArrowRight className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}

function NcConnected({ pubkey }: { pubkey: string }) {
  const short = `${pubkey.slice(0, 10)}…${pubkey.slice(-8)}`;
  return (
    <div className="flex flex-col items-center text-center gap-4 py-4">
      <div className="relative h-14 w-14 rounded-full bg-success/15 border border-success/30 flex items-center justify-center">
        <Check className="h-6 w-6 text-success" strokeWidth={3} />
      </div>
      <div>
        <h3 className="font-display font-bold text-lg">¡Conectado!</h3>
        <p className="text-sm text-foreground-muted mt-1">
          Tu firmante remoto está vinculado.
        </p>
      </div>
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-border font-mono text-xs text-foreground-muted">
        <span className="opacity-60">pubkey</span>
        <span className="text-foreground">{short}</span>
      </div>
      <div className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-bitcoin to-yellow-500 text-black font-semibold text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Abriendo tu dashboard…
      </div>
    </div>
  );
}

function NcError({
  error,
  onRetry,
}: {
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-danger/10 border border-danger/30 p-4">
        <div className="text-sm font-semibold text-danger mb-1">
          No se pudo conectar
        </div>
        <div className="text-xs text-foreground-muted break-words">
          {error ?? "Error desconocido"}
        </div>
      </div>
      <button
        onClick={onRetry}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/[0.03] border border-border hover:bg-white/[0.06] font-semibold text-sm transition-colors"
      >
        Reintentar
      </button>
    </div>
  );
}
