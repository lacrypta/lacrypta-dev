/**
 * Canonical site origin for SEO surfaces (metadata, sitemap, robots,
 * JSON-LD, OG URLs). Production deploys leave NEXT_PUBLIC_SITE_URL unset and
 * get the real domain; previews/dev can override it so canonicals and
 * structured data point at themselves instead of production.
 */

const RAW = process.env.NEXT_PUBLIC_SITE_URL;

export const SITE_URL = (RAW && RAW.replace(/\/+$/, "")) || "https://lacrypta.dev";

export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}
