import { NextRequest, NextResponse } from "next/server";
import { resolveProjectRedirect } from "@/lib/projectRedirectMap";

/**
 * Canonicalize single-segment `/projects/<id-or-old-slug>` URLs with a REAL
 * 308 emitted before the full-route cache. (Next 16 "proxy" = the former
 * "middleware" file convention.)
 *
 * A registered project's canonical URL is `/projects/<slug>`; its legacy
 * `/projects/<uuid>` (and any old slug) must redirect there. Doing that in the
 * page (`permanentRedirect` under cacheComponents/PPR) can't overwrite a
 * previously-cached 200, so those URLs get pinned to a stale soft-404. The proxy
 * runs ahead of the cache and uses only the small Upstash redirect map (never
 * the relay/snapshot scans), so the redirect is deterministic and can't be
 * pinned. Unmapped params (canonical slugs, unknown ids, or when Upstash is
 * unconfigured) fall through to the page unchanged.
 */
export const config = {
  matcher: ["/projects/:param"],
};

export async function proxy(req: NextRequest): Promise<NextResponse> {
  // Single segment only: `/projects/<x>` — never `/projects/<x>/<y>` (legacy
  // two-segment redirects are their own route handlers) nor `/projects`.
  const match = req.nextUrl.pathname.match(/^\/projects\/([^/]+)$/);
  if (!match) return NextResponse.next();

  let param = match[1];
  try {
    param = decodeURIComponent(param);
  } catch {
    /* keep raw on malformed escapes */
  }

  const target = await resolveProjectRedirect(param);
  if (target) {
    const url = req.nextUrl.clone();
    url.pathname = `/projects/${target}`;
    return NextResponse.redirect(url, 308);
  }
  return NextResponse.next();
}
