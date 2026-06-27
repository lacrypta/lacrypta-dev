/**
 * Server-only cached fetcher for La Crypta's public Lightning node stats.
 *
 * Pulls live capacity / channel data from mempool.space's Lightning API so the
 * infrastructure page can show real numbers without holding LND credentials.
 * Cached for an hour so the page render shares a single upstream round-trip.
 */

import { cacheLife, cacheTag } from "next/cache";

/** La Crypta CABA Lightning node pubkey. */
export const LIGHTNING_NODE_PUBKEY =
  "030ef51039f200c65c5ec4037946b18d7129f63057bb7fe54ad707407a94b37ee0";

export const LIGHTNING_NODE_AMBOSS_URL = `https://amboss.space/node/${LIGHTNING_NODE_PUBKEY}`;

export const LIGHTNING_NODE_CACHE_TAG = "lightning:node-stats";

export type LightningNodeStats = {
  alias: string | null;
  /** Total node capacity in satoshis. */
  capacitySats: number | null;
  channelCount: number | null;
  /** Unix seconds of the node's last gossip update. */
  updatedAt: number | null;
};

const MEMPOOL_ENDPOINT = `https://mempool.space/api/v1/lightning/nodes/${LIGHTNING_NODE_PUBKEY}`;

async function rawFetchNodeStats(): Promise<LightningNodeStats> {
  const res = await fetch(MEMPOOL_ENDPOINT, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`mempool.space responded ${res.status}`);

  const d = (await res.json()) as Record<string, unknown>;
  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  return {
    alias: typeof d.alias === "string" && d.alias.trim() ? d.alias.trim() : null,
    capacitySats: num(d.capacity),
    channelCount: num(d.active_channel_count) ?? num(d.opened_channel_count),
    updatedAt: num(d.updated_at),
  };
}

export async function getLightningNodeStats(): Promise<LightningNodeStats> {
  "use cache";
  cacheLife("hours");
  cacheTag(LIGHTNING_NODE_CACHE_TAG);
  try {
    return await rawFetchNodeStats();
  } catch {
    return {
      alias: null,
      capacitySats: null,
      channelCount: null,
      updatedAt: null,
    };
  }
}

/** Format a satoshi amount as a compact BTC string, e.g. "1.06 BTC". */
export function formatCapacityBtc(sats: number | null): string | null {
  if (sats == null) return null;
  const btc = sats / 1e8;
  return `${btc.toFixed(2)} BTC`;
}
