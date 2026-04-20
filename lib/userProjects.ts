"use client";

import type { SignedEvent, UnsignedEvent, UserSigner } from "./nostrSigner";

/** NIP-78 parameterized replaceable event kind */
export const PROJECT_KIND = 30078;
/** Indexable hashtag every Labs project event carries */
export const PROJECT_TAG = "lacrypta-labs-project";
/** `d` tag prefix; the suffix is the project's stable local id */
export const PROJECT_D_PREFIX = "lacrypta.labs:project:";

export type UserProject = {
  id: string;
  name: string;
  description?: string;
  url?: string;
  repo?: string;
  tags?: string[];
  createdAt: number;
  updatedAt: number;
};

export type ProjectsDoc = {
  projects: UserProject[];
};

export type CommunityProject = UserProject & {
  /** author pubkey (hex) */
  author: string;
  /** id of the event the project was fetched from */
  eventId: string;
  eventCreatedAt: number;
};

export type RelayScanState =
  | "pending"
  | "connecting"
  | "receiving"
  | "done"
  | "error";

export type RelayScanStatus = {
  relay: string;
  state: RelayScanState;
  events: number;
  error?: string;
};

export type CommunityScanProgress = {
  totalRelays: number;
  completedRelays: number;
  relays: RelayScanStatus[];
  projectsSoFar: number;
};

const USER_CACHE_PREFIX = "labs:user-projects-v2:";
const COMMUNITY_CACHE_KEY = "labs:community-projects:v1";

export const DEFAULT_USER_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.primal.net",
  "wss://relay.nostr.band",
  "wss://nos.lol",
];

/** Top 10 public relays used to index community projects. */
export const TOP10_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.primal.net",
  "wss://relay.nostr.band",
  "wss://nos.lol",
  "wss://relay.snort.social",
  "wss://nostr.wine",
  "wss://nostr-pub.wellorder.net",
  "wss://purplepag.es",
  "wss://offchain.pub",
  "wss://relay.nsec.app",
];

/* ─────────────────────────── cache (localStorage) ──────────────────────── */

export function getCachedUserProjects(pubkey: string): ProjectsDoc | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(USER_CACHE_PREFIX + pubkey);
    if (!raw) return null;
    return JSON.parse(raw) as ProjectsDoc;
  } catch {
    return null;
  }
}

export function setCachedUserProjects(pubkey: string, doc: ProjectsDoc) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      USER_CACHE_PREFIX + pubkey,
      JSON.stringify(doc),
    );
  } catch {
    /* quota */
  }
}

export function getCachedCommunityProjects(): CommunityProject[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(COMMUNITY_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CommunityProject[];
  } catch {
    return null;
  }
}

function setCachedCommunityProjects(projects: CommunityProject[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COMMUNITY_CACHE_KEY, JSON.stringify(projects));
  } catch {
    /* quota */
  }
}

/* ────────────────────────────── parsers ────────────────────────────────── */

type IncomingEvent = {
  id: string;
  pubkey: string;
  content: string;
  tags: string[][];
  created_at: number;
};

function projectDTag(id: string): string {
  return `${PROJECT_D_PREFIX}${id}`;
}

function eventDTag(event: IncomingEvent): string | null {
  return event.tags.find((t) => t[0] === "d")?.[1] ?? null;
}

function eventIsOurProject(event: IncomingEvent): boolean {
  const d = eventDTag(event);
  if (!d) return false;
  if (!d.startsWith(PROJECT_D_PREFIX)) return false;
  const hasTag = event.tags.some(
    (t) => t[0] === "t" && t[1] === PROJECT_TAG,
  );
  return hasTag;
}

function parseProjectContent(
  event: IncomingEvent,
): UserProject | null {
  if (!event.content) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(event.content) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
  if (!name) return null;

  const d = eventDTag(event);
  const id =
    typeof parsed.id === "string" && parsed.id.length > 0
      ? parsed.id
      : d?.startsWith(PROJECT_D_PREFIX)
        ? d.slice(PROJECT_D_PREFIX.length)
        : event.id;

  const asString = (v: unknown) =>
    typeof v === "string" && v.trim() ? v : undefined;
  const asStringArray = (v: unknown) =>
    Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : undefined;

  return {
    id: String(id),
    name,
    description: asString(parsed.description),
    url: asString(parsed.url),
    repo: asString(parsed.repo),
    tags: asStringArray(parsed.tags),
    createdAt: Number(parsed.createdAt ?? event.created_at),
    updatedAt: Number(parsed.updatedAt ?? event.created_at),
  };
}

/** Keeps only the freshest event per (pubkey, d-tag). */
function dedupeLatestByD(events: IncomingEvent[]): IncomingEvent[] {
  const map = new Map<string, IncomingEvent>();
  for (const ev of events) {
    if (!eventIsOurProject(ev)) continue;
    const d = eventDTag(ev)!;
    const key = `${ev.pubkey}|${d}`;
    const prev = map.get(key);
    if (!prev || ev.created_at > prev.created_at) {
      map.set(key, ev);
    }
  }
  return [...map.values()];
}

/* ─────────────────────────── user projects fetch ───────────────────────── */

export async function fetchUserProjects(
  pubkey: string,
  relays: string[] = DEFAULT_USER_RELAYS,
  timeoutMs = 5000,
): Promise<ProjectsDoc> {
  const cached = getCachedUserProjects(pubkey);

  const { SimplePool } = await import("nostr-tools/pool");
  const pool = new SimplePool();
  const events: IncomingEvent[] = [];

  const closer = pool.subscribe(
    relays,
    { kinds: [PROJECT_KIND], authors: [pubkey], "#t": [PROJECT_TAG] },
    {
      onevent(ev: IncomingEvent) {
        events.push(ev);
      },
      oneose() {
        closer.close();
      },
    },
  );

  await new Promise((r) => setTimeout(r, timeoutMs));
  closer.close();
  try {
    pool.close(relays);
  } catch {
    /* noop */
  }

  if (events.length === 0) return cached ?? { projects: [] };

  const deduped = dedupeLatestByD(events);
  const projects = deduped
    .map(parseProjectContent)
    .filter((p): p is UserProject => p !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const doc: ProjectsDoc = { projects };
  setCachedUserProjects(pubkey, doc);
  return doc;
}

/* ────────────────────────────── publish/delete ─────────────────────────── */

export type PublishProjectResult = {
  signed: SignedEvent;
  relays: { relay: string; ok: boolean; error?: string }[];
};

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout: ${label} (${ms}ms)`)), ms),
    ),
  ]);
}

function buildProjectEvent(
  project: UserProject,
  signerPubkey: string,
): UnsignedEvent {
  const tagList = project.tags ?? [];
  return {
    kind: PROJECT_KIND,
    pubkey: signerPubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["d", projectDTag(project.id)],
      ["t", PROJECT_TAG],
      ...tagList.map((t) => ["t", t] as string[]),
      ["client", "La Crypta Labs"],
      ...(project.name ? [["name", project.name]] : []),
      ...(project.repo ? [["r", project.repo]] : []),
      ...(project.url ? [["r", project.url]] : []),
    ],
    content: JSON.stringify({
      id: project.id,
      name: project.name,
      description: project.description,
      url: project.url,
      repo: project.repo,
      tags: project.tags,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    }),
  };
}

function buildTombstoneEvent(
  projectId: string,
  signerPubkey: string,
): UnsignedEvent {
  // Replaces the project event with an empty payload, effectively a delete.
  return {
    kind: PROJECT_KIND,
    pubkey: signerPubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["d", projectDTag(projectId)],
      // No `t:lacrypta-labs-project` so it stops showing up in community scans.
      ["client", "La Crypta Labs"],
      ["deleted", "true"],
    ],
    content: "",
  };
}

async function publishSignedEvent(
  signed: SignedEvent,
  relays: string[],
  perRelayTimeoutMs = 8000,
): Promise<PublishProjectResult["relays"]> {
  const { SimplePool } = await import("nostr-tools/pool");
  const pool = new SimplePool();
  const promises = pool.publish(relays, signed);
  const results = await Promise.all(
    promises.map(async (p, i) => {
      const relay = relays[i];
      try {
        await withTimeout(p, perRelayTimeoutMs, relay);
        return { relay, ok: true };
      } catch (e) {
        return {
          relay,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }),
  );
  try {
    pool.close(relays);
  } catch {
    /* noop */
  }
  return results;
}

export async function publishUserProject(
  signer: UserSigner,
  project: UserProject,
  relays: string[] = DEFAULT_USER_RELAYS,
  opts?: {
    signTimeoutMs?: number;
    publishTimeoutMs?: number;
  },
): Promise<PublishProjectResult> {
  const { signTimeoutMs = 30_000, publishTimeoutMs = 8_000 } = opts ?? {};
  const unsigned = buildProjectEvent(project, signer.pubkey);
  console.log("[labs] signing project event", { d: projectDTag(project.id) });
  const signed = await withTimeout(
    signer.signEvent(unsigned),
    signTimeoutMs,
    "esperando firma",
  );
  if (signed.pubkey !== signer.pubkey) {
    throw new Error(
      `El firmante devolvió otra pubkey (esperada ${signer.pubkey.slice(0, 10)}…, recibida ${signed.pubkey.slice(0, 10)}…).`,
    );
  }
  const relayResults = await publishSignedEvent(
    signed,
    relays,
    publishTimeoutMs,
  );
  const ok = relayResults.some((r) => r.ok);
  if (!ok) {
    const err = new Error(
      `Ningún relay aceptó el evento.\n${relayResults
        .map((r) => `${r.relay}: ${r.error ?? "sin respuesta"}`)
        .join("\n")}`,
    );
    (err as Error & { relayResults: typeof relayResults }).relayResults =
      relayResults;
    throw err;
  }
  return { signed, relays: relayResults };
}

export async function deleteUserProject(
  signer: UserSigner,
  projectId: string,
  relays: string[] = DEFAULT_USER_RELAYS,
  opts?: { signTimeoutMs?: number; publishTimeoutMs?: number },
): Promise<PublishProjectResult> {
  const { signTimeoutMs = 30_000, publishTimeoutMs = 8_000 } = opts ?? {};
  const unsigned = buildTombstoneEvent(projectId, signer.pubkey);
  const signed = await withTimeout(
    signer.signEvent(unsigned),
    signTimeoutMs,
    "esperando firma",
  );
  const relayResults = await publishSignedEvent(
    signed,
    relays,
    publishTimeoutMs,
  );
  const ok = relayResults.some((r) => r.ok);
  if (!ok) {
    const err = new Error(
      `Ningún relay aceptó la eliminación.\n${relayResults
        .map((r) => `${r.relay}: ${r.error ?? "sin respuesta"}`)
        .join("\n")}`,
    );
    (err as Error & { relayResults: typeof relayResults }).relayResults =
      relayResults;
    throw err;
  }
  return { signed, relays: relayResults };
}

/* ───────────────────────────── community scan ──────────────────────────── */

export async function fetchCommunityProjects(
  relays: string[] = TOP10_RELAYS,
  opts?: {
    perRelayTimeoutMs?: number;
    onProgress?: (p: CommunityScanProgress) => void;
    signal?: AbortSignal;
  },
): Promise<CommunityProject[]> {
  const { perRelayTimeoutMs = 6000, onProgress, signal } = opts ?? {};

  const { SimplePool } = await import("nostr-tools/pool");

  const relayStates: RelayScanStatus[] = relays.map((relay) => ({
    relay,
    state: "pending",
    events: 0,
  }));

  // dedupe map across all relays
  const events = new Map<string, IncomingEvent>();

  const emit = () => {
    const completed = relayStates.filter(
      (r) => r.state === "done" || r.state === "error",
    ).length;
    onProgress?.({
      totalRelays: relays.length,
      completedRelays: completed,
      relays: [...relayStates],
      projectsSoFar: events.size,
    });
  };

  emit();

  await Promise.all(
    relays.map(async (relay, i) => {
      if (signal?.aborted) return;
      const state = relayStates[i];
      state.state = "connecting";
      emit();
      const pool = new SimplePool();
      try {
        const closer = pool.subscribe(
          [relay],
          { kinds: [PROJECT_KIND], "#t": [PROJECT_TAG] },
          {
            onevent(ev: IncomingEvent) {
              if (state.state === "connecting") {
                state.state = "receiving";
              }
              state.events += 1;
              const d = eventDTag(ev);
              if (!d) return;
              const key = `${ev.pubkey}|${d}`;
              const prev = events.get(key);
              if (!prev || ev.created_at > prev.created_at) {
                events.set(key, ev);
              }
              emit();
            },
            oneose() {
              /* handled by timeout */
            },
          },
        );
        await new Promise((resolve) => {
          const t = setTimeout(() => {
            resolve(null);
          }, perRelayTimeoutMs);
          signal?.addEventListener("abort", () => {
            clearTimeout(t);
            resolve(null);
          });
        });
        closer.close();
        state.state = "done";
      } catch (e) {
        state.state = "error";
        state.error = e instanceof Error ? e.message : String(e);
      } finally {
        try {
          pool.close([relay]);
        } catch {
          /* noop */
        }
        emit();
      }
    }),
  );

  const all = [...events.values()];
  const projects: CommunityProject[] = all
    .map((ev) => {
      const base = parseProjectContent(ev);
      if (!base) return null;
      const project: CommunityProject = {
        ...base,
        author: ev.pubkey,
        eventId: ev.id,
        eventCreatedAt: ev.created_at,
      };
      return project;
    })
    .filter((p): p is CommunityProject => p !== null)
    .sort((a, b) => b.eventCreatedAt - a.eventCreatedAt);

  setCachedCommunityProjects(projects);
  return projects;
}
