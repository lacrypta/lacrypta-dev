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
  },
};

export default nextConfig;
