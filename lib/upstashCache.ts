/**
 * Server-only Upstash Redis read-through cache.
 *
 * Sits *underneath* the `"use cache"` layer, never replacing it. The relay
 * fetchers in `lib/nostrCache.ts` & friends cost 3.5–6s per scan; `"use cache"`
 * hides that only while its entry is warm. Every cold start, every deploy, and
 * every `revalidateTag(tag, { expire: 0 })` re-runs the producer — and on that
 * request (often a crawler) the render blocks on the relays.
 *
 * With this layer the producer first asks Upstash: if any instance scanned
 * recently, the answer is a ~50ms HTTP GET instead of a 6s relay fan-out. Only
 * a true miss (nobody scanned within the TTL) reaches the relays.
 *
 * Deliberately app-level rather than a Next `cacheHandlers` implementation:
 * custom cache handlers are not invoked on Vercel (the platform's own Data
 * Cache backs `"use cache"` there), whereas plain HTTPS calls to Upstash REST
 * behave identically on Vercel, Docker and `next start`.
 *
 * Failure policy: Upstash is a *cache*, never a dependency. Every call is
 * wrapped — a read error falls through to the producer, a write error is
 * dropped. An Upstash outage degrades latency, never correctness.
 */

import { Redis } from "@upstash/redis";
import { isDevMode } from "./devMode";
import { DEFAULT_RELAYS } from "./nostrRelayConfig";

/**
 * Cache keys. Versioned (`:v1`) so a shape change is a new keyspace rather than
 * a deserialization hazard against entries written by an older deploy.
 */
export const UPSTASH_KEYS = {
  submissionsSnapshot: "nostr:snapshot:v1",
  soldiersRanking: "nostr:ranking:v1",
  projectById: (projectId: string) => `nostr:project:${projectId}:v1`,
  /**
   * Durable per-project copy for *registered* projects. Unlike `projectById`
   * (a short-lived lookup cache that heals not-found fast), this is written
   * only when we hold a real project in hand (slug registration, targeted
   * refetch, cache warm) and kept for a very long TTL so a thinly-propagated
   * registered project (the `/projects/<slug>` "not found" class of bug) always
   * has a backend copy to render — the relay scan only ever supplies newer data.
   */
  projectDurable: (projectId: string) => `nostr:project-durable:${projectId}:v1`,
  profile: (pubkey: string) => `nostr:profile:${pubkey}:v1`,
} as const;

/**
 * TTLs mirror the `cacheLife` profiles in `next.config.ts` so the two layers
 * expire in step — Upstash must not pin data the `"use cache"` layer considers
 * stale, nor expire so fast that it stops absorbing cold starts.
 */
export const UPSTASH_TTL = {
  /** `nostr` profile: revalidate 300. */
  snapshot: 300,
  /** `nostrLookup` profile: revalidate 30 — a transient not-found must heal fast. */
  lookup: 30,
  /** `days` profiles. */
  profile: 60 * 60 * 24,
  ranking: 60 * 60 * 24,
  /**
   * Durable per-project copy: a year. Registrations are rare and each entry is
   * ~1 KB, so this is effectively permanent — refreshed on every update
   * (targeted refetch) and by the warm cron, and only ever overwritten with
   * newer data. The long TTL is what guarantees a registered project never
   * silently falls back to "not found".
   */
  durable: 60 * 60 * 24 * 365,
} as const;

function usingLocalRelays(): boolean {
  return DEFAULT_RELAYS.some((relay) =>
    /^wss?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(relay.trim()),
  );
}

/**
 * Environment discriminator baked into every key.
 *
 * Two distinct hazards, one mechanism:
 *
 *  - A dev build reads from a local relay and seeds dummy users/projects
 *    (`lib/devSeed.ts`). Were those snapshots to land on the keys production
 *    reads, one `pnpm dev` against a shared Upstash would serve fake projects
 *    to the public site.
 *  - Preview deployments share the Upstash database with production. A branch
 *    that changes the shape of `CachedNostrProject` would otherwise write that
 *    shape into the very keys production reads back.
 *
 * Splitting on `VERCEL_ENV` makes both impossible while still giving previews a
 * persistent cache of their own. Unset (self-host, `next start`) means prod.
 */
function environmentNamespace(): "dev" | "preview" | "prod" {
  if (isDevMode() || usingLocalRelays()) return "dev";
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv === "preview") return "preview";
  if (vercelEnv === "development") return "dev";
  return "prod";
}

const KEY_NAMESPACE = environmentNamespace();

function namespacedKey(key: string): string {
  return `lacrypta:${KEY_NAMESPACE}:${key}`;
}

let client: Redis | null | undefined;

/**
 * Lazily-built singleton, or `null` when the cache is not configured — the
 * absence of credentials is a supported state (local dev, CI, self-host without
 * Upstash), not an error. Set `UPSTASH_CACHE_DISABLED=1` to force it off while
 * leaving the credentials in place.
 */
export function getRedis(): Redis | null {
  if (client !== undefined) return client;
  client = buildClient();
  return client;
}

function buildClient(): Redis | null {
  // Vercel's Upstash marketplace integration injects the REST credentials under
  // `KV_REST_API_*`; a hand-rolled setup (or self-host) uses Upstash's own
  // `UPSTASH_REDIS_REST_*`. Accept either so the source of the database doesn't
  // leak into the code.
  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  if (process.env.UPSTASH_CACHE_DISABLED === "1") return null;
  try {
    return new Redis({ url, token });
  } catch {
    return null;
  }
}

/** True when reads/writes will actually reach Upstash. Useful for warm routes. */
export function isUpstashEnabled(): boolean {
  return getRedis() !== null;
}

type ReadThroughOptions<T> = {
  /**
   * Gate on the produced value before persisting it. Defaults to "cache
   * anything non-nullish". Use it to keep poisoned results out of the shared
   * cache (e.g. an empty snapshot produced by a relay timeout).
   */
  shouldCache?: (value: T) => boolean;
};

/**
 * Return the cached value for `key`, else run `producer()` and persist it.
 *
 * `null` is never stored, so a cached `null` can't be confused with a miss. The
 * consequence is that not-found results (a project id nobody published) re-run
 * the producer on every Upstash miss; the `"use cache"` layer above bounds that
 * fan-out per instance, which is the same trade the `nostrLookup` profile makes.
 */
export async function upstashReadThrough<T>(
  key: string,
  ttlSeconds: number,
  producer: () => Promise<T>,
  options?: ReadThroughOptions<T>,
): Promise<T> {
  const redis = getRedis();
  if (!redis) return producer();

  const fullKey = namespacedKey(key);

  try {
    const hit = await redis.get<T>(fullKey);
    if (hit !== null && hit !== undefined) return hit;
  } catch {
    return producer();
  }

  const value = await producer();
  const shouldCache =
    options?.shouldCache ?? ((v: T) => v !== null && v !== undefined);
  if (shouldCache(value)) {
    try {
      await redis.set(fullKey, value, { ex: ttlSeconds });
    } catch {
      /* best-effort write; the value is already on its way to the caller */
    }
  }
  return value;
}

/**
 * Plain read (no producer fallback). Returns the cached value or `null` — a
 * miss and a genuinely-absent key are indistinguishable, which is exactly what
 * the durable-fallback path wants: "serve the last copy we ever saw, else null".
 * Best-effort: any error (or unconfigured cache) reads as a miss.
 */
export async function upstashGet<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const hit = await redis.get<T>(namespacedKey(key));
    return hit ?? null;
  } catch {
    return null;
  }
}

/**
 * Overwrite a key outright. Backs the write-through paths: a route that just
 * scanned the relays for read-your-writes should refresh the shared cache so
 * the next render finds it warm instead of re-scanning.
 */
export async function upstashSet<T>(
  key: string,
  value: T,
  ttlSeconds: number,
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(namespacedKey(key), value, { ex: ttlSeconds });
  } catch {
    /* best-effort */
  }
}

/**
 * Best-effort distributed lock (SET NX EX). Serializes the registry
 * read-modify-write across serverless instances so two near-simultaneous slug
 * claims can't each read the registry, append, and clobber the other's entry.
 *
 * Returns `true` when the lock was taken OR the cache is unconfigured — without
 * Upstash there is no cross-instance contention to guard (single-process dev /
 * self-host), and a cache hiccup must never block a legitimate write. So this
 * narrows the race window; the fresh-read-before-sign remains the correctness
 * backstop.
 */
export async function upstashAcquireLock(
  key: string,
  ttlSeconds: number,
): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return true;
  try {
    const res = await redis.set(namespacedKey(key), "1", {
      nx: true,
      ex: ttlSeconds,
    });
    return res === "OK";
  } catch {
    return true;
  }
}

/** Release a lock taken with {@link upstashAcquireLock}. */
export async function upstashReleaseLock(key: string): Promise<void> {
  await upstashDelete(key);
}

/** Drop keys so the next read re-produces them. No-op when unconfigured. */
export async function upstashDelete(...keys: string[]): Promise<void> {
  const redis = getRedis();
  if (!redis || keys.length === 0) return;
  try {
    await redis.del(...keys.map(namespacedKey));
  } catch {
    /* best-effort */
  }
}
