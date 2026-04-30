"use client";

import { useEffect, useState } from "react";
import type { UnsignedEvent } from "./nostrSigner";
import type { ProjectReport } from "./hackathons";
import { DEFAULT_BADGE_RELAYS } from "./nostrBadges";
import reportsJson from "@/data/hackathons/reports.json";

export const REPORT_KIND = 30078;
export const RESULTS_KIND = 30078;
export const LACRYPTA_RELAYS = DEFAULT_BADGE_RELAYS;

export type WinnerEntry = {
  position: number;
  projectId: string;
  pubkey: string;
  teamName: string;
  sats: number;
};

export type HackathonResults = {
  hackathonId: string;
  winners: WinnerEntry[];
  publishedAt: number;
};

// ─── d-tag helpers ───────────────────────────────────────────────────────────

export function reportDTag(hackathonId: string, projectId: string): string {
  return `lacrypta.labs:hackathon:${hackathonId}:report:${projectId}`;
}

export function resultsDTag(hackathonId: string): string {
  return `lacrypta.labs:hackathon:${hackathonId}:results`;
}

// ─── event builders ──────────────────────────────────────────────────────────

export function buildReportEvent(
  lacryptaPubkey: string,
  hackathonId: string,
  projectId: string,
  projectPubkey: string,
  report: ProjectReport,
): UnsignedEvent {
  return {
    kind: REPORT_KIND,
    pubkey: lacryptaPubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["d", reportDTag(hackathonId, projectId)],
      ["h", hackathonId],
      ["p", projectPubkey],
      ["t", "lacrypta-labs-report"],
      // Indexed reference to the NIP-78 project event so any relay can
      // answer { "#i": ["30078:<pubkey>:lacrypta.labs:project:<id>"] }
      ["i", `30078:${projectPubkey}:lacrypta.labs:project:${projectId}`],
    ],
    content: JSON.stringify(report),
  };
}

export function buildResultsEvent(
  lacryptaPubkey: string,
  hackathonId: string,
  winners: WinnerEntry[],
): UnsignedEvent {
  const tags: string[][] = [
    ["d", resultsDTag(hackathonId)],
    ["h", hackathonId],
    ["t", "lacrypta-labs-results"],
  ];
  for (const w of winners) {
    tags.push(["p", w.pubkey]);
  }
  return {
    kind: RESULTS_KIND,
    pubkey: lacryptaPubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: JSON.stringify({ hackathonId, winners }),
  };
}

// ─── fetchers ────────────────────────────────────────────────────────────────

const staticReports = reportsJson as unknown as Record<
  string,
  Record<string, ProjectReport>
>;

export async function fetchProjectReport(
  hackathonId: string,
  projectId: string,
  lacryptaPubkey: string,
  relays: string[] = LACRYPTA_RELAYS,
  timeoutMs = 5000,
): Promise<ProjectReport | null> {
  if (lacryptaPubkey) {
    try {
      const { SimplePool } = await import("nostr-tools/pool");
      const pool = new SimplePool();
      const events: { content: string; created_at: number }[] = [];
      const dTag = reportDTag(hackathonId, projectId);

      const closer = pool.subscribe(
        relays,
        {
          kinds: [REPORT_KIND],
          authors: [lacryptaPubkey],
          "#d": [dTag],
        },
        {
          onevent(ev) {
            events.push(ev);
          },
          oneose() {
            closer.close();
          },
        },
      );
      await new Promise((r) => setTimeout(r, timeoutMs));
      closer.close();
      try {
        pool.close(relays);
      } catch {
        /* noop */
      }

      if (events.length > 0) {
        events.sort((a, b) => b.created_at - a.created_at);
        return JSON.parse(events[0].content) as ProjectReport;
      }
    } catch {
      /* fall through to static */
    }
  }

  return staticReports[hackathonId]?.[projectId] ?? null;
}

export async function fetchHackathonResults(
  hackathonId: string,
  lacryptaPubkey: string,
  relays: string[] = LACRYPTA_RELAYS,
  timeoutMs = 5000,
): Promise<HackathonResults | null> {
  if (!lacryptaPubkey) return null;
  try {
    const { SimplePool } = await import("nostr-tools/pool");
    const pool = new SimplePool();
    const events: { content: string; created_at: number }[] = [];

    const closer = pool.subscribe(
      relays,
      {
        kinds: [RESULTS_KIND],
        authors: [lacryptaPubkey],
        "#d": [resultsDTag(hackathonId)],
      },
      {
        onevent(ev) {
          events.push(ev);
        },
        oneose() {
          closer.close();
        },
      },
    );
    await new Promise((r) => setTimeout(r, timeoutMs));
    closer.close();
    try {
      pool.close(relays);
    } catch {
      /* noop */
    }

    if (events.length === 0) return null;
    events.sort((a, b) => b.created_at - a.created_at);
    return JSON.parse(events[0].content) as HackathonResults;
  } catch {
    return null;
  }
}

// ─── hooks ───────────────────────────────────────────────────────────────────

function getLacryptaPubkeyHex(): string {
  const npub =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_LACRYPTA_NPUB ?? ""
      : "";
  if (!npub) return "";
  try {
    // Dynamic decode at runtime — nip19 is client-only
    // We cache the hex so the import only happens once per session
    const cached = (window as unknown as Record<string, string>)[
      "__lcpk__"
    ];
    if (cached) return cached;
    return "";
  } catch {
    return "";
  }
}

/** Resolves npub → hex once and caches it on window.__lcpk__ */
async function resolveLacryptaPubkey(): Promise<string> {
  if (typeof window === "undefined") return "";
  const win = window as unknown as Record<string, string>;
  if (win.__lcpk__) return win.__lcpk__;
  const npub = process.env.NEXT_PUBLIC_LACRYPTA_NPUB ?? "";
  if (!npub) return "";
  try {
    const { decode } = await import("nostr-tools/nip19");
    const decoded = decode(npub);
    if (decoded.type !== "npub") return "";
    win.__lcpk__ = decoded.data as string;
    return win.__lcpk__;
  } catch {
    return "";
  }
}

export function useProjectReport(
  hackathonId: string,
  projectId: string,
  relays?: string[],
) {
  const [report, setReport] = useState<ProjectReport | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Start with static fallback immediately
    const staticFallback = staticReports[hackathonId]?.[projectId] ?? null;
    if (staticFallback) setReport(staticFallback);

    let cancelled = false;
    setLoading(true);
    resolveLacryptaPubkey()
      .then((pubkey) =>
        fetchProjectReport(hackathonId, projectId, pubkey, relays),
      )
      .then((r) => {
        if (!cancelled) setReport(r);
      })
      .catch(() => {
        /* noop */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hackathonId, projectId, relays?.join(",")]);

  return { report, loading };
}

export function useHackathonResults(
  hackathonId: string,
  relays?: string[],
) {
  const [results, setResults] = useState<HackathonResults | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    resolveLacryptaPubkey()
      .then((pubkey) => fetchHackathonResults(hackathonId, pubkey, relays))
      .then((r) => {
        if (!cancelled) setResults(r);
      })
      .catch(() => {
        /* noop */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hackathonId, relays?.join(",")]);

  return { results, loading };
}

export { getLacryptaPubkeyHex, resolveLacryptaPubkey };
