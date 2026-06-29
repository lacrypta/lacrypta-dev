"use client";

import { useMemo, useState } from "react";
import { npubEncode } from "nostr-tools/nip19";
import { User } from "lucide-react";
import { useNostrProfile } from "@/lib/nostrProfile";
import { cn } from "@/lib/cn";

type Size = "xs" | "sm" | "md";

const SIZES: Record<Size, { av: string; icon: string; name: string; sub: string }> = {
  xs: { av: "h-4 w-4", icon: "h-2.5 w-2.5", name: "text-[11px]", sub: "text-[9px]" },
  sm: { av: "h-5 w-5", icon: "h-3 w-3", name: "text-xs", sub: "text-[9px]" },
  md: { av: "h-7 w-7", icon: "h-4 w-4", name: "text-sm", sub: "text-[10px]" },
};

function toNpub(pubkey: string): string {
  try {
    return npubEncode(pubkey);
  } catch {
    return pubkey;
  }
}

/**
 * Renders a referenced Nostr pubkey as its profile: avatar + display name,
 * resolved via the kind-0 cache. Falls back to a placeholder avatar and a
 * truncated npub while loading or when no profile exists. Links to njump.me.
 */
export default function NpubBadge({
  pubkey,
  size = "sm",
  showNpub = false,
  link = true,
  className,
}: {
  pubkey: string;
  size?: Size;
  /** Show the truncated npub under the name. */
  showNpub?: boolean;
  /** Wrap in a link to njump.me (default true). */
  link?: boolean;
  className?: string;
}) {
  const npub = useMemo(() => toNpub(pubkey), [pubkey]);
  const { profile } = useNostrProfile(pubkey || null);
  const [imgErr, setImgErr] = useState(false);

  const short = npub.startsWith("npub1") ? `${npub.slice(0, 10)}…${npub.slice(-4)}` : `${pubkey.slice(0, 8)}…`;
  const name = profile?.display_name || profile?.name || short;
  const pic = profile?.picture && !imgErr ? profile.picture : null;
  const s = SIZES[size];

  const inner = (
    <span className={cn("inline-flex items-center gap-1.5 min-w-0 max-w-full", className)}>
      {pic ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={pic}
          alt=""
          loading="lazy"
          onError={() => setImgErr(true)}
          className={cn("shrink-0 rounded-full object-cover border border-border bg-background-card", s.av)}
        />
      ) : (
        <span className={cn("shrink-0 inline-flex items-center justify-center rounded-full border border-border bg-nostr/15 text-nostr", s.av)}>
          <User className={s.icon} />
        </span>
      )}
      <span className="min-w-0">
        <span className={cn("block truncate font-medium text-foreground", s.name)}>{name}</span>
        {showNpub && name !== short && (
          <span className={cn("block truncate font-mono text-foreground-subtle", s.sub)}>{short}</span>
        )}
      </span>
    </span>
  );

  if (!pubkey) return null;
  if (!link) return inner;
  return (
    <a
      href={`https://njump.me/${npub}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title={npub}
      className="inline-flex max-w-full min-w-0 hover:opacity-80 transition-opacity"
    >
      {inner}
    </a>
  );
}
