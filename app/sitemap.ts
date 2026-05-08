import type { MetadataRoute } from "next";
import {
  HACKATHONS,
  getHackathonProjects,
  hackathonStatus,
} from "@/lib/hackathons";
import { getAllNostrSubmissionsForSitemap } from "@/lib/nostrCache";

const BASE_URL = "https://lacrypta.dev";

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

function staticSitemap(): MetadataRoute.Sitemap {
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
      url: `${BASE_URL}/soldados`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/infrastructure`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
  ];

  for (const h of HACKATHONS) {
    const lastDate = h.dates[h.dates.length - 1]?.date;
    const status = hackathonStatus(h, now);
    entries.push({
      url: `${BASE_URL}/hackathons/${h.id}`,
      lastModified: lastDate ? new Date(lastDate) : now,
      changeFrequency: status === "closed" ? "yearly" : "weekly",
      priority: 0.8,
    });
    for (const project of getHackathonProjects(h.id)) {
      const projectMod =
        project.submittedAt ? new Date(project.submittedAt) : lastDate ? new Date(lastDate) : now;
      entries.push({
        url: `${BASE_URL}/hackathons/${h.id}/${project.id}`,
        lastModified: projectMod,
        changeFrequency: "monthly",
        priority: 0.7,
      });
    }
  }

  return entries;
}

async function nostrSitemap(): Promise<MetadataRoute.Sitemap> {
  let submissions: Awaited<ReturnType<typeof getAllNostrSubmissionsForSitemap>> = [];
  try {
    submissions = await getAllNostrSubmissionsForSitemap();
  } catch {
    return [];
  }

  const curatedKeys = new Set<string>();
  for (const h of HACKATHONS) {
    for (const p of getHackathonProjects(h.id)) {
      curatedKeys.add(`${h.id}/${p.id}`);
    }
  }

  const entries: MetadataRoute.Sitemap = [];
  for (const s of submissions) {
    if (!s.hackathon) continue;
    const key = `${s.hackathon}/${s.id}`;
    if (curatedKeys.has(key)) continue;
    entries.push({
      url: `${BASE_URL}/hackathons/${s.hackathon}/${s.id}`,
      lastModified: new Date(s.eventCreatedAt * 1000),
      changeFrequency: "daily",
      priority: 0.6,
    });
  }

  return entries;
}
