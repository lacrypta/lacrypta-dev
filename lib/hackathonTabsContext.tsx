"use client";

import { createContext, useContext } from "react";

/** The three sections the hackathon detail page is split into. */
export type HackathonTabId = "proyectos" | "resultados" | "datos";

type HackathonTabContextValue = {
  tab: HackathonTabId;
  setTab: (tab: HackathonTabId) => void;
};

/**
 * Lets components deep inside a tab (e.g. the voting CTA, or the
 * project-published toast) switch the active tab before scrolling to an
 * element that lives in a different tab's hidden panel. Null outside
 * `HackathonTabs` (e.g. `VotingHero` on the home page), so callers must treat
 * it as optional.
 */
export const HackathonTabContext = createContext<HackathonTabContextValue | null>(
  null,
);

export function useHackathonTab() {
  return useContext(HackathonTabContext);
}
