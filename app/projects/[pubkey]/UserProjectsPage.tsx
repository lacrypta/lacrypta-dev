"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import {
  fetchUserProjects,
  fetchAuthorPictures,
  TOP10_RELAYS,
  type UserProject,
} from "@/lib/userProjects";
import { GithubIcon } from "@/components/BrandIcons";
import { cn } from "@/lib/cn";

const STATUS_BADGE: Record<string, string> = {
  official:  "bg-bitcoin/10 border-bitcoin/40 text-bitcoin",
  winner:    "bg-lightning/10 border-lightning/40 text-lightning",
  finalist:  "bg-cyan/10 border-cyan/40 text-cyan",
  submitted: "bg-nostr/10 border-nostr/30 text-nostr",
  building:  "bg-white/5 border-border text-foreground-muted",
  idea:      "bg-white/5 border-border text-foreground-subtle",
};

export default function UserProjectsPage({ pubkey }: { pubkey: string }) {
  const [projects, setProjects] = useState<UserProject[] | undefined>(undefined);
  const [authorPicture, setAuthorPicture] = useState<string | undefined>();

  useEffect(() => {
    fetchUserProjects(pubkey, TOP10_RELAYS).then((doc) => {
      setProjects(doc.projects);
    });
    fetchAuthorPictures([pubkey], TOP10_RELAYS).then((pics) => {
      setAuthorPicture(pics.get(pubkey));
    });
  }, [pubkey]);

  const short = `${pubkey.slice(0, 8)}…${pubkey.slice(-6)}`;

  return (
    <div className="relative pt-24 pb-16">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <Link
          href="/projects"
          className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-widest text-foreground-muted hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Proyectos
        </Link>

        <div className="flex items-center gap-4 mb-8">
          {authorPicture ? (
            <img
              src={authorPicture}
              alt=""
              className="h-14 w-14 rounded-full object-cover ring-2 ring-nostr/40 shrink-0"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          ) : (
            <div className="h-14 w-14 rounded-full bg-gradient-to-br from-nostr/30 to-bitcoin/30 ring-2 ring-border-strong flex items-center justify-center text-lg font-display font-bold shrink-0">
              {pubkey.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">
              Proyectos
            </h1>
            <p className="text-xs font-mono text-foreground-subtle mt-0.5 break-all">
              {short}
            </p>
          </div>
        </div>

        {projects === undefined ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 rounded-xl border border-border bg-background-card shimmer" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <p className="text-sm text-foreground-muted">
            No se encontraron proyectos para esta clave en los relays.
          </p>
        ) : (
          <div className="space-y-3">
            {projects.map((p) => {
              const href = p.hackathon
                ? `/hackathons/${p.hackathon}/${p.id}`
                : `/projects/${pubkey}/${p.id}`;
              return (
                <Link
                  key={p.id}
                  href={href}
                  className="group flex items-stretch gap-4 rounded-xl border border-border bg-background-card hover:border-border-strong hover:-translate-y-0.5 transition-all overflow-hidden"
                >
                  <div className="flex-1 min-w-0 p-4 flex flex-col justify-center">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span
                        className={cn(
                          "inline-flex items-center px-1.5 py-0.5 rounded-full border text-[9px] font-mono font-semibold tracking-widest uppercase",
                          STATUS_BADGE[p.status] ?? "bg-white/5 border-border text-foreground-muted",
                        )}
                      >
                        {p.status}
                      </span>
                      {p.hackathon && (
                        <span className="text-[9px] font-mono text-foreground-subtle uppercase tracking-widest">
                          {p.hackathon}
                        </span>
                      )}
                    </div>
                    <h2 className="font-display font-bold text-base leading-tight group-hover:text-bitcoin transition-colors truncate">
                      {p.name}
                    </h2>
                    {p.description && (
                      <p className="text-xs text-foreground-muted mt-1 line-clamp-1">
                        {p.description}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-mono text-foreground-subtle">
                      {p.team.length > 0 && (
                        <span className="truncate">
                          {p.team.map((t) => t.name).join(" · ")}
                        </span>
                      )}
                      {p.repo && (
                        <span className="inline-flex items-center gap-1">
                          <GithubIcon className="h-3 w-3" />
                          repo
                        </span>
                      )}
                      {p.demo && (
                        <span className="inline-flex items-center gap-1">
                          <ExternalLink className="h-3 w-3" />
                          demo
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center pr-4 shrink-0">
                    <ArrowLeft className="h-4 w-4 text-foreground-muted group-hover:text-bitcoin rotate-180 group-hover:translate-x-0.5 transition-all" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
