"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Zap, Trophy } from "lucide-react";
import { GithubIcon } from "@/components/BrandIcons";
import { hackathonSlugForId } from "@/lib/hackathons";
import { HACKATHON_LABELS } from "@/lib/projects";
import { getCachedProfile, type NostrProfile } from "@/lib/nostrProfile";
import { cn } from "@/lib/cn";
import type { Soldier } from "@/lib/soldiers";
import { InlineFollowButton } from "./SoldiersFollows";

function avatarSrc(s: Soldier, profilePicture?: string): string | null {
  if (profilePicture) return profilePicture;
  if (s.picture) return s.picture;
  if (s.github) return `https://github.com/${s.github}.png?size=160`;
  return null;
}

function initials(name: string): string {
  const parts = name
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .trim()
    .split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

/** A name with no human-readable info — a bare key, "Anónimo", or hex stub. */
function isPlaceholderName(name: string): boolean {
  const n = name.trim();
  if (!n || n.toLowerCase() === "anónimo" || n.toLowerCase() === "anonimo") {
    return true;
  }
  if (/^npub1[0-9a-z]+/i.test(n)) return true;
  if (/^[0-9a-f]{8,}$/i.test(n)) return true; // pure hex
  if (/^[0-9a-f]{6,}.*[…]/i.test(n)) return true; // truncated hex (e.g. "13e700e2…")
  return false;
}

function displayNameFor(s: Soldier, profile?: NostrProfile | null): string {
  if (!isPlaceholderName(s.name)) return s.name;
  return profile?.display_name || profile?.name || s.name;
}

/**
 * Higher = more complete. Soldiers missing an avatar and/or a real name sort
 * toward the end of the grid. 3 = name + avatar, 0 = neither.
 */
function completenessScore(s: Soldier, profile?: NostrProfile | null): number {
  const hasName = !isPlaceholderName(displayNameFor(s, profile));
  const hasAvatar = !!(profile?.picture || s.picture || s.github);
  return (hasName ? 2 : 0) + (hasAvatar ? 1 : 0);
}

function uniqHackathons(s: Soldier): string[] {
  const set = new Set<string>();
  for (const p of s.projects) if (p.hackathonId) set.add(p.hackathonId);
  return [...set];
}

function hackathonLabel(id: string): string {
  if (id in HACKATHON_LABELS) {
    return HACKATHON_LABELS[id as keyof typeof HACKATHON_LABELS];
  }
  return id;
}

function isHexPubkey(pubkey?: string): pubkey is string {
  return !!pubkey && /^[0-9a-f]{64}$/i.test(pubkey);
}

/** Load Nostr profiles for the whole grid (one batched request + cache). */
function useGridProfiles(soldiers: Soldier[]) {
  const [profiles, setProfiles] = useState<Record<string, NostrProfile>>({});

  const pubkeys = useMemo(
    () => soldiers.map((s) => s.pubkey).filter(isHexPubkey),
    [soldiers],
  );

  useEffect(() => {
    if (pubkeys.length === 0) return;

    // 1. Hydrate instantly from any locally-cached profiles.
    const seeded: Record<string, NostrProfile> = {};
    for (const pk of pubkeys) {
      const cached = getCachedProfile(pk);
      if (cached) seeded[pk] = cached.profile;
    }
    if (Object.keys(seeded).length) {
      setProfiles((prev) => ({ ...seeded, ...prev }));
    }

    // 2. Fetch the rest from the server batch endpoint (chunked at 50).
    let cancelled = false;
    (async () => {
      for (let i = 0; i < pubkeys.length; i += 50) {
        const chunk = pubkeys.slice(i, i + 50);
        try {
          const res = await fetch(
            `/api/nostr/profiles?pubkeys=${chunk.join(",")}`,
            { cache: "no-store" },
          );
          if (!res.ok) continue;
          const data = (await res.json()) as {
            profiles?: Record<string, NostrProfile | null>;
          };
          if (cancelled) return;
          const incoming = data.profiles ?? {};
          setProfiles((prev) => {
            const next = { ...prev };
            for (const pk of chunk) {
              const p = incoming[pk];
              if (p) next[pk] = p;
            }
            return next;
          });
        } catch {
          /* ignore — keep whatever we already have */
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pubkeys]);

  return profiles;
}

export default function SoldiersGrid({ soldiers }: { soldiers: Soldier[] }) {
  const profiles = useGridProfiles(soldiers);

  // Stable sort: complete profiles first, incomplete (missing avatar/name)
  // pushed to the end. Ties keep the original (server-provided) order.
  const ordered = useMemo(() => {
    return soldiers
      .map((s, index) => ({ s, index }))
      .sort((a, b) => {
        const ca = completenessScore(a.s, profiles[a.s.pubkey ?? ""]);
        const cb = completenessScore(b.s, profiles[b.s.pubkey ?? ""]);
        if (ca !== cb) return cb - ca;
        return a.index - b.index;
      })
      .map((x) => x.s);
  }, [soldiers, profiles]);

  if (soldiers.length === 0) {
    return (
      <div className="text-center text-foreground-muted py-16">
        Todavía no hay soldiers.
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
      {ordered.map((s) => (
        <SoldierCard
          key={s.id}
          soldier={s}
          profile={profiles[s.pubkey ?? ""]}
        />
      ))}
    </ul>
  );
}

/** Max tilt in degrees at the card edges. */
const TILT_MAX = 12;

/**
 * Mouse-tracking 3D tilt. The card rotates in perspective toward the cursor
 * and exposes CSS custom properties (`--rx`, `--ry`, `--mx`, `--my`, `--tz`)
 * that the markup binds to its transform + glare. Updates are coalesced with
 * requestAnimationFrame and written straight to the DOM, so dragging the mouse
 * never triggers a React re-render. No-ops under prefers-reduced-motion.
 */
function useTilt<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const frame = useRef<number | null>(null);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent<T>) => {
    if (reduced.current) return;
    const el = ref.current;
    if (!el) return;
    const { clientX, clientY } = e;
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      const px = (clientX - r.left) / r.width; // 0 (left) … 1 (right)
      const py = (clientY - r.top) / r.height; // 0 (top) … 1 (bottom)
      el.style.setProperty("--ry", `${(px - 0.5) * TILT_MAX}deg`);
      el.style.setProperty("--rx", `${(0.5 - py) * TILT_MAX}deg`);
      el.style.setProperty("--mx", `${px * 100}%`);
      el.style.setProperty("--my", `${py * 100}%`);
    });
  }, []);

  const onMouseEnter = useCallback(() => {
    if (reduced.current) return;
    const el = ref.current;
    if (!el) return;
    el.style.transition = "transform 100ms ease-out";
    el.style.setProperty("--tz", "1.04");
  }, []);

  const onMouseLeave = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (frame.current) cancelAnimationFrame(frame.current);
    // Smooth, springy settle back to flat.
    el.style.transition = "transform 600ms cubic-bezier(0.22, 1, 0.36, 1)";
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
    el.style.setProperty("--tz", "1");
  }, []);

  return { ref, onMouseMove, onMouseEnter, onMouseLeave };
}

function SoldierCard({
  soldier,
  profile,
}: {
  soldier: Soldier;
  profile?: NostrProfile | null;
}) {
  const tilt = useTilt<HTMLLIElement>();
  const src = avatarSrc(soldier, profile?.picture);
  const banner = profile?.banner;
  const name = displayNameFor(soldier, profile);
  const hackathons = uniqHackathons(soldier);

  return (
    <li
      ref={tilt.ref}
      onMouseMove={tilt.onMouseMove}
      onMouseEnter={tilt.onMouseEnter}
      onMouseLeave={tilt.onMouseLeave}
      style={{
        transform:
          "perspective(900px) rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg)) scale(var(--tz, 1))",
        transformStyle: "preserve-3d",
      }}
      className={cn(
        // No `overflow-hidden` here: it would flatten the preserve-3d children
        // (avatar pop / glare). The cover image clips itself instead.
        "group relative rounded-2xl border bg-background-card/60 backdrop-blur-sm flex flex-col will-change-transform hover:z-10",
        soldier.hasNostr
          ? "border-nostr/30 hover:border-nostr/60 shadow-[0_0_40px_-20px_rgba(168,85,247,0.45)] hover:shadow-[0_30px_60px_-25px_rgba(168,85,247,0.6)]"
          : "border-border hover:border-border-strong hover:shadow-[0_30px_60px_-25px_rgba(0,0,0,0.7)]",
        "transition-[border-color,box-shadow]",
      )}
    >
      {/* Glare highlight that tracks the cursor, floating above the card. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 z-20 rounded-2xl opacity-0 mix-blend-soft-light transition-opacity duration-200 group-hover:opacity-50"
        style={{
          background:
            "radial-gradient(340px circle at var(--mx, 50%) var(--my, 50%), rgba(255,255,255,0.45), transparent 85%)",
          transform: "translateZ(60px)",
        }}
      />
      {/* Cover (social-network style) */}
      <Link
        href={`/soldados/${soldier.slug}`}
        aria-label={`Ver perfil de ${name}`}
        className="relative block h-24 w-full overflow-hidden rounded-t-2xl"
      >
        {banner ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={banner}
            alt=""
            aria-hidden
            className="h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <span
            aria-hidden
            className={cn(
              "absolute inset-0",
              soldier.hasNostr
                ? "bg-gradient-to-br from-nostr/25 via-bitcoin/15 to-cyan/10"
                : "bg-gradient-to-br from-bitcoin/20 via-nostr/12 to-cyan/10",
            )}
          />
        )}
        {/* Fade the cover into the card so the avatar/name stay legible. */}
        <span
          aria-hidden
          className="absolute inset-0 bg-gradient-to-b from-transparent via-background-card/30 to-background-card"
        />
      </Link>

      <div className="relative px-5 pb-5 pt-2 flex flex-col gap-4 [transform-style:preserve-3d]">
        <div className="flex items-center gap-3 [transform-style:preserve-3d]">
          <Link
            href={`/soldados/${soldier.slug}`}
            style={{ transform: "translateZ(45px)" }}
            className="-mt-12 shrink-0"
            aria-label={`Ver perfil de ${name}`}
          >
            {src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt={name}
                className="h-16 w-16 rounded-full object-cover ring-4 ring-background-card bg-background-card"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="h-16 w-16 rounded-full ring-4 ring-background-card bg-gradient-to-br from-bitcoin/30 to-nostr/30 inline-flex items-center justify-center font-display font-bold text-sm">
                {initials(name)}
              </span>
            )}
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <Link
                href={`/soldados/${soldier.slug}`}
                className="font-display font-bold text-base truncate hover:text-bitcoin transition-colors"
              >
                {name}
              </Link>
              {soldier.hasNostr && (
                <span
                  className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-nostr/15 border border-nostr/40 text-nostr shrink-0"
                  title="Verificado en Nostr"
                  aria-label="Nostr"
                >
                  <Zap className="h-2.5 w-2.5" strokeWidth={3} />
                </span>
              )}
            </div>
            {soldier.github && (
              <a
                href={`https://github.com/${soldier.github}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-0.5 inline-flex items-center gap-1 text-xs font-mono text-foreground-subtle hover:text-foreground transition-colors"
              >
                <GithubIcon className="h-3 w-3" />
                {soldier.github}
              </a>
            )}
          </div>
        </div>

        {isHexPubkey(soldier.pubkey) && (
          <InlineFollowButton
            pubkey={soldier.pubkey}
            name={name}
            avatar={src}
            className="[transform-style:preserve-3d]"
          />
        )}

        <div className="text-[11px] font-mono text-foreground-subtle uppercase tracking-widest">
          {soldier.projects.length}{" "}
          {soldier.projects.length === 1 ? "proyecto" : "proyectos"}
          {hackathons.length > 0 && (
            <>
              {" · "}
              {hackathons.length}{" "}
              {hackathons.length === 1 ? "hackatón" : "hackatones"}
            </>
          )}
        </div>

        {hackathons.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {hackathons.map((h) => (
              <Link
                key={h}
                href={`/hackathons/${hackathonSlugForId(h)}`}
                className="inline-flex items-center gap-1 rounded-full border border-bitcoin/30 bg-bitcoin/[0.06] px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest text-bitcoin hover:bg-bitcoin/[0.14] hover:border-bitcoin/60 transition-colors"
              >
                <Trophy className="h-2.5 w-2.5" />
                {hackathonLabel(h)}
              </Link>
            ))}
          </div>
        )}

        <ul className="flex flex-col gap-1">
          {soldier.projects.slice(0, 4).map((p, i) => {
            const href = p.hackathonId
              ? `/hackathons/${hackathonSlugForId(p.hackathonId)}/${p.projectId}`
              : p.source === "nostr" && p.authorPubkey
                ? `/projects/${p.authorPubkey}/${p.projectId}`
                : `/projects/${p.projectId}`;
            return (
              <li key={`${p.projectId}-${i}`}>
                <Link
                  href={href}
                  className="group/proj inline-flex items-center gap-1.5 text-xs text-foreground-muted hover:text-foreground transition-colors"
                  title={`${p.role} · ${p.projectName}`}
                >
                  <span className="h-1 w-1 rounded-full bg-foreground-subtle group-hover/proj:bg-bitcoin transition-colors" />
                  <span className="truncate">{p.projectName}</span>
                  <span className="text-foreground-subtle text-[10px] uppercase tracking-widest">
                    · {p.role}
                  </span>
                </Link>
              </li>
            );
          })}
          {soldier.projects.length > 4 && (
            <li>
              <Link
                href={`/soldados/${soldier.slug}`}
                className="text-[10px] font-mono text-foreground-subtle hover:text-bitcoin transition-colors"
              >
                +{soldier.projects.length - 4} más
              </Link>
            </li>
          )}
        </ul>
      </div>
    </li>
  );
}
