import type { Metadata } from "next";
import { Suspense } from "react";
import { permanentRedirect } from "next/navigation";
import {
  getCanonicalProjectRefs,
  resolveProjectParam,
} from "@/lib/projectResolver";
import UnifiedProjectView from "./UnifiedProjectView";
import UserProjectsPage from "./UserProjectsPage";
import NostrProjectPageClient from "./NostrProjectPageClient";
import ProjectFallback from "./ProjectFallback";

/**
 * Canonical project page: `/projects/<slug>`.
 *
 * The single segment is a namespace resolved in this order:
 *  1. a project (registry slug, curated id, Nostr id/event-id/name alias —
 *     aliases 308 to the canonical slug),
 *  2. a Nostr pubkey / npub → that user's project listing (noindex),
 *  3. anything else → live relay scan (noindex; keeps just-published
 *     projects reachable before the server snapshot catches up).
 *
 * All data comes from cached round-trips (snapshot + registry), so known
 * params prerender and navigations are served from cache with background
 * revalidation (see the `nostr` cacheLife profile).
 */

export async function generateStaticParams() {
  try {
    const refs = await getCanonicalProjectRefs();
    return refs.map((r) => ({ slug: r.slug }));
  } catch {
    return [];
  }
}

function truncate(s: string, max = 155): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const resolved = await resolveProjectParam(slug);

  if (resolved.kind === "pubkey") {
    return {
      title: "Proyectos del usuario",
      robots: { index: false, follow: false },
    };
  }
  if (resolved.kind === "unknown") {
    // Unresolved params render a live-scan page — keep crawlers away from
    // what would otherwise be an indexable soft-404.
    return { title: "Proyecto", robots: { index: false, follow: false } };
  }

  const project = resolved.curated ?? resolved.home ?? resolved.nostr;
  if (!project) {
    // Registered but no live data (e.g. archived event): the body is only a
    // client-side scan — don't let crawlers index a soft-404.
    return {
      title: resolved.registryEntry?.name ?? "Proyecto",
      robots: { index: false, follow: false },
    };
  }
  const name = project.name;

  const hackathon = resolved.hackathon;
  const url = `/projects/${resolved.canonicalSlug}`;
  const title = hackathon ? `${name} · ${hackathon.name}` : `${name} · Proyecto`;
  const desc = truncate(
    project.description ||
      (hackathon
        ? `Proyecto presentado en ${hackathon.name}.`
        : "Proyecto de la comunidad La Crypta."),
  );

  return {
    title,
    description: desc,
    alternates: { canonical: url },
    openGraph: {
      title,
      description: desc,
      url,
      type: "article",
    },
    twitter: {
      title,
      description: desc,
    },
  };
}

export default function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <Suspense fallback={<ProjectFallback />}>
      <PageContent params={params} />
    </Suspense>
  );
}

async function PageContent({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const resolved = await resolveProjectParam(slug);

  if (resolved.kind === "pubkey") {
    return <UserProjectsPage pubkey={resolved.pubkey} />;
  }
  if (resolved.kind === "unknown") {
    return <NostrProjectPageClient projectId={resolved.param} />;
  }
  if (resolved.redirectTo) {
    permanentRedirect(resolved.redirectTo);
  }
  return <UnifiedProjectView resolved={resolved} />;
}
