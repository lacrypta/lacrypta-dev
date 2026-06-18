"use client";

import { useCallback, useEffect, useState } from "react";
import { isDevMode } from "@/lib/devMode";

/**
 * Runtime on/off switch for the dev UI, layered on top of the build-time
 * `NEXT_PUBLIC_DEV_MODE` env gate. `isDevMode()` says dev features are
 * *available*; this toggle says they're *active right now*. Flipping it off
 * hides every dev-injected button so you can see the real production UI without
 * restarting the server. Backed by localStorage + a change event so all
 * consumers stay in sync. Defaults ON when dev mode is available.
 */
const KEY = "labs:dev:enabled";
const EVENT = "labs:dev:enabled:changed";

export function isDevEnabled(): boolean {
  if (!isDevMode()) return false;
  if (typeof window === "undefined") return true; // SSR: assume on; client corrects
  try {
    const v = window.localStorage.getItem(KEY);
    return v === null ? true : v === "true";
  } catch {
    return true;
  }
}

export function setDevEnabled(on: boolean) {
  try {
    window.localStorage.setItem(KEY, on ? "true" : "false");
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    /* quota */
  }
}

export function useDevEnabled(): {
  /** dev mode available (env) AND switched on (runtime). */
  enabled: boolean;
  /** dev mode available at all (env). The switch only matters when true. */
  available: boolean;
  setEnabled: (on: boolean) => void;
} {
  const available = isDevMode();
  const [enabled, setEnabledState] = useState(available);

  useEffect(() => {
    setEnabledState(isDevEnabled());
    const sync = () => setEnabledState(isDevEnabled());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const setEnabled = useCallback((on: boolean) => setDevEnabled(on), []);
  return { enabled: available && enabled, available, setEnabled };
}
