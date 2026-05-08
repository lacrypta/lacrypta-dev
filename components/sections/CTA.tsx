"use client";

import { motion } from "framer-motion";
import { ArrowRight, Zap } from "lucide-react";
import { GithubIcon } from "@/components/BrandIcons";
import Link from "next/link";

export default function CTA() {
  return (
    <section className="relative py-24 sm:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="relative overflow-hidden rounded-3xl border border-border-strong"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-bitcoin/20 via-nostr/15 to-cyan/20" />
          <div className="absolute inset-0 bg-grid opacity-30" />
          <div className="noise" />

          <div className="relative px-6 py-16 sm:py-20 sm:px-12 md:px-16 text-center">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="font-display text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight max-w-3xl mx-auto"
            >
              ¿Listos para{" "}
              <span className="text-gradient-hero animate-gradient-x">
                construir con nosotros?
              </span>
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="mt-5 text-lg text-foreground-muted max-w-2xl mx-auto leading-relaxed"
            >
              Sumate a la comunidad en Nostr, abrí un PR en GitHub o caete
              a nuestro próximo evento. Todo lo que hacemos es abierto, para
              siempre.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3"
            >
              <Link
                href="/projects"
                className="group inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-bitcoin to-yellow-500 text-black font-semibold shadow-xl shadow-bitcoin/30 hover:shadow-bitcoin/50 hover:scale-[1.02] transition-all"
              >
                <Zap className="h-4 w-4" strokeWidth={2.5} />
                Ver proyectos
                <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
              <a
                href="https://github.com/lacrypta/lacrypta-dev"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl glass-strong border border-border-strong font-semibold hover:bg-white/5 transition-all"
              >
                <GithubIcon className="h-4 w-4" />
                Ver en GitHub
              </a>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
