import { connection, NextResponse } from "next/server";
import { HACKATHONS, allProjects } from "@/lib/hackathons";
import { getSoldiers } from "@/lib/soldiers";
import {
  getCachedHackathonBadgeCatalogSnapshot,
  getCachedHackathonBadgeOwnersSnapshot,
} from "@/lib/hackathonBadgeCache";
import { evaluateBadgeQualifiers } from "@/lib/badgeCriteria";
import type { PendingBadgeGroup } from "@/lib/pendingBadges";
import type { HackathonBadgeCatalogBadge } from "@/lib/hackathonBadges";
import type { Soldier } from "@/lib/soldiers";

/**
 * Read-only admin scan: which soldiers meet each hackathon badge's criteria but
 * are not yet owners. Ungated like the sibling `catalog`/`owners`/`definitions`
 * reads (it exposes only already-public data); awarding stays admin-gated via
 * `/api/hackathon-badges/award`.
 */

type BadgeEntry = {
  hackathonId: string;
  hackathonName: string;
  issuer: string | undefined;
  badge: HackathonBadgeCatalogBadge;
};

type EvaluatedEntry = {
  entry: BadgeEntry;
  order: number;
  ownerSet: Set<string>;
  qualified: Soldier[];
  autoEvaluable: boolean;
};

const isBetter = (
  a: { count: number; order: number },
  b: { count: number; order: number },
) => a.count > b.count || (a.count === b.count && a.order < b.order);

/**
 * A streak is a personal milestone, not a per-hackathon award. Compute, per
 * soldier, the single highest streak badge they *qualify* for (ties → earliest
 * scan order) from the raw qualifier set — before owner-exclusion — so a soldier
 * who already owns `streak-3` is never allowed to cascade down into `streak-2`.
 * Prevents awarding `streak-2` and `streak-3`, or the same badge from multiple
 * hackathon catalogs.
 */
function bestStreakBySoldier(
  evaluated: EvaluatedEntry[],
): Map<string, { count: number; order: number }> {
  const best = new Map<string, { count: number; order: number }>();
  for (const item of evaluated) {
    if (item.entry.badge.criteria.type !== "streak") continue;
    const count = item.entry.badge.criteria.count;
    for (const soldier of item.qualified) {
      const cur = best.get(soldier.id);
      if (!cur || isBetter({ count, order: item.order }, cur)) {
        best.set(soldier.id, { count, order: item.order });
      }
    }
  }
  return best;
}

export async function GET() {
  await connection();
  try {
    const soldiers = await getSoldiers();
    const projects = allProjects();

    // Catalogs first (in parallel) — flatten to a deterministic list of
    // (hackathon, badge) entries in hackathon → badge order.
    const catalogs = await Promise.all(
      HACKATHONS.map((hackathon) =>
        getCachedHackathonBadgeCatalogSnapshot(hackathon.id)
          .then((snapshot) => ({ hackathon, snapshot }))
          .catch(() => ({ hackathon, snapshot: null })),
      ),
    );

    const entries: BadgeEntry[] = [];
    for (const { hackathon, snapshot } of catalogs) {
      const catalog = snapshot?.catalogEvent?.catalog;
      if (!catalog) continue;
      const issuer = snapshot?.publisherPubkey || undefined;
      for (const badge of catalog.badges) {
        entries.push({
          hackathonId: hackathon.id,
          hackathonName: hackathon.name,
          issuer,
          badge,
        });
      }
    }

    // Owner snapshots + criteria evaluation in parallel; Promise.all preserves
    // entry order so `order` stays a deterministic tiebreak for streak dedup.
    const evaluated: EvaluatedEntry[] = await Promise.all(
      entries.map(async (entry, order): Promise<EvaluatedEntry> => {
        const ownersSnapshot = await getCachedHackathonBadgeOwnersSnapshot(
          entry.badge.definition,
          entry.issuer,
        ).catch(() => null);
        const ownerSet = new Set(
          (ownersSnapshot?.owners ?? []).map((owner) => owner.pubkey),
        );
        const { qualified, autoEvaluable } = evaluateBadgeQualifiers(
          entry.badge.criteria,
          entry.hackathonId,
          soldiers,
          projects,
        );
        return { entry, order, ownerSet, qualified, autoEvaluable };
      }),
    );

    const bestStreak = bestStreakBySoldier(evaluated);

    const groups: PendingBadgeGroup[] = evaluated.map((item) => {
      const { entry, order, ownerSet, qualified, autoEvaluable } = item;
      const isStreak = entry.badge.criteria.type === "streak";
      const streakCount = isStreak
        ? (entry.badge.criteria as { count: number }).count
        : 0;

      const group: PendingBadgeGroup = {
        hackathonId: entry.hackathonId,
        hackathonName: entry.hackathonName,
        badge: entry.badge,
        autoEvaluable,
        recipients: [],
        unresolvedQualifiers: [],
        ownerPubkeys: [...ownerSet],
        alreadyAwarded: ownerSet.size,
      };

      for (const soldier of qualified) {
        // Streak: only surface a soldier in the single highest badge they
        // qualify for, regardless of whether they already own it.
        if (isStreak) {
          const best = bestStreak.get(soldier.id);
          if (!best || best.count !== streakCount || best.order !== order) {
            continue;
          }
        }
        if (soldier.pubkey) {
          if (!ownerSet.has(soldier.pubkey)) {
            group.recipients.push({
              pubkey: soldier.pubkey,
              name: soldier.name,
              nip05: soldier.nip05,
            });
          }
        } else {
          group.unresolvedQualifiers.push({
            name: soldier.name,
            slug: soldier.slug,
          });
        }
      }

      return group;
    });

    // Manual badges always surface (hand-picked). Auto badges only when there is
    // something to show.
    const visible = groups.filter(
      (group) =>
        !group.autoEvaluable ||
        group.recipients.length > 0 ||
        group.unresolvedQualifiers.length > 0,
    );

    return NextResponse.json({ groups: visible });
  } catch (error) {
    console.error("[api/hackathon-badges/pending] failed", error);
    return NextResponse.json(
      { error: "No se pudieron calcular los badges pendientes." },
      { status: 500 },
    );
  }
}
