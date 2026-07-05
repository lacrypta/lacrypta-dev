"use client";

/**
 * Lightweight client-side entity cache for cross-page navigation.
 *
 * List pages (projects grid, hackathon lists, results) seed compact project
 * summaries and author profiles as they render; detail pages read them back
 * synchronously so a navigation paints real data (name, logo, description)
 * instantly while the server-rendered content streams in.
 *
 * This is a summary layer only — the deep caches remain
 * `labs:community-projects:v1` / `labs:user-projects-v2:<pubkey>` in
 * lib/userProjects.ts. Persisted to localStorage (LRU-capped) so the first
 * navigation after a reload is warm too.
 */

import { useSyncExternalStore } from "react";

export type ProjectEntity = {
  id: string;
  slug?: string;
  name: string;
  description?: string;
  logo?: string;
  cover?: string;
  status?: string;
  hackathon?: string | null;
  author?: string;
  tech?: string[];
  /** unix seconds of the freshest data backing this summary */
  updatedAt: number;
};

export type ProfileEntity = {
  pubkey: string;
  name?: string;
  picture?: string;
  updatedAt: number;
};

const STORAGE_KEY = "labs:entities:v1";
const MAX_PROJECTS = 300;
const MAX_PROFILES = 300;

type StoreShape = {
  projects: Record<string, ProjectEntity>;
  profiles: Record<string, ProfileEntity>;
};

const projects = new Map<string, ProjectEntity>();
const profiles = new Map<string, ProfileEntity>();
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function hydrateFromStorage() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as StoreShape;
    if (parsed && typeof parsed === "object") {
      for (const [k, v] of Object.entries(parsed.projects ?? {})) {
        if (v && typeof v.name === "string") projects.set(k, v);
      }
      for (const [k, v] of Object.entries(parsed.profiles ?? {})) {
        if (v) profiles.set(k, v);
      }
    }
  } catch {
    /* corrupt cache — start fresh */
  }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function persistSoon() {
  if (typeof window === "undefined") return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      const trim = <T extends { updatedAt: number }>(
        map: Map<string, T>,
        max: number,
      ) => {
        if (map.size <= max) return Object.fromEntries(map);
        const entries = [...map.entries()].sort(
          (a, b) => b[1].updatedAt - a[1].updatedAt,
        );
        return Object.fromEntries(entries.slice(0, max));
      };
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          projects: trim(projects, MAX_PROJECTS),
          profiles: trim(profiles, MAX_PROFILES),
        } satisfies StoreShape),
      );
    } catch {
      /* quota */
    }
  }, 400);
}

function projectKeys(p: Pick<ProjectEntity, "id" | "slug">): string[] {
  const keys = [p.id.toLowerCase()];
  if (p.slug) keys.push(p.slug.toLowerCase());
  return keys;
}

/** Seed/refresh project summaries. Stale entries never overwrite fresher ones. */
export function seedProjectEntities(
  items: Array<Partial<ProjectEntity> & { id: string; name: string }>,
) {
  hydrateFromStorage();
  let changed = false;
  for (const item of items) {
    const entity: ProjectEntity = {
      updatedAt: 0,
      ...item,
    };
    const keys = projectKeys(entity);
    // Freshness decided once across ALL keys — deciding per key could leave
    // the id- and slug-keyed copies of one project pointing at different
    // snapshots.
    const freshest = keys.reduce(
      (max, key) => Math.max(max, projects.get(key)?.updatedAt ?? -1),
      -1,
    );
    if (freshest > entity.updatedAt) continue;
    for (const key of keys) {
      const prev = projects.get(key);
      // Keep a known slug when the incoming copy lacks one.
      projects.set(key, {
        ...prev,
        ...entity,
        slug: entity.slug ?? prev?.slug,
      });
      changed = true;
    }
  }
  if (changed) {
    emit();
    persistSoon();
  }
}

export function seedProfileEntities(
  items: Array<Partial<ProfileEntity> & { pubkey: string }>,
) {
  hydrateFromStorage();
  let changed = false;
  const now = Math.floor(Date.now() / 1000);
  for (const item of items) {
    const prev = profiles.get(item.pubkey);
    // Freshen updatedAt on every seed — it drives the LRU trim ordering.
    profiles.set(item.pubkey, {
      ...prev,
      updatedAt: now,
      ...item,
    });
    changed = true;
  }
  if (changed) {
    emit();
    persistSoon();
  }
}

export function getProjectEntity(key: string): ProjectEntity | null {
  hydrateFromStorage();
  return projects.get(key.toLowerCase()) ?? null;
}

export function getProfileEntity(pubkey: string): ProfileEntity | null {
  hydrateFromStorage();
  return profiles.get(pubkey) ?? null;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * React to a project summary by slug or id. Server snapshot is always null —
 * the store only exists in the browser, so SSR/hydration render the neutral
 * skeleton and the summary appears right after hydration.
 */
export function useProjectEntity(key: string | null): ProjectEntity | null {
  return useSyncExternalStore(
    subscribe,
    () => (key ? getProjectEntity(key) : null),
    () => null,
  );
}
