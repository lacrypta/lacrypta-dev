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
    sitemap: [
      `${BASE_URL}/sitemap.xml`,
      `${BASE_URL}/sitemap/static.xml`,
      `${BASE_URL}/sitemap/nostr.xml`,
    ],
    host: BASE_URL,
  };
}
