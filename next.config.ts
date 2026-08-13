import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.primal.net" },
      { protocol: "https", hostname: "primal.b-cdn.net" },
      { protocol: "https", hostname: "nostr.build" },
      { protocol: "https", hostname: "**.nostr.build" },
      { protocol: "https", hostname: "**.nostur.com" },
      { protocol: "https", hostname: "**.nostr.band" },
      { protocol: "https", hostname: "void.cat" },
      { protocol: "https", hostname: "pbs.twimg.com" },
      { protocol: "https", hostname: "**.iris.to" },
      { protocol: "https", hostname: "**.nostr.wine" },
      { protocol: "https", hostname: "**.sovbit.host" },
      { protocol: "https", hostname: "**.satellite.earth" },
      { protocol: "https", hostname: "**.nostrcheck.me" },
      { protocol: "https", hostname: "**.blossom.band" },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
  cacheComponents: true,
  cacheLife: {
    // Stale-while-revalidate profile for Nostr-backed data: every request is
    // served from cache instantly, and any request arriving more than 5
    // minutes after the last regeneration triggers a background refresh
    // ("revalidate on user load"). A poisoned/empty snapshot heals in
    // minutes instead of the 24h the "days" profile allowed.
    nostr: {
      stale: 300,
      revalidate: 300,
      expire: 60 * 60 * 24 * 7,
    },
    // Short SWR profile for targeted single-project relay lookups
    // (getNostrProjectByIdDirect). A hit is stable, but a transient not-found
    // must heal fast — pinning null for the 5-minute `nostr` window would
    // re-strand the thinly-propagated project the lookup exists to rescue.
    nostrLookup: {
      stale: 30,
      revalidate: 30,
      expire: 300,
    },
  },
};

export default nextConfig;
