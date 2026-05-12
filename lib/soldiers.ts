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

export type SoldierProjectRef = {
  hackathonId: string | null;
  projectId: string;
  projectName: string;
  role: string;
  source: "curated" | "nostr";
  position?: number;
  positionPoints: number;
  /**
   * Carried for dedupe — Nostr re-submissions sometimes use a different
   * presentation name than the curated entry (e.g. "Scammer & Come
   * Empanadas Detector" vs "NOSTR identity hub") but the same repo URL.
   */
  repo?: string;
  /**
   * Nostr author pubkey (hex). Only set when source === "nostr"; used to
   * build the per-project page link `/projects/<author>/<projectId>` when
   * the project isn't tied to a hackathon.
   */
  authorPubkey?: string;
};

export type SoldierScoreBreakdown = {
  hackathons: number;
  projects: number;
  positions: number;
  total: number;
};

export type Soldier = {
  id: string;
  slug: string;
  name: string;
  github?: string;
  pubkey?: string;
  nip05?: string;
  picture?: string;
  hasNostr: boolean;
  roles: string[];
  projects: SoldierProjectRef[];
  score: number;
  scoreBreakdown: SoldierScoreBreakdown;
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

function normalizeRepo(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^github\.com\//, "")
    .replace(/\.git$/, "")
    .replace(/\/+$/, "");
}

// Two refs describe the same project when, scoped to the same hackathon,
// they share either:
//   1. a slugified project name — covers Nostr re-submissions that just
//      reformat the name ("Proof of Attendance (HDMP)" vs "Proof of
//      attendance HDMP"), or
//   2. a normalized repo URL — covers re-submissions that change the
//      presentation name entirely ("Scammer & Come Empanadas Detector"
//      vs "NOSTR identity hub", both → Lo0ker-Noma/nostr-identity-hub).
function projectDedupeKeys(ref: SoldierProjectRef): string[] {
  const h = ref.hackathonId ?? "-";
  const out: string[] = [`${h}::name:${slugify(ref.projectName)}`];
  const repo = normalizeRepo(ref.repo);
  if (repo) out.push(`${h}::repo:${repo}`);
  return out;
}

function mergeRefs(
  primary: SoldierProjectRef,
  secondary: SoldierProjectRef,
): SoldierProjectRef {
  // Prefer curated source — its projectId matches `lib/projects.ts` and
  // routes correctly to /hackathons/<id>/<projectId>. Inherit position
  // info and repo URL from whichever ref actually has them.
  const curatedFirst =
    primary.source === "curated"
      ? primary
      : secondary.source === "curated"
        ? secondary
        : primary;
  const other = curatedFirst === primary ? secondary : primary;
  const merged: SoldierProjectRef = { ...curatedFirst };
  if (!merged.position && other.position) {
    merged.position = other.position;
    merged.positionPoints = other.positionPoints;
  }
  if (!merged.repo && other.repo) merged.repo = other.repo;
  if (!merged.authorPubkey && other.authorPubkey)
    merged.authorPubkey = other.authorPubkey;
  return merged;
}

function dedupeProjects(refs: SoldierProjectRef[]): SoldierProjectRef[] {
  // A ref can match an existing group by name OR by repo. After merging,
  // re-register all keys of the merged ref so a later ref that matches
  // either key still collapses into the same group.
  const indexByKey = new Map<string, number>();
  const out: SoldierProjectRef[] = [];
  for (const r of refs) {
    const keys = projectDedupeKeys(r);
    let groupIdx: number | undefined;
    for (const k of keys) {
      const i = indexByKey.get(k);
      if (i !== undefined) {
        groupIdx = i;
        break;
      }
    }
    if (groupIdx === undefined) {
      const idx = out.length;
      out.push(r);
      for (const k of keys) indexByKey.set(k, idx);
    } else {
      const merged = mergeRefs(out[groupIdx]!, r);
      out[groupIdx] = merged;
      for (const k of projectDedupeKeys(merged)) indexByKey.set(k, groupIdx);
    }
  }
  return out;
}

function computeScore(
  refs: SoldierProjectRef[],
): { score: number; breakdown: SoldierScoreBreakdown } {
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
  // Unreachable in practice — parseTeam (lib/nostrCache.ts) drops members
  // with no name/nip05/pubkey, and curated TeamMember requires `name`. Keep
  // a deterministic sentinel so any future regression collapses anon
  // entries into a single soldier instead of generating a new slug per
  // cache cycle (Math.random would 404 external links after revalidation).
  return "anon:_";
}

function pushUnique<T>(arr: T[], item: T) {
  if (!arr.includes(item)) arr.push(item);
}

// Register all known identity keys for `s` in `map` so later lookups by
// any of them (gh / pk / nip05) resolve to the same soldier object. Multiple
// keys may point to the same Soldier instance — the final list dedupes by
// reference.
function indexAliases(s: Soldier, map: Map<string, Soldier>) {
  if (s.github) map.set(`gh:${s.github.toLowerCase()}`, s);
  if (s.pubkey) map.set(`pk:${s.pubkey.toLowerCase()}`, s);
  if (s.nip05) map.set(`nip05:${s.nip05.toLowerCase()}`, s);
}

function curatedHackathonId(p: (typeof PROJECTS)[number]): string | null {
  // `hackathon` is "foundations" | "identity" | null in lib/projects.ts.
  return p.hackathon ?? null;
}

async function buildSoldiers(): Promise<Soldier[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("nostr:hackathon-submissions");

  const map = new Map<string, Soldier>();

  // ── Curated pass ──────────────────────────────────────────────────────
  for (const project of PROJECTS) {
    for (const m of project.team as TeamMember[]) {
      const githubLc = m.github?.trim().toLowerCase() || undefined;
      const k = keyFor({ github: githubLc, name: m.name });
      const existing = map.get(k);
      const hackathonId = curatedHackathonId(project);
      const position = lookupPosition(hackathonId, project.id);
      const ref: SoldierProjectRef = {
        hackathonId,
        projectId: project.id,
        projectName: project.name,
        role: m.role,
        source: "curated",
        position,
        positionPoints: pointsForPosition(position),
        repo: project.repo,
      };
      if (existing) {
        existing.projects.push(ref);
        pushUnique(existing.roles, m.role);
        if (!existing.github && githubLc) existing.github = githubLc;
        indexAliases(existing, map);
      } else {
        const created: Soldier = {
          id: k,
          slug: toSlug(k),
          name: m.name,
          github: githubLc,
          hasNostr: false,
          roles: [m.role],
          projects: [ref],
          score: 0,
          scoreBreakdown: { hackathons: 0, projects: 0, positions: 0, total: 0 },
        };
        map.set(k, created);
        indexAliases(created, map);
      }
    }
  }

  // Index curated team members by lowercased project id AND by slugified
  // project name. Nostr re-submissions of an existing project may use a
  // UUID for `id` (different from the curated slug) but a similar `name`,
  // so the name-slug fallback is what actually matches them. When found,
  // we positionally inherit the github handles from the curated team.
  const curatedTeamByProjectKey = new Map<string, TeamMember[]>();
  for (const p of PROJECTS) {
    curatedTeamByProjectKey.set(p.id.toLowerCase(), p.team);
    curatedTeamByProjectKey.set(slugify(p.name), p.team);
  }

  // ── Nostr pass ────────────────────────────────────────────────────────
  const nostrProjects = await getAllNostrSubmissionsForSitemap();
  for (const project of nostrProjects) {
    const curatedTeam =
      curatedTeamByProjectKey.get(project.id.toLowerCase()) ??
      (project.name
        ? curatedTeamByProjectKey.get(slugify(project.name))
        : undefined);
    const sameSizeTeam =
      curatedTeam && curatedTeam.length === project.team.length;

    for (let i = 0; i < project.team.length; i++) {
      const m = project.team[i] as CachedNostrTeamMember;
      const githubLc = m.github?.trim().toLowerCase() || undefined;
      const pubkeyLc = m.pubkey?.trim().toLowerCase() || undefined;
      const nip05Lc = m.nip05?.trim().toLowerCase() || undefined;
      // Heuristic: many builders reuse the same handle for github and the
      // local-part of their nip05 (e.g. github "Fierillo" + nip05
      // "fierillo@hodl.arx.com"). Use the nip05 local-part as a github-key
      // candidate so the Nostr submission can collapse into the curated
      // entry even when the team-member object didn't set `github`.
      const nip05LocalLc = nip05Lc?.split("@")[0]?.replace(/[^a-z0-9-]/g, "");
      const nameSlug = m.name ? slugify(m.name) : undefined;
      // Inherited github from the curated team of the same project, when
      // both teams are the same size — handles the case where a Nostr
      // re-submission of an existing project has different `name` /
      // missing `github` for the same person (e.g. "Looker" on Nostr ≡
      // curated "Lo0ker-Noma" on `proof-of-attendance-hdmp`).
      const inheritedGhLc =
        sameSizeTeam && curatedTeam![i]?.github
          ? curatedTeam![i].github.trim().toLowerCase()
          : undefined;

      // Match priority — strongest first:
      // 1. explicit github handle, 2. inherited github (same-size team on
      //    a re-submitted curated project), 3. pubkey, 4. nip05, 5. nip05
      //    local-part interpreted as a github handle, 6. name slug
      //    interpreted as a github handle, 7. raw name slug.
      let resolvedKey: string | undefined;
      const candidates: string[] = [];
      if (githubLc) candidates.push(`gh:${githubLc}`);
      if (inheritedGhLc && inheritedGhLc !== githubLc)
        candidates.push(`gh:${inheritedGhLc}`);
      if (pubkeyLc) candidates.push(`pk:${pubkeyLc}`);
      if (nip05Lc) candidates.push(`nip05:${nip05Lc}`);
      if (
        nip05LocalLc &&
        nip05LocalLc !== githubLc &&
        nip05LocalLc !== inheritedGhLc
      )
        candidates.push(`gh:${nip05LocalLc}`);
      if (
        nameSlug &&
        nameSlug !== githubLc &&
        nameSlug !== inheritedGhLc &&
        nameSlug !== nip05LocalLc
      )
        candidates.push(`gh:${nameSlug}`);
      if (nameSlug) candidates.push(`name:${nameSlug}`);
      for (const c of candidates) {
        if (map.has(c)) {
          resolvedKey = c;
          break;
        }
      }
      const hackathonId = project.hackathon ?? null;
      const position = lookupPosition(hackathonId, project.id);
      const ref: SoldierProjectRef = {
        hackathonId,
        projectId: project.id,
        projectName: project.name,
        role: m.role,
        source: "nostr",
        position,
        positionPoints: pointsForPosition(position),
        repo: project.repo,
        authorPubkey: project.author,
      };

      if (resolvedKey) {
        const existing = map.get(resolvedKey)!;
        existing.hasNostr = true;
        if (!existing.pubkey && pubkeyLc) existing.pubkey = pubkeyLc;
        if (!existing.nip05 && nip05Lc) existing.nip05 = nip05Lc;
        if (!existing.picture && m.picture) existing.picture = m.picture;
        if (!existing.github) {
          const newGh = githubLc ?? inheritedGhLc;
          if (newGh) existing.github = newGh;
        }
        existing.projects.push(ref);
        pushUnique(existing.roles, m.role);
        // Re-index aliases: subsequent Nostr submissions for the same
        // person should resolve to this soldier via any of their known
        // identities (pubkey / nip05 / inherited github).
        indexAliases(existing, map);
      } else {
        const k = keyFor({
          github: githubLc,
          pubkey: pubkeyLc,
          nip05: nip05Lc,
          name: m.name,
        });
        const created: Soldier = {
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
        };
        map.set(k, created);
        indexAliases(created, map);
      }
    }
  }

  // Deduplicate — alias indexing means the same Soldier instance can be
  // reachable from multiple keys (gh / pk / nip05).
  const unique = [...new Set(map.values())];

  // ── Dedupe & score ────────────────────────────────────────────────────
  // A soldier on a curated team whose project gets re-published on Nostr
  // ends up with two refs to the same project (one per pass). Collapse
  // them so projects.length / score / medals reflect reality.
  for (const s of unique) {
    s.projects = dedupeProjects(s.projects);
    const { score, breakdown } = computeScore(s.projects);
    s.score = score;
    s.scoreBreakdown = breakdown;
  }

  // ── Sort: alphabetical by name (case-insensitive); Nostr-linked first on ties.
  const list = unique.sort((a, b) => {
    const n = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    if (n !== 0) return n;
    return Number(b.hasNostr) - Number(a.hasNostr);
  });

  return list;
}

export async function getSoldiers(): Promise<Soldier[]> {
  return buildSoldiers();
}

export async function getSoldierBySlug(slug: string): Promise<Soldier | null> {
  const all = await getSoldiers();
  const lc = slug.toLowerCase();
  return all.find((s) => s.slug.toLowerCase() === lc) ?? null;
}
