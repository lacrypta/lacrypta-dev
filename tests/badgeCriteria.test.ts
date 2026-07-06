import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateBadgeQualifiers,
  longestConsecutiveRun,
} from "../lib/badgeCriteria";
import type { Soldier, SoldierProjectRef } from "../lib/soldiers";
import type { HackathonProject } from "../lib/hackathons";

function ref(
  hackathonId: string | null,
  projectId: string,
  position?: number,
): SoldierProjectRef {
  return {
    hackathonId,
    projectId,
    projectName: projectId,
    role: "dev",
    source: "curated",
    position,
    positionPoints: 0,
  };
}

function soldier(
  name: string,
  pubkey: string | undefined,
  projects: SoldierProjectRef[],
): Soldier {
  return {
    id: `id:${name}`,
    slug: name,
    name,
    pubkey,
    hasNostr: !!pubkey,
    roles: ["dev"],
    projects,
    score: 0,
    scoreBreakdown: { hackathons: 0, projects: 0, positions: 0, total: 0 },
  };
}

// foundations=1, identity=2, commerce=3
const winnerF = soldier("winnerF", "a".repeat(64), [ref("foundations", "p1", 1)]);
const secondF = soldier("secondF", undefined, [ref("foundations", "p2", 2)]);
const streak3 = soldier("streak3", "b".repeat(64), [
  ref("foundations", "pa"), // participation only, unranked
  ref("identity", "pb"),
  ref("commerce", "pc"),
]);
const streakGap = soldier("streakGap", "c".repeat(64), [
  ref("foundations", "pd"),
  ref("commerce", "pe"),
]);
const firstSubmitter = soldier("firstSubmitter", "d".repeat(64), [
  ref("foundations", "early"),
]);
const lateSubmitter = soldier("lateSubmitter", "e".repeat(64), [
  ref("foundations", "late"),
]);

const soldiers = [
  winnerF,
  secondF,
  streak3,
  streakGap,
  firstSubmitter,
  lateSubmitter,
];

const projects: HackathonProject[] = [
  {
    id: "early",
    name: "early",
    description: "",
    team: [],
    status: "submitted",
    hackathon: "foundations",
    submittedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "late",
    name: "late",
    description: "",
    team: [],
    status: "submitted",
    hackathon: "foundations",
    submittedAt: "2026-02-01T00:00:00Z",
  },
];

test("longestConsecutiveRun counts consecutive editions", () => {
  assert.equal(longestConsecutiveRun(streak3), 3);
  assert.equal(longestConsecutiveRun(streakGap), 1); // 1 and 3 → gap
  assert.equal(longestConsecutiveRun(winnerF), 1);
});

test("rank matches exact position in the right hackathon", () => {
  const foundations = evaluateBadgeQualifiers(
    { type: "rank", position: 1 },
    "foundations",
    soldiers,
    projects,
  );
  assert.equal(foundations.autoEvaluable, true);
  assert.deepEqual(
    foundations.qualified.map((s) => s.name),
    ["winnerF"],
  );

  const identity = evaluateBadgeQualifiers(
    { type: "rank", position: 1 },
    "identity",
    soldiers,
    projects,
  );
  assert.equal(identity.qualified.length, 0);
});

test("rank-range includes no-pubkey qualifiers", () => {
  const { qualified } = evaluateBadgeQualifiers(
    { type: "rank-range", min: 1, max: 6 },
    "foundations",
    soldiers,
    projects,
  );
  assert.deepEqual(
    qualified.map((s) => s.name).sort(),
    ["secondF", "winnerF"],
  );
});

test("streak qualifies at/above count, not on a gap", () => {
  const s2 = evaluateBadgeQualifiers(
    { type: "streak", count: 2 },
    "commerce",
    soldiers,
    projects,
  );
  assert.ok(s2.qualified.some((s) => s.name === "streak3"));
  assert.ok(!s2.qualified.some((s) => s.name === "streakGap"));

  const s4 = evaluateBadgeQualifiers(
    { type: "streak", count: 4 },
    "commerce",
    soldiers,
    projects,
  );
  assert.equal(s4.qualified.length, 0); // impossible with 3 editions
});

test("first-submit picks the earliest submittedAt project's team", () => {
  const { qualified, autoEvaluable } = evaluateBadgeQualifiers(
    { type: "first-submit" },
    "foundations",
    soldiers,
    projects,
  );
  assert.equal(autoEvaluable, true);
  assert.deepEqual(
    qualified.map((s) => s.name),
    ["firstSubmitter"],
  );
});

test("manual is not auto-evaluable", () => {
  const { qualified, autoEvaluable } = evaluateBadgeQualifiers(
    { type: "manual" },
    "foundations",
    soldiers,
    projects,
  );
  assert.equal(autoEvaluable, false);
  assert.equal(qualified.length, 0);
});
