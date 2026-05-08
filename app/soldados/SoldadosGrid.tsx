import Link from "next/link";
import { Zap, Trophy } from "lucide-react";
import { GithubIcon } from "@/components/BrandIcons";
import { HACKATHON_LABELS } from "@/lib/projects";
import { cn } from "@/lib/cn";
import type { Soldado } from "@/lib/soldados";

function avatarSrc(s: Soldado): string | null {
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

function uniqHackathons(s: Soldado): string[] {
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

export default function SoldadosGrid({ soldados }: { soldados: Soldado[] }) {
  if (soldados.length === 0) {
    return (
      <div className="text-center text-foreground-muted py-16">
        Todavía no hay soldados.
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
      {soldados.map((s) => (
        <SoldadoCard key={s.id} soldado={s} />
      ))}
    </ul>
  );
}

function SoldadoCard({ soldado }: { soldado: Soldado }) {
  const src = avatarSrc(soldado);
  const hackathons = uniqHackathons(soldado);

  return (
    <li
      className={cn(
        "group relative overflow-hidden rounded-2xl border bg-background-card/60 backdrop-blur-sm p-5 flex flex-col gap-4",
        soldado.hasNostr
          ? "border-nostr/30 hover:border-nostr/60 shadow-[0_0_40px_-20px_rgba(168,85,247,0.45)]"
          : "border-border hover:border-border-strong",
        "transition-colors",
      )}
    >
      {soldado.hasNostr && (
        <span
          aria-hidden
          className="pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full bg-nostr/15 blur-3xl"
        />
      )}

      <div className="relative flex items-center gap-3">
        <Link
          href={`/soldados/${soldado.slug}`}
          className="shrink-0 hover:scale-[1.04] transition-transform"
          aria-label={`Ver perfil de ${soldado.name}`}
        >
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt={soldado.name}
              className="h-14 w-14 rounded-full object-cover ring-1 ring-border-strong"
              loading="lazy"
            />
          ) : (
            <span className="h-14 w-14 rounded-full ring-1 ring-border-strong bg-gradient-to-br from-bitcoin/30 to-nostr/30 inline-flex items-center justify-center font-display font-bold text-sm">
              {initials(soldado.name)}
            </span>
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <Link
              href={`/soldados/${soldado.slug}`}
              className="font-display font-bold text-base truncate hover:text-bitcoin transition-colors"
            >
              {soldado.name}
            </Link>
            {soldado.hasNostr && (
              <span
                className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-nostr/15 border border-nostr/40 text-nostr shrink-0"
                title="Verificado en Nostr"
                aria-label="Nostr"
              >
                <Zap className="h-2.5 w-2.5" strokeWidth={3} />
              </span>
            )}
          </div>
          {soldado.github && (
            <a
              href={`https://github.com/${soldado.github}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-0.5 inline-flex items-center gap-1 text-xs font-mono text-foreground-subtle hover:text-foreground transition-colors"
            >
              <GithubIcon className="h-3 w-3" />
              {soldado.github}
            </a>
          )}
        </div>
      </div>

      <div className="relative text-[11px] font-mono text-foreground-subtle uppercase tracking-widest">
        {soldado.projects.length}{" "}
        {soldado.projects.length === 1 ? "proyecto" : "proyectos"}
        {hackathons.length > 0 && (
          <>
            {" · "}
            {hackathons.length}{" "}
            {hackathons.length === 1 ? "hackatón" : "hackatones"}
          </>
        )}
      </div>

      {hackathons.length > 0 && (
        <div className="relative flex flex-wrap gap-1.5">
          {hackathons.map((h) => (
            <Link
              key={h}
              href={`/hackathons/${h}`}
              className="inline-flex items-center gap-1 rounded-full border border-bitcoin/30 bg-bitcoin/[0.06] px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest text-bitcoin hover:bg-bitcoin/[0.14] hover:border-bitcoin/60 transition-colors"
            >
              <Trophy className="h-2.5 w-2.5" />
              {hackathonLabel(h)}
            </Link>
          ))}
        </div>
      )}

      <ul className="relative flex flex-col gap-1">
        {soldado.projects.slice(0, 4).map((p, i) => {
          const href = p.hackathonId
            ? `/hackathons/${p.hackathonId}/${p.projectId}`
            : `/projects#${p.projectId}`;
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
        {soldado.projects.length > 4 && (
          <li>
            <Link
              href={`/soldados/${soldado.slug}`}
              className="text-[10px] font-mono text-foreground-subtle hover:text-bitcoin transition-colors"
            >
              +{soldado.projects.length - 4} más
            </Link>
          </li>
        )}
      </ul>
    </li>
  );
}
