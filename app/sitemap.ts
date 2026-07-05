import type { MetadataRoute } from "next";
import { HACKATHONS, hackathonSlug, hackathonStatus } from "@/lib/hackathons";
import { getCanonicalProjectRefs } from "@/lib/projectResolver";
import { SITE_URL } from "@/lib/siteUrl";

const BASE_URL = SITE_URL;

export async function generateSitemaps() {
  return [{ id: "static" }, { id: "nostr" }];
}

export default async function sitemap(props: {
  id: Promise<string>;
}): Promise<MetadataRoute.Sitemap> {
  const id = await props.id;

  if (id === "static") return staticSitemap();
  if (id === "nostr") return nostrSitemap();
  return [];
}

async function staticSitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [
    {
      url: `${BASE_URL}/`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/hackathons`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/projects`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/skills`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/soldados`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/infra`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
  ];

  for (const h of HACKATHONS) {
    const lastDate = h.dates[h.dates.length - 1]?.date;
    const status = hackathonStatus(h, now);
    entries.push({
      url: `${BASE_URL}/hackathons/${hackathonSlug(h)}`,
      lastModified: lastDate ? new Date(lastDate) : now,
      changeFrequency: status === "closed" ? "yearly" : "weekly",
      priority: 0.8,
    });
  }

  // Curated projects at their canonical /projects/<slug> URLs. Legacy
  // /hackathons/<slug>/<id> project URLs 308 here and are no longer listed.
  try {
    for (const ref of await getCanonicalProjectRefs()) {
      if (ref.source !== "curated") continue;
      entries.push({
        url: `${BASE_URL}/projects/${encodeURIComponent(ref.slug)}`,
        lastModified: ref.lastModified,
        changeFrequency: "monthly",
        priority: 0.7,
      });
    }
  } catch {
    /* curated data is in-tree; refs only fail if the registry read throws */
  }

  return entries;
}

async function nostrSitemap(): Promise<MetadataRoute.Sitemap> {
  try {
    const refs = await getCanonicalProjectRefs();
    return refs
      .filter((ref) => ref.source === "nostr")
      .map((ref) => ({
        url: `${BASE_URL}/projects/${encodeURIComponent(ref.slug)}`,
        lastModified: ref.lastModified,
        changeFrequency: "daily" as const,
        priority: 0.6,
      }));
  } catch {
    return [];
  }
}
