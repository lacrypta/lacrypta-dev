/**
 * Canonical site origin for SEO surfaces (metadata, sitemap, robots,
 * JSON-LD, OG URLs). Production deploys leave NEXT_PUBLIC_SITE_URL unset and
 * get the real domain; previews/dev can override it so canonicals and
 * structured data point at themselves instead of production.
 */

const DEFAULT_SITE_URL = "https://lacrypta.dev";

function normalizeSiteUrl(raw: string | undefined): string {
  const trimmed = raw?.trim().replace(/\/+$/, "");
  if (!trimmed) return DEFAULT_SITE_URL;
  // Tolerate scheme-less values ("lacrypta.dev") — this constant feeds
  // `new URL()` in metadataBase, which throws on invalid absolute URLs.
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withScheme).origin;
  } catch {
    return DEFAULT_SITE_URL;
  }
}

export const SITE_URL = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);

export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}
