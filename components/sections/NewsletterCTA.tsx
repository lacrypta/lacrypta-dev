"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  Check,
  KeyRound,
  Loader2,
  Mail,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";

type SubscribePhase = "idle" | "sending" | "done" | "error";

type SubscribeResult = {
  ok?: boolean;
  exists?: boolean;
  message?: string;
  error?: string;
};

function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value.trim().toLowerCase());
}

function isLikelyNpub(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v.startsWith("npub1") || /^[0-9a-f]{64}$/u.test(v);
}

export default function NewsletterCTA() {
  const { auth, ready } = useAuth();
  const [email, setEmail] = useState("");
  const [npub, setNpub] = useState("");
  const [npubTouched, setNpubTouched] = useState(false);
  const [phase, setPhase] = useState<SubscribePhase>("idle");
  const [error, setError] = useState("");
  const [alreadySubscribed, setAlreadySubscribed] = useState(false);

  // Prefill the npub field from the logged-in session, but never clobber a
  // value the user has started editing themselves.
  useEffect(() => {
    let cancelled = false;
    if (!ready || !auth?.pubkey || npubTouched) return;
    void (async () => {
      const { nip19 } = await import("nostr-tools");
      if (cancelled) return;
      setNpub((current) => (current.trim() ? current : nip19.npubEncode(auth.pubkey)));
    })();
    return () => {
      cancelled = true;
    };
  }, [auth?.pubkey, ready, npubTouched]);

  const trimmedEmail = email.trim();
  const trimmedNpub = npub.trim();
  const emailValid = !trimmedEmail || isLikelyEmail(trimmedEmail);
  const npubValid = !trimmedNpub || isLikelyNpub(trimmedNpub);
  const hasIdentity = Boolean(trimmedEmail) || Boolean(trimmedNpub);
  const canSubmit =
    phase !== "sending" && hasIdentity && emailValid && npubValid;

  async function handleSubmit() {
    if (!canSubmit) return;
    setPhase("sending");
    setError("");
    setAlreadySubscribed(false);
    try {
      const res = await fetch("/api/events-subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: trimmedEmail || undefined,
          npub: trimmedNpub || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as SubscribeResult;
      if (!res.ok) {
        throw new Error(data.error || "No se pudo crear la suscripcion.");
      }
      setAlreadySubscribed(Boolean(data.exists));
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la suscripcion.");
      setPhase("error");
    }
  }

  function resetOnEdit() {
    if (phase === "done" || phase === "error") {
      setPhase("idle");
      setError("");
      setAlreadySubscribed(false);
    }
  }

  return (
    <section
      id="oportunidades"
      className="relative overflow-hidden border-t border-border bg-[linear-gradient(180deg,#0a0d1a_0%,#05070e_100%)]"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <motion.div
          className="absolute -top-32 left-1/2 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-bitcoin/[0.08] blur-3xl"
          animate={{ x: [-30, 30, -30], y: [0, -16, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="absolute left-1/2 top-0 h-px w-full max-w-2xl -translate-x-1/2 bg-gradient-to-r from-transparent via-bitcoin/50 to-transparent" />
      </div>

      <div className="relative mx-auto max-w-2xl px-6 py-20 text-center sm:px-8 sm:py-24">
        <motion.span
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="inline-flex items-center gap-2 rounded-full border border-bitcoin/30 bg-bitcoin/[0.06] px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-[0.25em] text-bitcoin"
        >
          <Sparkles className="h-3 w-3" />
          Oportunidades
        </motion.span>

        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5, ease: "easeOut", delay: 0.05 }}
          className="mt-5 font-display text-3xl font-black leading-[1.05] tracking-tight sm:text-4xl md:text-5xl"
        >
          La data que importa{" "}
          <span className="text-gradient-hero">en tu inbox</span>
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5, ease: "easeOut", delay: 0.1 }}
          className="mt-4 text-sm leading-relaxed text-foreground-muted sm:text-base"
        >
          Cero spam. Nuevas hackatons y oportunidades de trabajo por email o
          Nostr. Suscribite con tu email, tu npub, o ambos.
        </motion.p>

        <motion.form
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5, ease: "easeOut", delay: 0.15 }}
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
          className="mx-auto mt-8 max-w-xl space-y-3 text-left"
          noValidate
        >
          <Field
            id="subscribe-email"
            label="Email"
            icon={<Mail className="h-4 w-4" aria-hidden />}
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="vos@dominio.com"
            value={email}
            invalid={!emailValid}
            onChange={(v) => {
              setEmail(v);
              resetOnEdit();
            }}
          />
          <Field
            id="subscribe-npub"
            label="npub (Nostr)"
            icon={<KeyRound className="h-4 w-4" aria-hidden />}
            type="text"
            autoComplete="off"
            placeholder="npub1…"
            value={npub}
            invalid={!npubValid}
            onChange={(v) => {
              setNpub(v);
              setNpubTouched(true);
              resetOnEdit();
            }}
          />

          <button
            type="submit"
            disabled={!canSubmit}
            className="group inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-bitcoin to-bitcoin/80 px-5 py-3 text-sm font-semibold text-black shadow-lg shadow-bitcoin/20 transition-all hover:scale-[1.02] hover:shadow-bitcoin/40 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
          >
            {phase === "sending" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Suscribiendo
              </>
            ) : phase === "done" ? (
              <>
                <Check className="h-4 w-4" />
                {alreadySubscribed ? "Ya estabas suscripto" : "Suscripto"}
              </>
            ) : (
              <>
                Suscribirme
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </button>
        </motion.form>

        <div className="mt-4" aria-live="polite">
          {phase === "done" && (
            <StatusLine tone="success" icon={<Check className="h-3.5 w-3.5" />}>
              {alreadySubscribed
                ? "Ya estabas en la lista. No hicimos cambios."
                : "Listo, te sumamos a la lista de oportunidades."}
            </StatusLine>
          )}
          {phase === "error" && error && (
            <StatusLine tone="error" icon={<AlertCircle className="h-3.5 w-3.5" />}>
              {error}
            </StatusLine>
          )}
          {phase === "idle" && !hasIdentity && (
            <p className="text-[11px] text-foreground-subtle">
              Completá al menos uno: email o npub.
            </p>
          )}
          {phase === "idle" && hasIdentity && (!emailValid || !npubValid) && (
            <StatusLine tone="error" icon={<AlertCircle className="h-3.5 w-3.5" />}>
              {!emailValid ? "Revisá el email." : "Revisá la npub."}
            </StatusLine>
          )}
        </div>
      </div>
    </section>
  );
}

function Field({
  autoComplete,
  icon,
  id,
  inputMode,
  invalid,
  label,
  onChange,
  placeholder,
  type,
  value,
}: {
  autoComplete: string;
  icon: ReactNode;
  id: string;
  inputMode?: "email" | "text";
  invalid: boolean;
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  type: string;
  value: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground-subtle">
          {icon}
        </span>
        <input
          ref={inputRef}
          id={id}
          type={type}
          autoComplete={autoComplete}
          inputMode={inputMode}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "w-full rounded-xl border bg-background-card/60 py-3 pl-9 pr-3 text-sm transition-all placeholder:text-foreground-subtle focus:bg-background-card focus:outline-none focus:ring-2",
            invalid
              ? "border-danger/50 focus:border-danger/60 focus:ring-danger/20"
              : "border-border focus:border-bitcoin/60 focus:ring-bitcoin/20",
          )}
        />
      </div>
    </div>
  );
}

function StatusLine({
  children,
  icon,
  tone = "muted",
}: {
  children: ReactNode;
  icon: ReactNode;
  tone?: "muted" | "error" | "success";
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px]",
        tone === "error"
          ? "border-danger/30 bg-danger/10 text-danger"
          : tone === "success"
            ? "border-success/30 bg-success/10 text-success"
            : "border-border bg-white/[0.03] text-foreground-muted",
      )}
    >
      {icon}
      {children}
    </div>
  );
}
