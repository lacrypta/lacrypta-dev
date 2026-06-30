"use client";

import { useState, type ReactNode } from "react";
import { FolderGit2, Info, Trophy } from "lucide-react";
import { cn } from "@/lib/cn";
import { isDevMode } from "@/lib/devMode";
import {
  HackathonTabContext,
  type HackathonTabId,
} from "@/lib/hackathonTabsContext";

const TABS: { id: HackathonTabId; label: string; icon: typeof FolderGit2 }[] = [
  { id: "proyectos", label: "Proyectos", icon: FolderGit2 },
  { id: "resultados", label: "Resultados", icon: Trophy },
  { id: "datos", label: "Datos", icon: Info },
];

/**
 * Splits the hackathon detail page into three panels (Proyectos / Resultados /
 * Datos), all server-rendered server-side and passed in as slots — only the
 * active one is visually shown (the others stay mounted but `hidden`, so the
 * voting subscriptions and project scan inside them don't restart on every tab
 * switch). Provides `HackathonTabContext` so a CTA inside one panel (e.g. "Ver
 * resultados" inside Resultados) can switch to another panel before scrolling
 * to an element that lives there.
 */
export default function HackathonTabs({
  proyectos,
  resultados,
  datos,
  defaultTab = "proyectos",
  projectsCount,
  votingOpen,
}: {
  proyectos: ReactNode;
  resultados: ReactNode;
  datos: ReactNode;
  defaultTab?: HackathonTabId;
  projectsCount: number;
  votingOpen: boolean;
}) {
  const [tab, setTab] = useState<HackathonTabId>(defaultTab);

  return (
    <HackathonTabContext.Provider value={{ tab, setTab }}>
      <div
        className={cn(
          "sticky z-20 border-y border-border bg-background/90 backdrop-blur-sm",
          // Stick right below the fixed navbar — which itself sits lower when
          // the DEV MODE bar (32px) is present (see Navbar.tsx).
          isDevMode() ? "top-24" : "top-16",
        )}
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div
            role="tablist"
            aria-label="Secciones del hackatón"
            className="no-scrollbar flex items-center gap-1 overflow-x-auto py-2.5"
          >
            {TABS.map(({ id, label, icon: Icon }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(id)}
                  className={cn(
                    "relative inline-flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-mono font-bold uppercase tracking-widest transition-colors",
                    active
                      ? "bg-white/[0.07] text-foreground"
                      : "text-foreground-muted hover:bg-white/[0.03] hover:text-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                  {id === "proyectos" && projectsCount > 0 && (
                    <span className="text-foreground-subtle">
                      {projectsCount}
                    </span>
                  )}
                  {id === "resultados" && votingOpen && (
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/70" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className={cn(tab === "proyectos" ? "block" : "hidden")}>
        {proyectos}
      </div>
      <div className={cn(tab === "resultados" ? "block" : "hidden")}>
        {resultados}
      </div>
      <div className={cn(tab === "datos" ? "block" : "hidden")}>{datos}</div>
    </HackathonTabContext.Provider>
  );
}
