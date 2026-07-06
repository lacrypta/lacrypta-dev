/**
 * Pure, server-safe evaluator that maps a badge's criteria to the soldiers who
 * meet it. Consumed by `app/api/hackathon-badges/pending/route.ts`.
 *
 * Everything except `first-submit` is decided from `Soldier.projects[]`, whose
 * refs already carry `hackathonId` and the jury `position` (populated in
 * `lib/soldiers.ts` from `reports.json` / `report.position`). Only soldiers with
 * a resolved `pubkey` can actually receive a NIP-58 badge; the route splits
 * qualifiers into awardable recipients vs. unresolved (no-pubkey) qualifiers.
 */
import { HACKATHONS, type HackathonProject } from "./hackathons";
import type { HackathonBadgeCriterion } from "./hackathonBadges";
import type { Soldier } from "./soldiers";

export type BadgeQualifierResult = {
  qualified: Soldier[];
  /** false → not machine-evaluable (manual/juror); recipients hand-picked in the UI. */
  autoEvaluable: boolean;
};

const HACKATHON_NUMBER = new Map(HACKATHONS.map((h) => [h.id, h.number]));

/** Distinct hackathon edition numbers this soldier participated in, ascending. */
function participatedNumbers(soldier: Soldier): number[] {
  const nums = new Set<number>();
  for (const ref of soldier.projects) {
    if (!ref.hackathonId) continue;
    const n = HACKATHON_NUMBER.get(ref.hackathonId);
    if (n != null) nums.add(n);
  }
  return [...nums].sort((a, b) => a - b);
}

/** Longest run of consecutive editions (by `Hackathon.number`) the soldier joined. */
export function longestConsecutiveRun(soldier: Soldier): number {
  const nums = participatedNumbers(soldier);
  if (nums.length === 0) return 0;
  let best = 1;
  let run = 1;
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] === nums[i - 1]! + 1) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 1;
    }
  }
  return best;
}

function hasRank(
  soldier: Soldier,
  hackathonId: string,
  pred: (position: number) => boolean,
): boolean {
  return soldier.projects.some(
    (ref) =>
      ref.hackathonId === hackathonId &&
      ref.position != null &&
      pred(ref.position),
  );
}

/** Curated project id with the earliest `submittedAt` in the hackathon, or null. */
function firstSubmitProjectId(
  hackathonId: string,
  projects: HackathonProject[],
): string | null {
  let bestId: string | null = null;
  let bestAt: string | null = null;
  for (const project of projects) {
    if (project.hackathon !== hackathonId || !project.submittedAt) continue;
    if (bestAt === null || project.submittedAt < bestAt) {
      bestAt = project.submittedAt;
      bestId = project.id;
    }
  }
  return bestId;
}

export function evaluateBadgeQualifiers(
  criteria: HackathonBadgeCriterion,
  hackathonId: string,
  soldiers: Soldier[],
  projects: HackathonProject[],
): BadgeQualifierResult {
  switch (criteria.type) {
    case "rank":
      return {
        autoEvaluable: true,
        qualified: soldiers.filter((s) =>
          hasRank(s, hackathonId, (pos) => pos === criteria.position),
        ),
      };
    case "rank-range":
      return {
        autoEvaluable: true,
        qualified: soldiers.filter((s) =>
          hasRank(
            s,
            hackathonId,
            (pos) => pos >= criteria.min && pos <= criteria.max,
          ),
        ),
      };
    case "streak":
      // Streak isn't hackathon-scoped; the route dedupes so each soldier keeps
      // only the single highest streak badge they qualify for.
      return {
        autoEvaluable: true,
        qualified: soldiers.filter(
          (s) => longestConsecutiveRun(s) >= criteria.count,
        ),
      };
    case "first-submit": {
      const projectId = firstSubmitProjectId(hackathonId, projects);
      if (!projectId) return { autoEvaluable: true, qualified: [] };
      return {
        autoEvaluable: true,
        qualified: soldiers.filter((s) =>
          s.projects.some(
            (ref) =>
              ref.hackathonId === hackathonId && ref.projectId === projectId,
          ),
        ),
      };
    }
    case "manual":
    default:
      return { autoEvaluable: false, qualified: [] };
  }
}
