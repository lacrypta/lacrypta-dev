import { cacheLife, cacheTag } from "next/cache";
import { DEFAULT_RELAYS } from "./nostrRelayConfig";
import { nostrReportsTag } from "./nostrCacheTags";
import type { ProjectReport } from "./hackathons";
import reportsJson from "@/data/hackathons/reports.json";

export const REPORT_KIND = 30078;
export const RESULTS_KIND = 30078;
const REPORT_TAG = "lacrypta-dev-report";
const RESULTS_TAG = "lacrypta-dev-results";

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

export type CachedHackathonReportsSnapshot = {
  hackathonId: string;
  reports: Record<string, ProjectReport>;
  results: HackathonResults | null;
  generatedAt: string;
  relays: string[];
};

type IncomingEvent = {
  id: string;
  pubkey: string;
  content: string;
  tags: string[][];
  created_at: number;
};

const staticReports = reportsJson as unknown as Record<
  string,
  Record<string, ProjectReport>
>;

export function reportDTag(hackathonId: string, projectId: string): string {
  return `lacrypta.dev:hackathon:${hackathonId}:report:${projectId}`;
}

export function resultsDTag(hackathonId: string): string {
  return `lacrypta.dev:hackathon:${hackathonId}:results`;
}

async function publisherPubkeyFromNsec(): Promise<string> {
  const nsec = process.env.LACRYPTA_NSEC;
  if (!nsec) return "";
  const { decode } = await import("nostr-tools/nip19");
  const { getPublicKey } = await import("nostr-tools/pure");
  const decoded = decode(nsec);
  if (decoded.type !== "nsec") return "";
  return getPublicKey(decoded.data as Uint8Array);
}

function projectIdFromReportDTag(dTag: string, hackathonId: string) {
  const prefix = `lacrypta.dev:hackathon:${hackathonId}:report:`;
  return dTag.startsWith(prefix) ? dTag.slice(prefix.length) : null;
}

async function rawFetchHackathonReports(
  hackathonId: string,
  timeoutMs = 4500,
): Promise<CachedHackathonReportsSnapshot> {
  const relays = DEFAULT_RELAYS;
  const publisherPubkey = await publisherPubkeyFromNsec();
  const reports: Record<string, ProjectReport> = {
    ...(staticReports[hackathonId] ?? {}),
  };
  let results: HackathonResults | null = null;

  if (!publisherPubkey) {
    return {
      hackathonId,
      reports,
      results,
      generatedAt: new Date().toISOString(),
      relays,
    };
  }

  const { SimplePool } = await import("nostr-tools/pool");
  const pool = new SimplePool();
  const events: IncomingEvent[] = [];

  const closer = pool.subscribe(
    relays,
    {
      kinds: [REPORT_KIND],
      authors: [publisherPubkey],
      "#h": [hackathonId],
      "#t": [REPORT_TAG, RESULTS_TAG],
    },
    {
      onevent(ev: IncomingEvent) {
        events.push(ev);
      },
      oneose() {
        /* timeout-driven */
      },
    },
  );

  await new Promise((r) => setTimeout(r, timeoutMs));
  try {
    closer.close();
  } catch {
    /* noop */
  }
  try {
    pool.close(relays);
  } catch {
    /* noop */
  }

  events.sort((a, b) => b.created_at - a.created_at);
  const seenReports = new Set<string>();
  for (const ev of events) {
    const dTag = ev.tags.find((t) => t[0] === "d")?.[1] ?? "";
    if (dTag === resultsDTag(hackathonId)) {
      if (results) continue;
      try {
        const parsed = JSON.parse(ev.content) as HackathonResults;
        results = parsed;
      } catch {
        /* ignore malformed official event */
      }
      continue;
    }
    const projectId = projectIdFromReportDTag(dTag, hackathonId);
    if (!projectId || seenReports.has(projectId)) continue;
    try {
      reports[projectId] = JSON.parse(ev.content) as ProjectReport;
      seenReports.add(projectId);
    } catch {
      /* ignore malformed official event */
    }
  }

  return {
    hackathonId,
    reports,
    results,
    generatedAt: new Date().toISOString(),
    relays,
  };
}

export async function getCachedHackathonReportsSnapshot(
  hackathonId: string,
): Promise<CachedHackathonReportsSnapshot> {
  "use cache";
  cacheLife("days");
  cacheTag(nostrReportsTag(hackathonId));
  try {
    return await rawFetchHackathonReports(hackathonId);
  } catch {
    return {
      hackathonId,
      reports: staticReports[hackathonId] ?? {},
      results: null,
      generatedAt: new Date().toISOString(),
      relays: DEFAULT_RELAYS,
    };
  }
}
