/**
 * Server-only roster builder for the /soldados page.
 *
 * Merges curated team members from `lib/projects.ts` with community Nostr
 * submissions (`lib/nostrCache.ts`). No new relay round-trip — reuses the
 * cached `getAllNostrSubmissionsForSitemap()` so this page invalidates on
 * the same `nostr:hackathon-submissions` tag as everything else.
 */

import { cacheLife, cacheTag } from "next/cache";
import { PROJECTS, type TeamMember } from "./projects";
import {
  getAllNostrSubmissionsForSitemap,
  type CachedNostrTeamMember,
} from "./nostrCache";
import reportsData from "@/data/hackathons/reports.json";

type ReportEntry = {
  position?: number;
  finalScore?: number;
};
type ReportsByHackathon = Record<string, Record<string, ReportEntry>>;
const REPORTS = reportsData as unknown as ReportsByHackathon;

// Position → points (1° gives 6 down to 6° giving 1; 0 below).
const POSITION_POINTS: Record<number, number> = {
  1: 6,
  2: 5,
  3: 4,
  4: 3,
  5: 2,
  6: 1,
};
const POINTS_PER_PROJECT = 2;
const POINTS_PER_HACKATHON = 3;

export type SoldadoProjectRef = {
  hackathonId: string | null;
  projectId: string;
  projectName: string;
  role: string;
  source: "curated" | "nostr";
  position?: number;
  positionPoints: number;
};

export type SoldadoScoreBreakdown = {
  hackathons: number;
  projects: number;
  positions: number;
  total: number;
};

export type Soldado = {
  id: string;
  slug: string;
  name: string;
  github?: string;
  pubkey?: string;
  nip05?: string;
  picture?: string;
  hasNostr: boolean;
  roles: string[];
  projects: SoldadoProjectRef[];
  score: number;
  scoreBreakdown: SoldadoScoreBreakdown;
};

function toSlug(id: string): string {
  return id.replace(/:/g, "-").slice(0, 80);
}

function lookupPosition(
  hackathonId: string | null,
  projectId: string,
): number | undefined {
  if (!hackathonId) return undefined;
  const hReports = REPORTS[hackathonId];
  if (!hReports) return undefined;
  // Case-insensitive match against report project IDs (reports may use
  // different casing, e.g. "SatsParty" vs PROJECTS' "satsparty").
  const idLc = projectId.toLowerCase();
  for (const [rid, entry] of Object.entries(hReports)) {
    if (rid.toLowerCase() === idLc) return entry.position;
  }
  return undefined;
}

function pointsForPosition(position: number | undefined): number {
  if (!position) return 0;
  return POSITION_POINTS[position] ?? 0;
}

function computeScore(
  refs: SoldadoProjectRef[],
): { score: number; breakdown: SoldadoScoreBreakdown } {
  const hackathons = new Set<string>();
  let positions = 0;
  for (const r of refs) {
    if (r.hackathonId) hackathons.add(r.hackathonId);
    positions += r.positionPoints;
  }
  const projects = refs.length * POINTS_PER_PROJECT;
  const hk = hackathons.size * POINTS_PER_HACKATHON;
  const total = projects + hk + positions;
  return {
    score: total,
    breakdown: { hackathons: hk, projects, positions, total },
  };
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function keyFor(opts: {
  github?: string;
  pubkey?: string;
  nip05?: string;
  name?: string;
}): string {
  if (opts.github) return `gh:${opts.github.toLowerCase()}`;
  if (opts.pubkey) return `pk:${opts.pubkey.toLowerCase()}`;
  if (opts.nip05) return `nip05:${opts.nip05.toLowerCase()}`;
  if (opts.name) return `name:${slugify(opts.name)}`;
  return `anon:${Math.random().toString(36).slice(2)}`;
}

function pushUnique<T>(arr: T[], item: T) {
  if (!arr.includes(item)) arr.push(item);
}

function curatedHackathonId(p: (typeof PROJECTS)[number]): string | null {
  // `hackathon` is "foundations" | "identity" | null in lib/projects.ts.
  return p.hackathon ?? null;
}

async function buildSoldados(): Promise<Soldado[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("nostr:hackathon-submissions");

  const map = new Map<string, Soldado>();

  // ── Curated pass ──────────────────────────────────────────────────────
  for (const project of PROJECTS) {
    for (const m of project.team as TeamMember[]) {
      const githubLc = m.github?.trim().toLowerCase() || undefined;
      const k = keyFor({ github: githubLc, name: m.name });
      const existing = map.get(k);
      const hackathonId = curatedHackathonId(project);
      const position = lookupPosition(hackathonId, project.id);
      const ref: SoldadoProjectRef = {
        hackathonId,
        projectId: project.id,
        projectName: project.name,
        role: m.role,
        source: "curated",
        position,
        positionPoints: pointsForPosition(position),
      };
      if (existing) {
        existing.projects.push(ref);
        pushUnique(existing.roles, m.role);
        if (!existing.github && githubLc) existing.github = githubLc;
      } else {
        map.set(k, {
          id: k,
          slug: toSlug(k),
          name: m.name,
          github: githubLc,
          hasNostr: false,
          roles: [m.role],
          projects: [ref],
          score: 0,
          scoreBreakdown: { hackathons: 0, projects: 0, positions: 0, total: 0 },
        });
      }
    }
  }

  // ── Nostr pass ────────────────────────────────────────────────────────
  const nostrProjects = await getAllNostrSubmissionsForSitemap();
  for (const project of nostrProjects) {
    for (const m of project.team as CachedNostrTeamMember[]) {
      const githubLc = m.github?.trim().toLowerCase() || undefined;
      const pubkeyLc = m.pubkey?.trim().toLowerCase() || undefined;
      const nip05Lc = m.nip05?.trim().toLowerCase() || undefined;

      // Try to find an existing soldado with priority: github > pubkey > nip05 > name.
      let resolvedKey: string | undefined;
      const candidates: string[] = [];
      if (githubLc) candidates.push(`gh:${githubLc}`);
      if (pubkeyLc) candidates.push(`pk:${pubkeyLc}`);
      if (nip05Lc) candidates.push(`nip05:${nip05Lc}`);
      if (m.name) candidates.push(`name:${slugify(m.name)}`);
      for (const c of candidates) {
        if (map.has(c)) {
          resolvedKey = c;
          break;
        }
      }
      const hackathonId = project.hackathon ?? null;
      const position = lookupPosition(hackathonId, project.id);
      const ref: SoldadoProjectRef = {
        hackathonId,
        projectId: project.id,
        projectName: project.name,
        role: m.role,
        source: "nostr",
        position,
        positionPoints: pointsForPosition(position),
      };

      if (resolvedKey) {
        const existing = map.get(resolvedKey)!;
        existing.hasNostr = true;
        if (!existing.pubkey && pubkeyLc) existing.pubkey = pubkeyLc;
        if (!existing.nip05 && nip05Lc) existing.nip05 = nip05Lc;
        if (!existing.picture && m.picture) existing.picture = m.picture;
        if (!existing.github && githubLc) existing.github = githubLc;
        existing.projects.push(ref);
        pushUnique(existing.roles, m.role);
      } else {
        const k = keyFor({
          github: githubLc,
          pubkey: pubkeyLc,
          nip05: nip05Lc,
          name: m.name,
        });
        map.set(k, {
          id: k,
          slug: toSlug(k),
          name: m.name || (m.nip05?.split("@")[0] ?? "Anónimo"),
          github: githubLc,
          pubkey: pubkeyLc,
          nip05: nip05Lc,
          picture: m.picture,
          hasNostr: true,
          roles: [m.role],
          projects: [ref],
          score: 0,
          scoreBreakdown: { hackathons: 0, projects: 0, positions: 0, total: 0 },
        });
      }
    }
  }

  // ── Compute final scores ──────────────────────────────────────────────
  for (const s of map.values()) {
    const { score, breakdown } = computeScore(s.projects);
    s.score = score;
    s.scoreBreakdown = breakdown;
  }

  // ── Sort: alphabetical by name (case-insensitive); Nostr-linked first on ties.
  const list = [...map.values()].sort((a, b) => {
    const n = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    if (n !== 0) return n;
    return Number(b.hasNostr) - Number(a.hasNostr);
  });

  return list;
}

export async function getSoldados(): Promise<Soldado[]> {
  return buildSoldados();
}

export async function getSoldadoBySlug(slug: string): Promise<Soldado | null> {
  const all = await getSoldados();
  const lc = slug.toLowerCase();
  return all.find((s) => s.slug.toLowerCase() === lc) ?? null;
}
