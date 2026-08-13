import { SITE_URL } from "@/lib/siteUrl";

/** Index for the split sitemaps (`app/sitemap.ts` `generateSitemaps`).
 *  Next only serves `/sitemap/static.xml` and `/sitemap/nostr.xml` from that
 *  file — this route is the `/sitemap.xml` entry crawlers actually fetch. */
export function GET() {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${SITE_URL}/sitemap/static.xml</loc>
  </sitemap>
  <sitemap>
    <loc>${SITE_URL}/sitemap/nostr.xml</loc>
  </sitemap>
</sitemapindex>
`;
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
