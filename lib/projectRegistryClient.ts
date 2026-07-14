"use client";

/**
 * Client helpers for the user-initiated project-slug registry. Mirrors the
 * badge bootstrap flow (`lib/hackathonBadgeClient.ts`): the user signs a
 * kind-27235 NIP-98 authorization event, the backend verifies ownership +
 * La-Crypta-signs the updated registry event, and the client republishes the
 * returned event to the relays with `publishSignedEventsToRelays`.
 */

import type { SignedEvent } from "./nostrSigner";
import { projectSlugHref } from "./projectLinks";

type SlugRequestSigner = {
  pubkey: string;
  signEvent: (event: {
    kind: number;
    created_at: number;
    tags: string[][];
    content: string;
    pubkey?: string;
  }) => Promise<SignedEvent>;
};

export type SlugAvailability = {
  available: boolean;
  slug: string;
  reason?: string;
};

/** Check whether `slug` is free (or already owned by `projectId`). */
export async function checkSlugAvailability(
  slug: string,
  projectId?: string,
  signal?: AbortSignal,
): Promise<SlugAvailability> {
  const params = new URLSearchParams({ slug });
  if (projectId) params.set("projectId", projectId);
  const res = await fetch(`/api/projects/registry?${params.toString()}`, {
    cache: "no-store",
    signal,
  });
  if (!res.ok) {
    return { available: false, slug, reason: "No se pudo verificar la URL." };
  }
  return (await res.json()) as SlugAvailability;
}

export type SlugClaimResult = {
  event: SignedEvent;
  slug: string;
  changed: boolean;
  canonicalUrl: string;
};

/**
 * Request registration of `slug` for `projectId`. Signs the authorization event
 * with the user's signer, posts it, and returns the La-Crypta-signed registry
 * event for the caller to republish.
 */
export async function requestProjectSlug(
  signer: SlugRequestSigner,
  { projectId, slug }: { projectId: string; slug: string },
): Promise<SlugClaimResult> {
  const request = await signer.signEvent({
    kind: 27235,
    pubkey: signer.pubkey,
    created_at: Math.floor(Date.now() / 1000),
    content: `Registrar URL ${slug} para el proyecto ${projectId}`,
    tags: [
      ["u", "/api/projects/registry"],
      ["method", "POST"],
      ["action", "register-project-slug"],
      ["project", projectId],
      ["slug", slug],
    ],
  });

  const res = await fetch("/api/projects/registry", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ request }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    event?: SignedEvent;
    slug?: string;
    changed?: boolean;
    canonicalUrl?: string;
    error?: string;
  };
  if (!res.ok || !data.event || !data.slug) {
    throw new Error(data.error || "No se pudo registrar la URL.");
  }
  return {
    event: data.event,
    slug: data.slug,
    changed: data.changed ?? false,
    canonicalUrl: data.canonicalUrl ?? projectSlugHref(data.slug),
  };
}
