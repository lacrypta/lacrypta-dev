/**
 * Server-only realtime status probes for the infrastructure page.
 *
 * Each service is checked against its live endpoint so the page shows real
 * connectivity / version data instead of hardcoded strings:
 *  - Nostr relay: NIP-11 document (software + version + NIPs) plus a live
 *    WebSocket handshake to confirm the relay actually accepts connections.
 *  - Blossom: HTTP reachability check.
 *  - LaWallet: version pulled from its public /api/version endpoint.
 *
 * Cached briefly so a single page render shares one set of upstream probes.
 */

import { cacheLife, cacheTag } from "next/cache";

export const INFRA_STATUS_CACHE_TAG = "infra:status";

export const NOSTR_RELAY_URL = "wss://relay.lacrypta.ar";
export const BLOSSOM_URL = "https://blossom.lacrypta.ar";
export const LAWALLET_URL = "https://beta.lawallet.io";

export type NostrRelayStatus = {
  online: boolean;
  name: string | null;
  software: string | null;
  version: string | null;
  supportedNips: number[];
  latencyMs: number | null;
};

export type ServicePing = {
  online: boolean;
  latencyMs: number | null;
};

export type LaWalletStatus = {
  online: boolean;
  version: string | null;
};

export type InfraStatus = {
  nostr: NostrRelayStatus;
  blossom: ServicePing;
  lawallet: LaWalletStatus;
};

function shortSoftware(software: string | null): string | null {
  if (!software) return null;
  // e.g. "git+https://github.com/hoytech/strfry.git" -> "strfry"
  const match = software.match(/([^/]+?)(?:\.git)?$/);
  return match ? match[1] : software;
}

/** Open a WebSocket and resolve once the relay accepts (or times out). */
function checkRelaySocket(
  url: string,
  timeoutMs = 4000,
): Promise<{ connected: boolean; latencyMs: number | null }> {
  return new Promise((resolve) => {
    const start = Date.now();
    let settled = false;
    let socket: WebSocket | null = null;

    const finish = (connected: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket?.close();
      } catch {
        /* noop */
      }
      resolve({
        connected,
        latencyMs: connected ? Date.now() - start : null,
      });
    };

    const timer = setTimeout(() => finish(false), timeoutMs);

    try {
      socket = new WebSocket(url);
      socket.onopen = () => finish(true);
      socket.onerror = () => finish(false);
    } catch {
      finish(false);
    }
  });
}

async function fetchRelayNip11(url: string): Promise<{
  name: string | null;
  software: string | null;
  version: string | null;
  supportedNips: number[];
} | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/nostr+json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const d = (await res.json()) as Record<string, unknown>;
    const str = (v: unknown) =>
      typeof v === "string" && v.trim() ? v.trim() : null;
    return {
      name: str(d.name),
      software: shortSoftware(str(d.software)),
      version: str(d.version),
      supportedNips: Array.isArray(d.supported_nips)
        ? d.supported_nips
            .map((n) => Number(n))
            .filter((n) => Number.isFinite(n))
        : [],
    };
  } catch {
    return null;
  }
}

async function getNostrRelayStatus(): Promise<NostrRelayStatus> {
  const httpUrl = NOSTR_RELAY_URL.replace(/^wss:/, "https:").replace(
    /^ws:/,
    "http:",
  );
  const [nip11, socket] = await Promise.all([
    fetchRelayNip11(httpUrl),
    checkRelaySocket(NOSTR_RELAY_URL),
  ]);

  return {
    online: socket.connected,
    name: nip11?.name ?? null,
    software: nip11?.software ?? null,
    version: nip11?.version ?? null,
    supportedNips: nip11?.supportedNips ?? [],
    latencyMs: socket.latencyMs,
  };
}

async function pingHttp(url: string): Promise<ServicePing> {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    return { online: res.ok, latencyMs: res.ok ? Date.now() - start : null };
  } catch {
    return { online: false, latencyMs: null };
  }
}

async function getLaWalletStatus(): Promise<LaWalletStatus> {
  try {
    const res = await fetch(`${LAWALLET_URL}/api/version`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { online: false, version: null };
    const d = (await res.json()) as Record<string, unknown>;
    const version =
      typeof d.currentVersion === "string" && d.currentVersion.trim()
        ? d.currentVersion.trim()
        : null;
    return { online: true, version };
  } catch {
    return { online: false, version: null };
  }
}

export async function getInfraStatus(): Promise<InfraStatus> {
  "use cache";
  cacheLife("minutes");
  cacheTag(INFRA_STATUS_CACHE_TAG);

  const [nostr, blossom, lawallet] = await Promise.all([
    getNostrRelayStatus(),
    pingHttp(BLOSSOM_URL),
    getLaWalletStatus(),
  ]);

  return { nostr, blossom, lawallet };
}
