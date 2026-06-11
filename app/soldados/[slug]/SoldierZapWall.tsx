"use client";

import { useEffect, useMemo, useState } from "react";
import { nip19 } from "nostr-tools";
import { Zap } from "lucide-react";
import { useNostrProfile } from "@/lib/nostrProfile";
import { subscribeToReceivedZaps, type ReceivedZap } from "@/lib/zap";

function formatSats(n: number): string {
  return n.toLocaleString("es-AR");
}

function shortNpub(pubkey: string): string {
  try {
    const npub = nip19.npubEncode(pubkey);
    return `${npub.slice(0, 10)}…${npub.slice(-4)}`;
  } catch {
    return `${pubkey.slice(0, 8)}…`;
  }
}

function relativeTime(seconds: number): string {
  const diff = Math.floor(Date.now() / 1000) - seconds;
  if (diff < 60) return "ahora";
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  if (diff < 604800) return `hace ${Math.floor(diff / 86400)} d`;
  return new Date(seconds * 1000).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
  });
}

export default function SoldierZapWall({
  recipientPubkey,
}: {
  recipientPubkey: string;
}) {
  const [zaps, setZaps] = useState<ReceivedZap[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setZaps([]);
    setReady(false);
    const seen = new Set<string>();
    const unsubscribe = subscribeToReceivedZaps(recipientPubkey, (zap) => {
      setReady(true);
      if (seen.has(zap.id)) return;
      seen.add(zap.id);
      setZaps((prev) =>
        [...prev, zap].sort((a, b) => b.createdAt - a.createdAt),
      );
    });
    // Mark as "settled" shortly after so the empty state can show even when
    // there are no zaps yet (relays won't emit an explicit "done" for us).
    const t = window.setTimeout(() => setReady(true), 4000);
    return () => {
      window.clearTimeout(t);
      unsubscribe();
    };
  }, [recipientPubkey]);

  const total = useMemo(
    () => zaps.reduce((sum, z) => sum + (z.amountSats ?? 0), 0),
    [zaps],
  );

  return (
    <div className="rounded-2xl border border-border bg-background-card/50 backdrop-blur-sm p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-lightning" />
          <h2 className="font-display font-bold text-sm uppercase tracking-widest text-foreground-muted">
            Zaps recibidos
          </h2>
          <span className="inline-flex items-center gap-1 rounded-full bg-lightning/15 px-1.5 py-0.5 text-[10px] font-mono font-bold text-lightning">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lightning opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-lightning" />
            </span>
            EN VIVO
          </span>
        </div>
        {total > 0 && (
          <span className="font-mono text-xs font-bold tabular-nums text-lightning">
            ⚡ {formatSats(total)} sats
          </span>
        )}
      </div>

      {zaps.length === 0 ? (
        <p className="py-6 text-center text-sm text-foreground-subtle">
          {ready
            ? "Todavía no recibió zaps. ¡Sé el primero! ⚡"
            : "Buscando zaps…"}
        </p>
      ) : (
        <ul className="space-y-3 -my-1 max-h-[28rem] overflow-y-auto pr-1">
          {zaps.map((zap) => (
            <ZapWallItem key={zap.id} zap={zap} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ZapWallItem({ zap }: { zap: ReceivedZap }) {
  const { profile } = useNostrProfile(zap.senderPubkey);
  const name =
    profile?.display_name ||
    profile?.name ||
    (zap.senderPubkey ? shortNpub(zap.senderPubkey) : "Anónimo");

  return (
    <li className="flex gap-3 rounded-xl border border-border bg-white/[0.02] p-3">
      <Avatar pubkey={zap.senderPubkey} picture={profile?.picture} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold">{name}</span>
          {zap.amountSats != null && (
            <span className="shrink-0 inline-flex items-center gap-1 rounded-full border border-lightning/30 bg-lightning/[0.08] px-2 py-0.5 text-[11px] font-mono font-bold tabular-nums text-lightning">
              <Zap className="h-3 w-3" strokeWidth={3} />
              {formatSats(zap.amountSats)}
            </span>
          )}
        </div>
        {zap.comment && (
          <p className="mt-1 break-words text-sm text-foreground-muted whitespace-pre-wrap">
            {zap.comment}
          </p>
        )}
        <div className="mt-1 text-[10px] font-mono uppercase tracking-widest text-foreground-subtle">
          {relativeTime(zap.createdAt)}
        </div>
      </div>
    </li>
  );
}

function Avatar({
  pubkey,
  picture,
}: {
  pubkey: string | null;
  picture?: string;
}) {
  const fallback = pubkey ? pubkey.slice(0, 2).toUpperCase() : "⚡";
  return (
    <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-lightning/30 to-bitcoin/30 ring-1 ring-border-strong flex items-center justify-center text-[11px] font-display font-bold">
      {picture ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={picture}
          alt=""
          className="block h-full w-full object-cover object-center"
          referrerPolicy="no-referrer"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <span>{fallback}</span>
      )}
    </span>
  );
}
