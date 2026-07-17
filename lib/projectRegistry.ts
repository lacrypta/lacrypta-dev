/**
 * Server-only reader/publisher for the project-slug registry event (see
 * `lib/projectRegistryContract.ts` for the event contract and the canonical
 * URL rule).
 *
 * Publish safety model (this signs with LACRYPTA_NSEC automatically, so the
 * guards matter):
 * - No-ops without LACRYPTA_NSEC, and with REGISTRY_PUBLISH_DISABLED=1.
 * - Fetches the current registry FRESH from relays right before publishing
 *   and union-merges — a stale cached read can never drop entries published
 *   by a concurrent instance.
 * - Publishes with `created_at = max(now, current.created_at + 1)` so a lost
 *   race can't overwrite a newer registry.
 * - Only auto-registers Nostr projects tied to a known hackathon or older
 *   than 10 minutes (cheap spam filter — anyone can emit project events).
 * - Hard entry/size caps with loud logs instead of silent relay rejections.
 * - Never throws: registry publication must never break a page load.
 */

import { cacheLife, cacheTag } from "next/cache";
import { DEFAULT_RELAYS } from "./nostrRelayConfig";
import { NOSTR_PROJECT_REGISTRY_TAG } from "./nostrCacheTags";
import { expireNostrTag } from "./nostrRevalidate";
import {
  upstashAcquireLock,
  upstashReleaseLock,
  upstashSet,
} from "./upstashCache";
import {
  PROJECT_REDIRECT_MAP_KEY,
  PROJECT_REDIRECT_MAP_TTL,
  buildRedirectMap,
} from "./projectRedirectMap";
import type { SignedEvent } from "./nostrSigner";
import {
  PROJECT_REGISTRY_D_TAG,
  PROJECT_REGISTRY_KIND,
  PROJECT_REGISTRY_MAX_CONTENT_BYTES,
  PROJECT_REGISTRY_MAX_ENTRIES,
  PROJECT_REGISTRY_SCHEMA_VERSION,
  PROJECT_REGISTRY_T_TAG,
  assignUniqueSlug,
  baseSlugForProject,
  parseProjectRegistry,
  serializeProjectRegistry,
  type ProjectRegistryEntry,
  type ProjectRegistrySnapshot,
} from "./projectRegistryContract";
import {
  HACKATHONS,
  comparableProjectName,
  comparableRepo,
  getHackathonProjects,
  type HackathonProject,
} from "./hackathons";
import { PROJECTS as HOME_PROJECTS } from "./projects";
import type { CachedNostrProject } from "./nostrCache";
import { getFreshNostrSubmissionsSnapshot } from "./nostrCache";
import { resolvePublisherPubkey } from "./lacryptaKeys";

type IncomingEvent = {
  id: string;
  pubkey: string;
  content: string;
  tags: string[][];
  created_at: number;
  sig: string;
  kind: number;
};

export type ProjectRegistryState = {
  entries: ProjectRegistryEntry[];
  bySlug: Map<string, ProjectRegistryEntry>;
  byIdLc: Map<string, ProjectRegistryEntry>;
  byName: Map<string, ProjectRegistryEntry>;
};

export function buildRegistryState(
  entries: ProjectRegistryEntry[],
): ProjectRegistryState {
  const bySlug = new Map<string, ProjectRegistryEntry>();
  const byIdLc = new Map<string, ProjectRegistryEntry>();
  const byName = new Map<string, ProjectRegistryEntry>();
  // Slugs are permanent (append-only), but a project MAY change which slug is
  // canonical by publishing a newer entry for the same id. So resolve id/name
  // to the LATEST entry (canonical) while `bySlug` keeps every slug — including
  // a project's earlier slugs, which stay resolvable as owner-locked redirect
  // aliases. Process oldest-first so the newest write wins the id/name maps.
  const ordered = [...entries].sort(
    (a, b) => (a.registeredAt || 0) - (b.registeredAt || 0),
  );
  for (const entry of ordered) {
    // Each slug maps to exactly one project (uniqueness is enforced at write
    // time); a re-registration of the same slug just refreshes the entry.
    bySlug.set(entry.slug, entry);
    byIdLc.set(entry.id.toLowerCase(), entry);
    const nameKey = comparableProjectName(entry.name);
    if (nameKey) byName.set(nameKey, entry);
  }
  return { entries, bySlug, byIdLc, byName };
}

function authorCompatible(
  entry: ProjectRegistryEntry,
  author: string | undefined,
): boolean {
  return !entry.author || !author || entry.author === author;
}

/**
 * Registry entry a given project resolves to, if any. Both the id and name
 * matches require author compatibility: project ids and names are
 * attacker-choosable, so without the guard a stranger's event could capture
 * (or be captured by) another author's registered slug. Curated entries have
 * no author and stay matchable by anyone — that's the curated-twin contract.
 */
export function registryEntryForProject(
  state: ProjectRegistryState,
  project: { id: string; name: string; author?: string },
): ProjectRegistryEntry | null {
  const byId = state.byIdLc.get(project.id.toLowerCase());
  if (byId && authorCompatible(byId, project.author)) {
    return byId;
  }
  const nameKey = comparableProjectName(project.name);
  if (nameKey) {
    const byName = state.byName.get(nameKey);
    if (byName && authorCompatible(byName, project.author)) return byName;
  }
  return null;
}

/* ───────────────────────────── reads ─────────────────────────────────── */

type RegistryEventRead =
  | { status: "ok"; snapshot: ProjectRegistrySnapshot; createdAt: number }
  /** Relays answered (EOSE) and no registry event exists yet. */
  | { status: "empty-confirmed" }
  /** No relay confirmed anything — indistinguishable from an outage. */
  | { status: "no-response" };

async function rawFetchRegistry(timeoutMs = 4500): Promise<RegistryEventRead> {
  const pubkey = await resolvePublisherPubkey();
  if (!pubkey) return { status: "no-response" };

  const relays = DEFAULT_RELAYS;
  const { SimplePool } = await import("nostr-tools/pool");
  const { verifyEvent } = await import("nostr-tools/pure");
  const pool = new SimplePool();
  const events: IncomingEvent[] = [];
  let sawEose = false;

  const closer = pool.subscribe(
    relays,
    {
      kinds: [PROJECT_REGISTRY_KIND],
      authors: [pubkey],
      "#d": [PROJECT_REGISTRY_D_TAG],
    },
    {
      onevent(ev: IncomingEvent) {
        events.push(ev);
      },
      oneose() {
        sawEose = true;
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

  // The registry controls site-wide routing — verify signatures instead of
  // trusting the relay's `authors` filter, and reject far-future timestamps.
  const nowPlusSkew = Math.floor(Date.now() / 1000) + 600;
  events.sort((a, b) => b.created_at - a.created_at);
  for (const ev of events) {
    if (ev.created_at > nowPlusSkew) continue;
    try {
      if (!verifyEvent(ev)) continue;
    } catch {
      continue;
    }
    const snapshot = parseProjectRegistry(ev.content);
    if (snapshot) return { status: "ok", snapshot, createdAt: ev.created_at };
  }
  return sawEose ? { status: "empty-confirmed" } : { status: "no-response" };
}

const EMPTY_REGISTRY: ProjectRegistrySnapshot = {
  version: PROJECT_REGISTRY_SCHEMA_VERSION,
  updatedAt: new Date(0).toISOString(),
  entries: [],
};

async function getProjectRegistryCached(): Promise<ProjectRegistrySnapshot> {
  "use cache";
  cacheLife("nostr");
  cacheTag(NOSTR_PROJECT_REGISTRY_TAG);
  try {
    const read = await rawFetchRegistry();
    return read.status === "ok" ? read.snapshot : EMPTY_REGISTRY;
  } catch {
    return EMPTY_REGISTRY;
  }
}

export async function getProjectRegistry(): Promise<ProjectRegistrySnapshot> {
  return getProjectRegistryCached();
}

export async function getProjectRegistryState(): Promise<ProjectRegistryState> {
  return buildRegistryState((await getProjectRegistryCached()).entries);
}

/* ─────────────────────────────── sync ──────────────────────────────────── */

type LogicalProject = {
  id: string;
  name: string;
  author?: string;
  hackathon?: string | null;
  curated: boolean;
  /** Content-level createdAt (unix seconds) — edit-stable ordering key. */
  createdAt?: number;
  /** Relay event created_at (unix seconds) — used by the spam gate. */
  eventCreatedAt?: number;
};

/**
 * Collect all known projects as logical projects, deduped with the same
 * identity contract `mergeWithSubmissions` uses (case-insensitive id, or
 * normalized repo, or normalized name ⇒ same project; curated wins).
 * Hackathon-curated first, then homepage-curated, then Nostr submissions in
 * a stable (createdAt, author, id) order so registration order — and thus
 * collision suffixes — never depend on mutable event timestamps.
 */
function collectLogicalProjects(
  nostrProjects: CachedNostrProject[],
): LogicalProject[] {
  const out: LogicalProject[] = [];
  const seenIds = new Set<string>();
  const seenRepos = new Set<string>();
  const seenNames = new Set<string>();

  const claim = (p: {
    id: string;
    name: string;
    repo?: string;
  }): boolean => {
    const idLc = p.id.toLowerCase();
    const repo = comparableRepo(p.repo);
    const name = comparableProjectName(p.name);
    if (seenIds.has(idLc) || (repo && seenRepos.has(repo)) || (name && seenNames.has(name))) {
      return false;
    }
    seenIds.add(idLc);
    if (repo) seenRepos.add(repo);
    if (name) seenNames.add(name);
    return true;
  };

  const curatedHackathon: HackathonProject[] = HACKATHONS.flatMap((h) =>
    getHackathonProjects(h.id),
  );
  for (const p of curatedHackathon) {
    if (!claim(p)) continue;
    out.push({
      id: p.id,
      name: p.name,
      hackathon: p.hackathon,
      curated: true,
    });
  }

  for (const p of HOME_PROJECTS) {
    if (!claim(p)) continue;
    out.push({ id: p.id, name: p.name, hackathon: p.hackathon, curated: true });
  }

  const sortedNostr = [...nostrProjects].sort(
    (a, b) =>
      (a.createdAt || 0) - (b.createdAt || 0) ||
      a.author.localeCompare(b.author) ||
      a.id.localeCompare(b.id),
  );
  for (const p of sortedNostr) {
    if (!claim(p)) continue;
    out.push({
      id: p.id,
      name: p.name,
      author: p.author,
      hackathon: p.hackathon,
      curated: false,
      createdAt: p.createdAt,
      eventCreatedAt: p.eventCreatedAt,
    });
  }

  return out;
}

const KNOWN_HACKATHON_IDS = new Set(HACKATHONS.map((h) => h.id));
const NOSTR_MIN_AGE_SECONDS = 10 * 60;
// Per-entry field caps: every field except `registeredAt` originates in
// attacker-controlled event content, and entries are permanent.
const MAX_ENTRY_ID_CHARS = 128;
const MAX_ENTRY_NAME_CHARS = 120;
const MAX_ENTRY_SLUG_CHARS = 80;
const HEX64 = /^[0-9a-f]{64}$/;

function passesSpamGate(p: LogicalProject, nowUnix: number): boolean {
  if (p.curated) return true;
  if (p.hackathon && KNOWN_HACKATHON_IDS.has(p.hackathon)) return true;
  // Age check on the relay event timestamp. Attacker-signed timestamps are
  // advisory either way; the entry/size caps are the real damage bound.
  const seenAt = p.eventCreatedAt ?? p.createdAt ?? 0;
  return seenAt > 0 && nowUnix - seenAt >= NOSTR_MIN_AGE_SECONDS;
}

function entryShapeValid(p: LogicalProject): boolean {
  if (!p.id || p.id.length > MAX_ENTRY_ID_CHARS) return false;
  if (p.author && !HEX64.test(p.author)) return false;
  return true;
}

export function computeRegistryAdditions(
  current: ProjectRegistryEntry[],
  nostrProjects: CachedNostrProject[],
  nowUnix: number,
): ProjectRegistryEntry[] {
  const state = buildRegistryState(current);
  const taken = new Set(current.map((e) => e.slug));
  const additions: ProjectRegistryEntry[] = [];

  for (const project of collectLogicalProjects(nostrProjects)) {
    if (registryEntryForProject(state, project)) continue;
    if (!passesSpamGate(project, nowUnix)) continue;
    if (!entryShapeValid(project)) continue;

    const base = baseSlugForProject(project).slice(0, MAX_ENTRY_SLUG_CHARS);
    const slug = assignUniqueSlug(base, taken);
    const entry: ProjectRegistryEntry = {
      slug,
      id: project.id,
      name: project.name.slice(0, MAX_ENTRY_NAME_CHARS),
      author: project.author,
      hackathon: project.hackathon ?? null,
      curated: project.curated || undefined,
      registeredAt: nowUnix,
    };
    additions.push(entry);
    taken.add(slug);
    state.bySlug.set(slug, entry);
    state.byIdLc.set(project.id.toLowerCase(), entry);
    const nameKey = comparableProjectName(project.name);
    if (nameKey && !state.byName.has(nameKey)) state.byName.set(nameKey, entry);
  }

  return additions;
}

async function publishToRelays(
  signed: IncomingEvent,
  relays: string[],
  perRelayTimeoutMs = 8000,
): Promise<boolean> {
  const { SimplePool } = await import("nostr-tools/pool");
  const pool = new SimplePool();
  const promises = pool.publish(relays, signed);
  const results = await Promise.all(
    relays.map(async (relay, i) => {
      try {
        await Promise.race([
          promises[i],
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), perRelayTimeoutMs),
          ),
        ]);
        return true;
      } catch {
        return false;
      }
    }),
  );
  try {
    pool.close(relays);
  } catch {
    /* noop */
  }
  return results.some(Boolean);
}

/* ─────────────────────────── sign helpers ──────────────────────────────── */

async function getBackendSecretBytes(): Promise<Uint8Array | null> {
  const nsec = process.env.LACRYPTA_NSEC;
  if (!nsec) return null;
  try {
    const { decode } = await import("nostr-tools/nip19");
    const decoded = decode(nsec);
    if (decoded.type !== "nsec") return null;
    return decoded.data as Uint8Array;
  } catch {
    return null;
  }
}

/**
 * Build + sign the single replaceable registry event from a full entry list.
 * Shared by the automatic sync and the user-initiated claim so both apply the
 * same tags and the same monotonic `created_at` floor (a lost race can never
 * shadow a newer registry someone else published).
 */
async function buildAndSignRegistryEvent(
  entries: ProjectRegistryEntry[],
  prevCreatedAt: number,
  nowMs: number,
  secret: Uint8Array,
): Promise<SignedEvent> {
  const { finalizeEvent } = await import("nostr-tools/pure");
  const nowUnix = Math.floor(nowMs / 1000);
  const snapshot: ProjectRegistrySnapshot = {
    version: PROJECT_REGISTRY_SCHEMA_VERSION,
    updatedAt: new Date(nowMs).toISOString(),
    entries,
  };
  return finalizeEvent(
    {
      kind: PROJECT_REGISTRY_KIND,
      created_at: Math.max(nowUnix, prevCreatedAt + 1),
      content: serializeProjectRegistry(snapshot),
      tags: [
        ["d", PROJECT_REGISTRY_D_TAG],
        ["t", PROJECT_REGISTRY_T_TAG],
        ["client", "La Crypta Dev"],
        ["projects", String(entries.length)],
      ],
    },
    secret,
  ) as unknown as SignedEvent;
}

/**
 * Write the edge redirect map (`id/old-slug → canonical-slug`) to Upstash so
 * `proxy.ts` can 308 legacy `/projects/<id>` URLs. Best-effort — a failure
 * only means the proxy falls back to the page's redirect for a bit.
 */
async function writeRedirectMap(entries: ProjectRegistryEntry[]): Promise<void> {
  try {
    await upstashSet(
      PROJECT_REDIRECT_MAP_KEY,
      buildRedirectMap(entries),
      PROJECT_REDIRECT_MAP_TTL,
    );
  } catch {
    /* best-effort */
  }
}

/** Rebuild + persist the redirect map from the current registry. Called by the
 *  warm cron so the map stays fresh even without new registrations. */
export async function refreshProjectRedirectMap(): Promise<void> {
  const state = await getProjectRegistryState();
  await writeRedirectMap(state.entries);
}

let lastSyncAttempt = 0;
const SYNC_THROTTLE_MS = 5 * 60 * 1000;

/** Serializes ALL registry writers (auto-sync + user claims) so concurrent
 *  read-modify-writes can't lost-update the single replaceable event. */
const REGISTRY_WRITE_LOCK = "lock:project-registry";
const REGISTRY_WRITE_LOCK_TTL = 15;

/** Max distinct projects one author may register (cheap sybil/DoS brake). */
const MAX_SLUGS_PER_AUTHOR = 30;

let curatedIdSet: Set<string> | null = null;
/** True when `id` is a curated (in-tree) project id — these are La Crypta-owned
 *  and auto-registered by sync; users must never claim them (their canonical URL
 *  is already the id). */
export function isCuratedProjectId(id: string): boolean {
  if (!curatedIdSet) {
    curatedIdSet = new Set<string>();
    for (const h of HACKATHONS) {
      for (const p of getHackathonProjects(h.id)) {
        curatedIdSet.add(p.id.toLowerCase());
      }
    }
    for (const p of HOME_PROJECTS) curatedIdSet.add(p.id.toLowerCase());
  }
  return curatedIdSet.has(id.toLowerCase());
}

/**
 * Register any not-yet-registered projects by publishing an updated registry
 * event. Call via `after(() => syncProjectRegistry())` from a route handler —
 * never as a detached promise (the platform may kill the work and pending
 * `revalidateTag` calls would be dropped).
 */
export async function syncProjectRegistry(): Promise<void> {
  try {
    if (process.env.REGISTRY_PUBLISH_DISABLED === "1") return;
    const nsec = process.env.LACRYPTA_NSEC;
    if (!nsec) return;

    const now = Date.now();
    if (now - lastSyncAttempt < SYNC_THROTTLE_MS) return;
    lastSyncAttempt = now;

    // Take the shared registry write lock so a concurrent user slug claim (or a
    // sync on another instance) can't lost-update the single replaceable event.
    // If someone else holds it, skip — the next throttle window retries.
    const locked = await upstashAcquireLock(
      REGISTRY_WRITE_LOCK,
      REGISTRY_WRITE_LOCK_TTL,
    );
    if (!locked) return;
    try {
    // Read-modify-write against the FRESH relay state, never the cached copy:
    // the cache is stale by design (SWR) and merging over it would drop
    // entries a concurrent instance just published.
    const [currentRead, cachedRegistry, freshSnapshot] = await Promise.all([
      rawFetchRegistry(),
      getProjectRegistryCached(),
      getFreshNostrSubmissionsSnapshot(),
    ]);
    if (currentRead.status === "no-response") {
      // An outage is indistinguishable from "registry doesn't exist yet".
      // Publishing on top of a failed read would rebuild from scratch and
      // permanently reassign already-published slugs — never do that.
      console.warn(
        "[projectRegistry] registry read got no relay response — skipping sync",
      );
      return;
    }
    const currentEntries =
      currentRead.status === "ok" ? currentRead.snapshot.entries : [];
    if (currentEntries.length < cachedRegistry.entries.length) {
      // Entries are append-only: a fresh base smaller than anything we've
      // already seen means a bad/partial read, not a real shrink.
      console.warn(
        `[projectRegistry] fresh registry read (${currentEntries.length} entries) is behind the cached copy (${cachedRegistry.entries.length}) — skipping sync`,
      );
      return;
    }
    const nowUnix = Math.floor(now / 1000);

    let additions = computeRegistryAdditions(
      currentEntries,
      freshSnapshot.projects,
      nowUnix,
    );
    if (additions.length === 0) return;

    if (currentEntries.length + additions.length > PROJECT_REGISTRY_MAX_ENTRIES) {
      const room = Math.max(0, PROJECT_REGISTRY_MAX_ENTRIES - currentEntries.length);
      console.warn(
        `[projectRegistry] entry cap: registering ${room}/${additions.length} pending projects. Consider sharding the registry.`,
      );
      additions = additions.slice(0, room);
      if (additions.length === 0) return;
    }

    // Size-bound the publish per-entry: drop what doesn't fit instead of
    // skipping the whole publish, so one oversized event can never freeze
    // registration for everyone after it.
    const encoder = new TextEncoder();
    const makeSnapshot = (list: ProjectRegistryEntry[]): ProjectRegistrySnapshot => ({
      version: PROJECT_REGISTRY_SCHEMA_VERSION,
      updatedAt: new Date(now).toISOString(),
      entries: [...currentEntries, ...list],
    });
    let content = serializeProjectRegistry(makeSnapshot(additions));
    while (
      additions.length > 0 &&
      encoder.encode(content).length > PROJECT_REGISTRY_MAX_CONTENT_BYTES
    ) {
      additions = additions.slice(0, -1);
      content = serializeProjectRegistry(makeSnapshot(additions));
    }
    if (additions.length === 0) {
      console.warn(
        "[projectRegistry] registry at size cap — skipping publish. Consider sharding the registry.",
      );
      return;
    }
    const snapshot = makeSnapshot(additions);
    const entries = snapshot.entries;

    const secret = await getBackendSecretBytes();
    if (!secret) return;
    const signed = await buildAndSignRegistryEvent(
      entries,
      currentRead.status === "ok" ? currentRead.createdAt : 0,
      now,
      secret,
    );

    const ok = await publishToRelays(signed, DEFAULT_RELAYS);
    if (!ok) {
      console.warn("[projectRegistry] no relay accepted the registry event");
      return;
    }

    const { revalidateTag } = await import("next/cache");
    revalidateTag(NOSTR_PROJECT_REGISTRY_TAG, "max");
    await writeRedirectMap(entries);
    console.log(
      `[projectRegistry] registered ${additions.length} project(s): ${additions
        .map((a) => a.slug)
        .join(", ")}`,
    );
    } finally {
      await upstashReleaseLock(REGISTRY_WRITE_LOCK);
    }
  } catch (error) {
    console.warn("[projectRegistry] sync failed", error);
  }
}

/* ──────────────────── user-initiated slug registration ─────────────────── */

export type RegisterSlugResult =
  | { status: "ok"; event: SignedEvent; slug: string; changed: boolean }
  | { status: "error"; code: number; message: string };

/**
 * User-initiated slug registration / change. The API route has already
 * authenticated the requester and verified they OWN the project; this function
 * owns the registry read-modify-write:
 *  - serialize concurrent writers with a best-effort Upstash lock,
 *  - fresh-read the registry from relays (never the cached copy),
 *  - reject a slug already owned by a DIFFERENT project (append-only, no hijack),
 *  - append the new entry — which is also how a slug CHANGES: the newer entry
 *    becomes canonical (`buildRegistryState` is latest-wins per id) and the old
 *    slug stays a redirect alias,
 *  - sign with LACRYPTA_NSEC, publish server-side, and return the event for the
 *    client to also republish.
 *
 * Never throws — returns a typed error the route maps to an HTTP status.
 */
export async function registerUserProjectSlug(input: {
  projectId: string;
  /** Pre-normalized/validated by the route (see `normalizeRequestedSlug`). */
  slug: string;
  requesterPubkey: string;
  project: { name: string; hackathon: string | null };
}): Promise<RegisterSlugResult> {
  const secret = await getBackendSecretBytes();
  if (!secret) {
    return { status: "error", code: 503, message: "Registro de URLs no disponible." };
  }

  const locked = await upstashAcquireLock(
    REGISTRY_WRITE_LOCK,
    REGISTRY_WRITE_LOCK_TTL,
  );
  if (!locked) {
    return {
      status: "error",
      code: 409,
      message: "Hay otro registro en curso. Probá de nuevo en unos segundos.",
    };
  }

  try {
    // Fresh relay read + the cached high-water copy. Both are needed to enforce
    // the append-only invariant: a stale/partial/empty relay read must NEVER be
    // used as the base, or we'd sign a NEWER (monotonic created_at) but SHORTER
    // registry that replaces the real one and drops everyone else's entries.
    const [currentRead, cachedRegistry] = await Promise.all([
      rawFetchRegistry(),
      getProjectRegistryCached(),
    ]);
    if (currentRead.status === "no-response") {
      return {
        status: "error",
        code: 503,
        message: "No se pudo leer el registro (relays sin respuesta).",
      };
    }
    const currentEntries =
      currentRead.status === "ok" ? currentRead.snapshot.entries : [];
    if (currentEntries.length < cachedRegistry.entries.length) {
      // Fresh base smaller than the high-water copy ⇒ a bad/partial read (or an
      // `empty-confirmed` from relays that just don't hold the newest event).
      // Bail rather than publish a shrunken registry over the real one.
      return {
        status: "error",
        code: 503,
        message: "El registro no está sincronizado. Probá de nuevo en unos segundos.",
      };
    }
    const prevCreatedAt =
      currentRead.status === "ok" ? currentRead.createdAt : 0;
    const state = buildRegistryState(currentEntries);

    const idLc = input.projectId.toLowerCase();
    const owner = state.bySlug.get(input.slug);
    if (owner && owner.id.toLowerCase() !== idLc) {
      return { status: "error", code: 409, message: "Esa URL ya está en uso." };
    }

    const canonical = state.byIdLc.get(idLc);
    // Ownership binding: once a project is registered, only its recorded author
    // may re-point it. Prevents a stranger who forged a colliding project event
    // from re-registering someone else's already-registered slug.
    if (
      canonical?.author &&
      canonical.author !== input.requesterPubkey
    ) {
      return {
        status: "error",
        code: 403,
        message: "Solo el autor registrado puede cambiar la URL de este proyecto.",
      };
    }

    // Cheap per-author brake: cap the number of DISTINCT projects one key may
    // register (slug changes to an already-registered project don't count).
    const myIds = new Set(
      currentEntries
        .filter((e) => e.author === input.requesterPubkey)
        .map((e) => e.id.toLowerCase()),
    );
    if (!myIds.has(idLc) && myIds.size >= MAX_SLUGS_PER_AUTHOR) {
      return {
        status: "error",
        code: 429,
        message: "Alcanzaste el máximo de URLs registradas.",
      };
    }

    const alreadyCanonical = canonical?.slug === input.slug;

    let entries = currentEntries;
    let changed = false;
    if (!alreadyCanonical) {
      const entry: ProjectRegistryEntry = {
        slug: input.slug,
        id: input.projectId,
        author: input.requesterPubkey,
        name: input.project.name.slice(0, MAX_ENTRY_NAME_CHARS),
        hackathon: input.project.hackathon ?? null,
        registeredAt: Math.floor(Date.now() / 1000),
      };
      const candidate = [...currentEntries, entry];
      if (candidate.length > PROJECT_REGISTRY_MAX_ENTRIES) {
        return { status: "error", code: 507, message: "El registro está lleno." };
      }
      const content = serializeProjectRegistry({
        version: PROJECT_REGISTRY_SCHEMA_VERSION,
        updatedAt: new Date().toISOString(),
        entries: candidate,
      });
      if (
        new TextEncoder().encode(content).length >
        PROJECT_REGISTRY_MAX_CONTENT_BYTES
      ) {
        return {
          status: "error",
          code: 507,
          message: "El registro alcanzó su límite de tamaño.",
        };
      }
      entries = candidate;
      changed = true;
    }
    // else: the project already has this exact slug as canonical — we still
    // re-sign the current entries and republish, which re-propagates the
    // registry (useful when the prior event thinly propagated).

    const signed = await buildAndSignRegistryEvent(
      entries,
      prevCreatedAt,
      Date.now(),
      secret,
    );

    // Belt-and-suspenders: publish server-side too (the client also
    // republishes). Respect the kill switch; a publish failure is non-fatal
    // because the client broadcasts the returned event.
    if (process.env.REGISTRY_PUBLISH_DISABLED !== "1") {
      const ok = await publishToRelays(signed, DEFAULT_RELAYS);
      if (!ok) {
        console.warn(
          "[projectRegistry] user slug claim: no relay accepted the event",
        );
      }
    }

    // Drop the registry cache so the resolver re-reads the new slug at once.
    // The registry is not Upstash-backed, so this is a Next-tier expiry only.
    await expireNostrTag(NOSTR_PROJECT_REGISTRY_TAG);
    // Refresh the edge redirect map so `/projects/<id>` 308s to the new slug.
    await writeRedirectMap(entries);

    return { status: "ok", event: signed, slug: input.slug, changed };
  } catch (error) {
    console.warn("[projectRegistry] user slug claim failed", error);
    return {
      status: "error",
      code: 500,
      message:
        error instanceof Error ? error.message : "No se pudo registrar la URL.",
    };
  } finally {
    await upstashReleaseLock(REGISTRY_WRITE_LOCK);
  }
}
