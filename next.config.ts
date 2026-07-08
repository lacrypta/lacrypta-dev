import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
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
