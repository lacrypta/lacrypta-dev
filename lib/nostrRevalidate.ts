/**
 * Tag expiry that reaches both cache tiers.
 *
 * `revalidateTag` only clears Next's tier. The Upstash read-through tier
 * (`lib/upstashCache.ts`) sits underneath it, so expiring a tag on its own lets
 * the very next render re-produce the value straight out of Upstash — serving
 * back exactly what the caller just invalidated. Anything that *hard*-expires a
 * tag has to drop the shadowing Upstash key in the same breath.
 *
 * This is deliberately NOT for stale-marking (`revalidateTag(tag, "max")`).
 * That path wants the cached value to keep being served while it regenerates,
 * which is precisely what the Upstash tier is there to make cheap.
 */

import { revalidateTag } from "next/cache";
import {
  NOSTR_LEGACY_SUBMISSIONS_TAG,
  NOSTR_PROJECTS_TAG,
  NOSTR_SOLDIERS_RANKING_TAG,
} from "./nostrCacheTags";
import { UPSTASH_KEYS, upstashDelete } from "./upstashCache";

/** `nostr:project:<id>` — note `nostr:project-registry` does not match. */
const PROJECT_TAG_PREFIX = "nostr:project:";
const PROFILE_TAG_PREFIX = "nostr:profile:";

/** The Upstash keys a given Next cache tag shadows. Unknown tags map to none. */
function upstashKeysForTag(tag: string): string[] {
  if (tag === NOSTR_PROJECTS_TAG || tag === NOSTR_LEGACY_SUBMISSIONS_TAG) {
    return [UPSTASH_KEYS.submissionsSnapshot];
  }
  if (tag === NOSTR_SOLDIERS_RANKING_TAG) {
    return [UPSTASH_KEYS.soldiersRanking];
  }
  if (tag.startsWith(PROJECT_TAG_PREFIX)) {
    return [UPSTASH_KEYS.projectById(tag.slice(PROJECT_TAG_PREFIX.length))];
  }
  if (tag.startsWith(PROFILE_TAG_PREFIX)) {
    return [UPSTASH_KEYS.profile(tag.slice(PROFILE_TAG_PREFIX.length))];
  }
  return [];
}

/**
 * Hard-expire `tag` in Next's cache and drop whatever Upstash key backs it.
 *
 * Leaves both tiers cold, so the next reader pays the relay scan. Callers that
 * can afford it should follow up with a fresh write-through fetch (see
 * `getFreshNostrSubmissionsSnapshot`) to hand the next reader a warm key.
 */
export async function expireNostrTag(tag: string): Promise<void> {
  revalidateTag(tag, { expire: 0 });
  await upstashDelete(...upstashKeysForTag(tag));
}

/** Batch form of {@link expireNostrTag}. */
export async function expireNostrTags(...tags: string[]): Promise<void> {
  await Promise.all(tags.map((tag) => expireNostrTag(tag)));
}
