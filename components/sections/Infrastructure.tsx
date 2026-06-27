"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import {
  Server,
  Zap,
  Radio,
  Flower2,
  Wallet,
  ArrowRight,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/cn";

export type ServiceStatus = "live" | "coming";

export type Service = {
  id: string;
  name: string;
  description: string;
  status: ServiceStatus;
  icon: typeof Server;
  /** Official brand image (overrides the lucide `icon` when set). */
  iconSrc?: string;
  accent: "bitcoin" | "lightning" | "nostr" | "cyan" | "green";
  stats?: { label: string; value: string }[];
  href?: string;
  feature?: boolean;
  /** Public connection endpoint (URL or websocket) users can copy. */
  endpoint?: string;
};

export const SERVICES: Service[] = [
  {
    id: "lightning",
    name: "Nodo Lightning",
    description: "Creá canales de lightning.",
    status: "live",
    icon: Zap,
    accent: "lightning",
    href: "https://amboss.space/node/030ef51039f200c65c5ec4037946b18d7129f63057bb7fe54ad707407a94b37ee0",
    stats: [
      { label: "Implementación", value: "LND" },
      { label: "Canales", value: "públicos" },
    ],
    feature: true,
  },
  {
    id: "nostr",
    name: "Relay Nostr",
    description: "Publicá los eventos acá.",
    status: "live",
    icon: Radio,
    iconSrc: "/brand/nostr.svg",
    accent: "nostr",
    endpoint: "wss://relay.lacrypta.ar",
    stats: [
      { label: "Protocolo", value: "NIP-01+" },
      { label: "Endpoint", value: "relay.lacrypta.ar" },
    ],
  },
  {
    id: "blossom",
    name: "Servidor Blossom",
    description: "Alojá los archivos de manera descentralizada.",
    status: "live",
    icon: Flower2,
    iconSrc: "/brand/blossom.png",
    accent: "cyan",
    endpoint: "https://blossom.lacrypta.ar",
    stats: [
      { label: "Protocolo", value: "BUD-01" },
      { label: "Endpoint", value: "blossom.lacrypta.ar" },
    ],
  },
  {
    id: "lawallet",
    name: "LaWallet Stack",
    description: "Creá lightning addresses y tarjetas NFC.",
    status: "live",
    icon: Wallet,
    iconSrc: "/brand/lawallet.svg",
    accent: "nostr",
    href: "https://beta.lawallet.io",
    stats: [
      { label: "Licencia", value: "MIT" },
      { label: "Versión", value: "—" },
    ],
  },
];

const accentMap = {
  bitcoin: {
    text: "text-bitcoin",
    bg: "bg-bitcoin/10",
    border: "border-bitcoin/30",
    glow: "group-hover:shadow-bitcoin/20",
    gradient: "from-bitcoin/20 via-transparent to-transparent",
  },
  lightning: {
    text: "text-lightning",
    bg: "bg-lightning/10",
    border: "border-lightning/30",
    glow: "group-hover:shadow-lightning/20",
    gradient: "from-lightning/20 via-transparent to-transparent",
  },
  nostr: {
    text: "text-nostr",
    bg: "bg-nostr/10",
    border: "border-nostr/30",
    glow: "group-hover:shadow-nostr/20",
    gradient: "from-nostr/20 via-transparent to-transparent",
  },
  cyan: {
    text: "text-cyan",
    bg: "bg-cyan/10",
    border: "border-cyan/30",
    glow: "group-hover:shadow-cyan/20",
    gradient: "from-cyan/20 via-transparent to-transparent",
  },
  green: {
    text: "text-success",
    bg: "bg-success/10",
    border: "border-success/30",
    glow: "group-hover:shadow-success/20",
    gradient: "from-success/20 via-transparent to-transparent",
  },
};

export default function Infrastructure() {
  return (
    <section
      id="infrastructure"
      className="relative py-24 sm:py-32 border-t border-border"
    >
      <div className="absolute inset-0 -z-10 bg-grid bg-grid-fade opacity-30" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-14">
          <div className="max-w-2xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-white/5 text-xs font-mono tracking-wider text-foreground-muted mb-5"
            >
              <Server className="h-3 w-3" />
              INFRAESTRUCTURA PÚBLICA
            </motion.div>
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="font-display text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight"
            >
              Servicios que <span className="text-gradient-nostr">operamos</span>
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="mt-5 text-lg text-foreground-muted leading-relaxed"
            >
              Infraestructura abierta para builders y la comunidad. Usala,
              forkeala, conectate — es toda tuya.
            </motion.p>
          </div>
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="inline-flex items-center gap-3 self-start md:self-end"
          >
            <span className="inline-flex items-center gap-1.5 text-xs font-mono text-success">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
              </span>
              TODOS LOS SISTEMAS OPERATIVOS
            </span>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {SERVICES.map((svc, i) => (
            <ServiceCard key={svc.id} service={svc} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

export function ServiceCard({
  service,
  index = 0,
}: {
  service: Service;
  index?: number;
}) {
  const a = accentMap[service.accent];
  const Icon = service.icon;
  const isLive = service.status === "live";

  const Wrapper: React.ElementType = service.href ? Link : "div";
  const wrapperProps = service.href ? { href: service.href } : {};

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5, delay: index * 0.06 }}
    >
      <Wrapper
        {...wrapperProps}
        className={cn(
          "group relative overflow-hidden rounded-2xl border transition-all cursor-pointer block",
          a.border,
          "bg-background-card/80 backdrop-blur-sm",
          "hover:-translate-y-1 hover:shadow-2xl",
          a.glow,
        )}
      >
        <div
          className={cn(
            "absolute inset-0 bg-gradient-to-br opacity-40 group-hover:opacity-70 transition-opacity pointer-events-none",
            a.gradient,
          )}
        />

        <div className="relative p-6">
          <div className="flex items-start justify-between mb-5">
            <div
              className={cn(
                "inline-flex h-12 w-12 items-center justify-center rounded-xl border",
                a.bg,
                a.border,
                a.text,
              )}
            >
              {service.iconSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={service.iconSrc}
                  alt={`${service.name} logo`}
                  className="h-7 w-7 object-contain"
                />
              ) : (
                <Icon className="h-5 w-5" strokeWidth={2} />
              )}
            </div>
            <StatusBadge status={service.status} />
          </div>

          <h3 className="font-display text-xl font-bold mb-2 tracking-tight">
            {service.name}
          </h3>
          <p className="text-sm text-foreground-muted leading-relaxed">
            {service.description}
          </p>

          {service.stats && (
            <div className="mt-5 pt-5 border-t border-border grid grid-cols-2 gap-3">
              {service.stats.map((s) => (
                <div key={s.label}>
                  <div className="text-[10px] font-mono uppercase tracking-wider text-foreground-subtle">
                    {s.label}
                  </div>
                  <div
                    className={cn(
                      "text-sm font-semibold mt-0.5 font-mono",
                      isLive ? a.text : "text-foreground-muted",
                    )}
                  >
                    {s.value}
                  </div>
                </div>
              ))}
            </div>
          )}

          {service.href && (
            <div
              className={cn(
                "absolute bottom-5 right-5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/5 border border-border opacity-0 group-hover:opacity-100 transition-all",
                a.text,
              )}
            >
              <ArrowRight className="h-4 w-4" />
            </div>
          )}
        </div>
      </Wrapper>
    </motion.div>
  );
}

export function StatusBadge({ status }: { status: ServiceStatus }) {
  if (status === "live") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-success/10 border border-success/30 text-[10px] font-mono font-semibold tracking-wider text-success">
        <Activity className="h-2.5 w-2.5" />
        EN LÍNEA
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/5 border border-border text-[10px] font-mono font-semibold tracking-wider text-foreground-muted">
      <span className="h-1.5 w-1.5 rounded-full bg-foreground-subtle" />
      PRÓXIMAMENTE
    </span>
  );
}
