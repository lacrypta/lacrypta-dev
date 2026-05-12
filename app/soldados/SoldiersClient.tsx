"use client";

import { useState } from "react";
import { LayoutGrid, List } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Soldier } from "@/lib/soldiers";
import SoldiersGrid from "./SoldiersGrid";
import SoldiersTable from "./SoldiersTable";

type View = "grid" | "table";

export default function SoldiersClient({ soldiers }: { soldiers: Soldier[] }) {
  const [view, setView] = useState<View>("table");

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-foreground-muted">
          <span className="font-display font-bold text-foreground">
            {soldiers.length}
          </span>{" "}
          builders en la comunidad
          {view === "table" && " · ranking por score"}.
        </p>
        <div className="inline-flex items-center rounded-lg border border-border bg-background-card/40 p-1 gap-1">
          <ViewButton
            active={view === "table"}
            onClick={() => setView("table")}
            icon={<List className="h-3.5 w-3.5" />}
            label="Ranking"
          />
          <ViewButton
            active={view === "grid"}
            onClick={() => setView("grid")}
            icon={<LayoutGrid className="h-3.5 w-3.5" />}
            label="Grilla"
          />
        </div>
      </div>

      {view === "table" ? (
        <SoldiersTable soldiers={soldiers} />
      ) : (
        <SoldiersGrid soldiers={soldiers} />
      )}
    </div>
  );
}

function ViewButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-mono font-bold uppercase tracking-widest transition-colors",
        active
          ? "bg-bitcoin/15 text-bitcoin"
          : "text-foreground-subtle hover:text-foreground",
      )}
      aria-pressed={active}
    >
      {icon}
      {label}
    </button>
  );
}
