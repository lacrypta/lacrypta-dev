"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fetchUserProjects,
  getCachedUserProjects,
  type UserProject,
} from "@/lib/userProjects";
import { HACKATHONS } from "@/lib/hackathons";

const HACKATHON_NAME = new Map(HACKATHONS.map((h) => [h.id, h.name]));

/** Display name for a hackathon id, falling back to the id itself. */
export function hackathonName(id: string): string {
  return HACKATHON_NAME.get(id) ?? id;
}

export type HackathonGroup = { hackathonId: string; projects: UserProject[] };

/**
 * Loads a user's Nostr projects and groups the hackathon ones by hackathon.
 * Hydrates from the local cache first (instant paint), then refreshes from
 * relays in the background. Shared by the logged-in home dashboard and
 * `/dashboard/hackathones` so both derive participations identically.
 *
 * `readPubkey` is the pubkey to read for — the impersonated user in dev, the
 * logged-in user otherwise (the caller resolves that from `useAuth`).
 */
export function useUserHackathons(readPubkey: string | null | undefined): {
  projects: UserProject[];
  groups: HackathonGroup[];
  loading: boolean;
} {
  const [projects, setProjects] = useState<UserProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!readPubkey) {
      setProjects([]);
      setLoading(false);
      return;
    }
    const cached = getCachedUserProjects(readPubkey);
    if (cached) {
      setProjects(cached.projects);
      setLoading(false);
    } else {
      setProjects([]);
      setLoading(true);
    }
    let cancelled = false;
    fetchUserProjects(readPubkey)
      .then((doc) => {
        if (!cancelled) setProjects(doc.projects);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [readPubkey]);

  const groups = useMemo<HackathonGroup[]>(() => {
    const byHackathon = new Map<string, UserProject[]>();
    for (const p of projects) {
      if (!p.hackathon) continue;
      const list = byHackathon.get(p.hackathon) ?? [];
      list.push(p);
      byHackathon.set(p.hackathon, list);
    }
    return [...byHackathon.entries()]
      .map(([hackathonId, ps]) => ({ hackathonId, projects: ps }))
      .sort((a, b) =>
        hackathonName(a.hackathonId).localeCompare(hackathonName(b.hackathonId)),
      );
  }, [projects]);

  return { projects, groups, loading };
}
