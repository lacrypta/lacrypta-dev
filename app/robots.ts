import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/siteUrl";

const BASE_URL = SITE_URL;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/dashboard",
          "/api",
          "/dev",
          "/login",
          "/onboarding",
          "/notifications",
          "/database",
        ],
      },
    ],
    // The two split sitemaps are listed directly: `app/sitemap.ts` already
    // owns /sitemap.xml via the metadata convention, so a hand-rolled index
    // route there is a build-time conflict (and robots.txt takes a list).
    sitemap: [
      `${BASE_URL}/sitemap/static.xml`,
      `${BASE_URL}/sitemap/nostr.xml`,
    ],
    host: BASE_URL,
  };
}
