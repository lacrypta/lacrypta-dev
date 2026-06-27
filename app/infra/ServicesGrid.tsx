"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Copy, Activity, ArrowUpRight, Wifi, WifiOff } from "lucide-react";
import {
  SERVICES,
  type Service,
  StatusBadge,
} from "@/components/sections/Infrastructure";
import type { LightningNodeStats } from "@/lib/lightningNode";
import type { InfraStatus } from "@/lib/infraStatus";
import { cn } from "@/lib/cn";

/** Compact BTC formatting — kept here so this client module avoids importing
 * the server-only `lib/lightningNode` runtime (which uses `"use cache"`). */
function formatCapacityBtc(sats: number | null): string | null {
  if (sats == null) return null;
  return `${(sats / 1e8).toFixed(2)} BTC`;
}

type Stat = { label: string; value: string };

/** Per-card realtime overlay derived from server-side probes. */
type Realtime = {
  /** Overrides the static stats with live values. */
  stats?: Stat[];
  /** Show the green "Datos en vivo" pulse above the stats. */
  live?: boolean;
  /** Real connection result — drives the connection badge (null = no probe). */
  online?: boolean | null;
  /** Label for the external link button. */
  linkLabel?: string;
};

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
} as const;

const LINK_LABELS: Record<string, string> = {
  lightning: "Ver en Amboss",
  lawallet: "Abrir LaWallet",
};

function buildRealtime(
  service: Service,
  lightningStats: LightningNodeStats,
  status: InfraStatus,
): Realtime {
  const linkLabel = LINK_LABELS[service.id];

  switch (service.id) {
    case "lightning": {
      const capacity = formatCapacityBtc(lightningStats.capacitySats);
      const channels = lightningStats.channelCount;
      if (!capacity && channels == null) return { linkLabel };
      return {
        live: true,
        linkLabel,
        stats: [
          { label: "Capacidad", value: capacity ?? "—" },
          { label: "Canales", value: channels != null ? String(channels) : "—" },
        ],
      };
    }
    case "nostr": {
      const s = status.nostr;
      return {
        live: true,
        online: s.online,
        stats: [
          { label: "Software", value: s.software ?? "strfry" },
          { label: "Versión", value: s.version ?? "—" },
        ],
      };
    }
    case "blossom": {
      const s = status.blossom;
      return {
        live: true,
        online: s.online,
        stats: [
          { label: "Protocolo", value: "BUD-01" },
          { label: "Estado", value: s.online ? "Online" : "Offline" },
        ],
      };
    }
    case "lawallet": {
      const s = status.lawallet;
      return {
        live: true,
        online: s.online,
        linkLabel,
        stats: [
          { label: "Licencia", value: "MIT" },
          { label: "Versión", value: s.version ?? "—" },
        ],
      };
    }
    default:
      return { linkLabel };
  }
}

export default function ServicesGrid({
  lightningStats,
  infraStatus,
}: {
  lightningStats: LightningNodeStats;
  infraStatus: InfraStatus;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {SERVICES.map((s, i) => (
        <InfraCard
          key={s.id}
          service={s}
          index={i}
          realtime={buildRealtime(s, lightningStats, infraStatus)}
        />
      ))}
    </div>
  );
}

function ConnectionBadge({ online }: { online: boolean }) {
  if (online) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-success/10 border border-success/30 text-[10px] font-mono font-semibold tracking-wider text-success">
        <Wifi className="h-2.5 w-2.5" />
        CONECTADO
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-danger/10 border border-danger/30 text-[10px] font-mono font-semibold tracking-wider text-danger">
      <WifiOff className="h-2.5 w-2.5" />
      SIN CONEXIÓN
    </span>
  );
}

function InfraCard({
  service,
  index,
  realtime,
}: {
  service: Service;
  index: number;
  realtime: Realtime;
}) {
  const a = accentMap[service.accent];
  const Icon = service.icon;
  const isLive = service.status === "live";

  const stats = realtime.stats ?? service.stats;
  const hasLiveBadge = Boolean(realtime.live);

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.45, delay: index * 0.05 }}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border transition-all",
        a.border,
        "bg-background-card/80 backdrop-blur-sm hover:-translate-y-1 hover:shadow-2xl",
        a.glow,
      )}
    >
      <div
        className={cn(
          "absolute inset-0 bg-gradient-to-br opacity-40 group-hover:opacity-70 transition-opacity pointer-events-none",
          a.gradient,
        )}
      />

      <div className="relative flex flex-1 flex-col p-6">
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
          {realtime.online != null ? (
            <ConnectionBadge online={realtime.online} />
          ) : (
            <StatusBadge status={service.status} />
          )}
        </div>

        <h3 className="font-display text-xl font-bold mb-2 tracking-tight">
          {service.name}
        </h3>
        <p className="text-sm text-foreground-muted leading-relaxed">
          {service.description}
        </p>

        {stats && (
          <div className="mt-5 pt-5 border-t border-border">
            {hasLiveBadge && (
              <div className="mb-3 inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-success">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success" />
                </span>
                Datos en vivo
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              {stats.map((s) => (
                <div key={s.label}>
                  <div className="text-[10px] font-mono uppercase tracking-wider text-foreground-subtle">
                    {s.label}
                  </div>
                  <div
                    className={cn(
                      "text-sm font-semibold mt-0.5 font-mono break-words",
                      isLive ? a.text : "text-foreground-muted",
                    )}
                  >
                    {s.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {service.endpoint && (
          <EndpointRow endpoint={service.endpoint} accent={service.accent} />
        )}

        {service.href && (
          <a
            href={service.href}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "mt-5 inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-xs font-mono font-semibold transition-colors",
              a.border,
              a.bg,
              a.text,
              "hover:border-border-strong",
            )}
          >
            {realtime.linkLabel ?? "Abrir"}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </motion.div>
  );
}

function EndpointRow({
  endpoint,
  accent,
}: {
  endpoint: string;
  accent: Service["accent"];
}) {
  const a = accentMap[accent];
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(endpoint);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copiar endpoint ${endpoint}`}
      className={cn(
        "mt-5 flex w-full items-center gap-2 rounded-lg border border-border bg-black/30 px-3 py-2.5 text-left transition-colors hover:border-border-strong",
      )}
    >
      <Activity className={cn("h-3.5 w-3.5 shrink-0", a.text)} />
      <code className="flex-1 truncate font-mono text-xs text-foreground">
        {endpoint}
      </code>
      {copied ? (
        <Check className="h-4 w-4 shrink-0 text-success" />
      ) : (
        <Copy className="h-4 w-4 shrink-0 text-foreground-subtle transition-colors group-hover:text-foreground-muted" />
      )}
    </button>
  );
}
