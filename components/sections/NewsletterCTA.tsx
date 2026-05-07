"use client";

import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Check, Mail, Sparkles } from "lucide-react";

type Status = "idle" | "submitting" | "success" | "error";

export default function NewsletterCTA() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "submitting" || status === "success") return;
    if (!email.trim()) return;
    setStatus("submitting");
    // TODO: cablear endpoint real cuando definamos servicio.
    console.log("[newsletter] subscribe:", email);
    await new Promise((r) => setTimeout(r, 400));
    setStatus("success");
  }

  return (
    <section id="oportunidades" className="relative overflow-hidden border-t border-border bg-[linear-gradient(180deg,#0a0d1a_0%,#05070e_100%)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
      >
        <motion.div
          className="absolute -top-32 left-1/2 -translate-x-1/2 h-[420px] w-[820px] rounded-full bg-bitcoin/[0.08] blur-3xl"
          animate={{ x: [-30, 30, -30], y: [0, -16, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 h-px w-full max-w-2xl bg-gradient-to-r from-transparent via-bitcoin/50 to-transparent" />
      </div>

      <div className="relative max-w-2xl mx-auto px-6 sm:px-8 py-20 sm:py-24 text-center">
        <motion.span
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="inline-flex items-center gap-2 rounded-full border border-bitcoin/30 bg-bitcoin/[0.06] px-3 py-1.5 text-[10px] font-mono font-bold tracking-[0.25em] uppercase text-bitcoin"
        >
          <Sparkles className="h-3 w-3" />
          Oportunidades
        </motion.span>

        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5, ease: "easeOut", delay: 0.05 }}
          className="mt-5 font-display text-3xl sm:text-4xl md:text-5xl font-black tracking-tight leading-[1.05]"
        >
          La data que importa{" "}
          <span className="text-gradient-hero">en tu inbox</span>
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5, ease: "easeOut", delay: 0.1 }}
          className="mt-4 text-sm sm:text-base text-foreground-muted leading-relaxed"
        >
          Cero spam. Nuevas hackatons y oportunidades de trabajo.
        </motion.p>

        <motion.form
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5, ease: "easeOut", delay: 0.15 }}
          onSubmit={handleSubmit}
          className="mt-8 flex flex-col sm:flex-row items-stretch gap-2 max-w-md mx-auto"
          noValidate
        >
          <label htmlFor="newsletter-email" className="sr-only">
            Email
          </label>
          <div className="relative flex-1">
            <Mail
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground-subtle"
              aria-hidden
            />
            <input
              id="newsletter-email"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              placeholder="En construcción"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled
              aria-describedby="newsletter-status"
              className="w-full pl-9 pr-3 py-3 rounded-xl text-sm bg-background-card/60 border border-border focus:border-bitcoin/60 focus:bg-background-card focus:outline-none focus:ring-2 focus:ring-bitcoin/20 placeholder:text-foreground-subtle transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>
          <button
            type="submit"
            disabled
            className="group inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm bg-gradient-to-r from-bitcoin to-bitcoin/80 text-black shadow-lg shadow-bitcoin/20 hover:shadow-bitcoin/40 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            En construcción
          </button>
        </motion.form>

        <p
          id="newsletter-status"
          className="mt-3 text-[11px] text-foreground-subtle"
          aria-live="polite"
        >
          El formulario de suscripción está en construcción.
        </p>
      </div>
    </section>
  );
}
