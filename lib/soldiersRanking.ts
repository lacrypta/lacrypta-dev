/**
 * Snapshot contract for the official soldiers ranking — a NIP-78 (kind 30078)
 * parameterized replaceable event published by La Crypta. Pure module: shared
 * by the server cache reader (`lib/nostrSoldiersCache.ts`), the publish API
 * route (`app/api/soldiers/ranking/route.ts`), and the roster builder
 * (`lib/soldiers.ts`). No Nostr I/O, no `"use cache"`.
 */

import type { Soldier } from "./soldiers";

export const RANKING_KIND = 30078;
export const RANKING_D_TAG = "lacrypta.dev:soldiers:ranking";
export const RANKING_T_TAG = "lacrypta-dev-soldiers";
export const RANKING_SCHEMA_VERSION = 1;

export type SoldiersRankingSnapshot = {
  version: number;
  /** ISO timestamp the snapshot was generated. */
  generatedAt: string;
  /** Unix seconds the snapshot was generated. */
  generatedAtUnix: number;
  /**
   * Highest Nostr submission `created_at` (unix seconds) folded into this
   * snapshot. The display layer uses it to detect community submissions that
   * arrived *after* the snapshot and merge them on top.
   */
  nostrCutoff: number;
  counts: {
    soldiers: number;
    /** Soldiers that include at least one Nostr-sourced project. */
    nostr: number;
  };
  soldiers: Soldier[];
};

export function serializeRankingSnapshot(
  snapshot: SoldiersRankingSnapshot,
): string {
  return JSON.stringify(snapshot);
}

/** Defensive parse — returns null for anything that isn't a valid snapshot. */
export function parseRankingSnapshot(
  content: string,
): SoldiersRankingSnapshot | null {
  try {
    const parsed = JSON.parse(content) as Partial<SoldiersRankingSnapshot>;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !Array.isArray(parsed.soldiers) ||
      typeof parsed.generatedAtUnix !== "number"
    ) {
      return null;
    }
    return {
      version:
        typeof parsed.version === "number"
          ? parsed.version
          : RANKING_SCHEMA_VERSION,
      generatedAt:
        typeof parsed.generatedAt === "string"
          ? parsed.generatedAt
          : new Date(parsed.generatedAtUnix * 1000).toISOString(),
      generatedAtUnix: parsed.generatedAtUnix,
      nostrCutoff:
        typeof parsed.nostrCutoff === "number" ? parsed.nostrCutoff : 0,
      counts: {
        soldiers: parsed.counts?.soldiers ?? parsed.soldiers.length,
        nostr: parsed.counts?.nostr ?? 0,
      },
      soldiers: parsed.soldiers as Soldier[],
    };
  } catch {
    return null;
  }
}
