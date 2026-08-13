"use client";

import { useEffect, useState } from "react";
import { MonitorPlay } from "lucide-react";

type Remaining = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
} | null;

/** Client-only countdown to `targetIso`. Null until mounted so SSR HTML stays
 *  stable (the server cannot know the visitor's clock). */
function useCountdown(targetIso: string): Remaining {
  const [remaining, setRemaining] = useState<Remaining>(null);
  useEffect(() => {
    const target = new Date(targetIso).getTime();
    const tick = () => {
      const ms = Math.max(0, target - Date.now());
      setRemaining({
        days: Math.floor(ms / 86_400_000),
        hours: Math.floor((ms / 3_600_000) % 24),
        minutes: Math.floor((ms / 60_000) % 60),
        seconds: Math.floor((ms / 1000) % 60),
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetIso]);
  return remaining;
}

function CountdownUnit({
  value,
  label,
}: {
  value: number | null;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="min-w-[2.5ch] rounded-xl border border-cyan/30 bg-black/40 px-2.5 py-2 text-center font-display text-2xl font-black tabular-nums text-cyan sm:text-3xl">
        {value === null ? "—" : String(value).padStart(2, "0")}
      </span>
      <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-foreground-subtle">
        {label}
      </span>
    </div>
  );
}

export default function GamingHackathonCountdown({
  targetIso,
}: {
  targetIso: string;
}) {
  const remaining = useCountdown(targetIso);
  return (
    <div className="mt-7">
      <div className="mb-3 inline-flex items-center gap-2 text-[11px] font-mono font-bold uppercase tracking-[0.18em] text-foreground-muted">
        <MonitorPlay className="h-4 w-4 text-bitcoin" />
        Arranca en vivo · martes 18 hs
      </div>
      <div className="flex items-end gap-2.5 sm:gap-3">
        <CountdownUnit value={remaining?.days ?? null} label="días" />
        <span className="pb-6 font-display text-2xl font-black text-cyan/40">
          :
        </span>
        <CountdownUnit value={remaining?.hours ?? null} label="hs" />
        <span className="pb-6 font-display text-2xl font-black text-cyan/40">
          :
        </span>
        <CountdownUnit value={remaining?.minutes ?? null} label="min" />
        <span className="pb-6 font-display text-2xl font-black text-cyan/40">
          :
        </span>
        <CountdownUnit value={remaining?.seconds ?? null} label="seg" />
      </div>
    </div>
  );
}
