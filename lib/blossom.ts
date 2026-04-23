"use client";

/**
 * Blossom client — minimal BUD-01 (auth) + BUD-02 (upload) implementation.
 *
 * https://github.com/hzrd149/blossom
 *
 * For labs we only need to upload user-chosen images (avatar, banner) and get
 * back a URL. We try a list of public servers in order; first successful
 * response wins. Each request carries a signed kind:24242 event as
 * `Authorization: Nostr <base64(event)>` per BUD-01.
 */

import type { SignedEvent, UnsignedEvent, UserSigner } from "./nostrSigner";

/** Public Blossom servers that accept anonymous uploads. Order matters —
 *  earlier entries are tried first. Each server has its own quota policies
 *  and uptime; the fallback keeps the UX working if one is slow. */
export const DEFAULT_BLOSSOM_SERVERS: string[] = [
  "https://blossom.primal.net",
  "https://cdn.satellite.earth",
  "https://blossom.band",
  "https://nostr.download",
];

export type BlobDescriptor = {
  /** Canonical URL where the blob can be retrieved. */
  url: string;
  /** Hex-encoded SHA-256 of the blob content. */
  sha256: string;
  /** Size in bytes (as reported by the server). */
  size: number;
  /** MIME type (as reported by the server, may differ from File.type). */
  type?: string;
  /** Unix seconds — when the server first stored the blob. */
  uploaded?: number;
  /** Which Blossom server successfully accepted the upload. */
  server: string;
};

export type UploadProgress = {
  server: string;
  state: "signing" | "uploading" | "ok" | "error";
  error?: string;
  /** Bytes uploaded so far (only populated during the "uploading" state). */
  loaded?: number;
  /** Total bytes to upload (only populated during the "uploading" state). */
  total?: number;
  /** Convenience: 0..1 fraction of `loaded / total`, or undefined if the
   *  browser didn't report a computable length. */
  percent?: number;
};

export type UploadOptions = {
  /** Override the default server list (tried in order). */
  servers?: string[];
  /** Callback fired on every state transition, useful for UI indicators. */
  onProgress?: (p: UploadProgress) => void;
  /** Seconds the upload auth event stays valid (default 5 minutes). */
  authTtlSec?: number;
  /** Per-server request timeout (default 30s). */
  perServerTimeoutMs?: number;
};

/** Hex SHA-256 for a Blob (uses SubtleCrypto on the browser). */
export async function sha256Hex(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

/** Base64 encode a string that may include multi-byte characters. */
function base64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  // btoa only accepts binary-safe strings; we translated utf-8 → bytes above.
  return typeof btoa === "function"
    ? btoa(binary)
    : Buffer.from(bytes).toString("base64");
}

/** Builds a signed kind:24242 BUD-01 authorisation event for an upload. */
async function signUploadAuth(
  signer: UserSigner,
  sha: string,
  ttlSec: number,
): Promise<SignedEvent> {
  const now = Math.floor(Date.now() / 1000);
  const unsigned: UnsignedEvent = {
    kind: 24242,
    pubkey: signer.pubkey,
    created_at: now,
    tags: [
      ["t", "upload"],
      ["x", sha],
      ["expiration", String(now + ttlSec)],
    ],
    content: "Upload image · La Crypta Labs",
  };
  return signer.signEvent(unsigned);
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Timeout ${ms}ms — ${label}`)),
        ms,
      ),
    ),
  ]);
}

type XhrResult = { status: number; statusText: string; body: string };

/**
 * Minimal XHR-based PUT that exposes upload progress. We can't use `fetch()`
 * because it has no upload-progress API in browsers — only download progress
 * via `response.body.getReader()`. For a live "0 → 100%" reveal we need the
 * outgoing byte count, which is what `XMLHttpRequest.upload.onprogress`
 * provides.
 */
function xhrPut(
  url: string,
  body: Blob,
  headers: Record<string, string>,
  onUploadProgress: (loaded: number, total: number) => void,
  timeoutMs: number,
): Promise<XhrResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.responseType = "text";
    xhr.timeout = timeoutMs;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onUploadProgress(e.loaded, e.total);
    };
    xhr.onload = () => {
      resolve({
        status: xhr.status,
        statusText: xhr.statusText,
        body: xhr.responseText,
      });
    };
    xhr.onerror = () => reject(new Error("Upload failed (network)"));
    xhr.ontimeout = () =>
      reject(new Error(`Upload timeout (${timeoutMs}ms)`));
    xhr.onabort = () => reject(new Error("Upload aborted"));
    xhr.send(body);
  });
}

/**
 * Uploads a file to the first Blossom server that accepts it.
 *
 * Flow (BUD-01 + BUD-02):
 * 1. Hash the file (SHA-256).
 * 2. Sign a kind:24242 event with `t=upload`, `x=<sha>`, `expiration=<ts+ttl>`.
 * 3. For each server in order, PUT /upload with
 *    `Authorization: Nostr <base64(eventJson)>` and the file as body.
 * 4. Return the first successful `BlobDescriptor`, falling through on 4xx/5xx.
 */
export async function uploadToBlossom(
  file: Blob,
  signer: UserSigner,
  opts: UploadOptions = {},
): Promise<BlobDescriptor> {
  const {
    servers = DEFAULT_BLOSSOM_SERVERS,
    onProgress,
    authTtlSec = 5 * 60,
    perServerTimeoutMs = 30_000,
  } = opts;

  if (servers.length === 0) {
    throw new Error("No hay servidores Blossom configurados.");
  }

  // 1–2) Hash + sign a single auth event reused for every server attempt
  onProgress?.({ server: "", state: "signing" });
  const sha = await sha256Hex(file);
  const signed = await signUploadAuth(signer, sha, authTtlSec);
  const authHeader = `Nostr ${base64Utf8(JSON.stringify(signed))}`;

  const errors: string[] = [];
  const contentType =
    file instanceof File && file.type ? file.type : "application/octet-stream";

  for (const raw of servers) {
    const server = raw.replace(/\/+$/, "");
    onProgress?.({
      server,
      state: "uploading",
      loaded: 0,
      total: file.size,
      percent: 0,
    });
    try {
      const res = await xhrPut(
        `${server}/upload`,
        file,
        {
          "Content-Type": contentType,
          Authorization: authHeader,
        },
        (loaded, total) => {
          onProgress?.({
            server,
            state: "uploading",
            loaded,
            total,
            percent: total > 0 ? loaded / total : undefined,
          });
        },
        perServerTimeoutMs,
      );

      if (res.status < 200 || res.status >= 300) {
        const msg = `${res.status} ${res.statusText}${res.body ? ` · ${res.body.slice(0, 160)}` : ""}`;
        errors.push(`${server}: ${msg}`);
        onProgress?.({ server, state: "error", error: msg });
        continue;
      }

      let desc: Partial<BlobDescriptor> | null = null;
      try {
        desc = JSON.parse(res.body);
      } catch {
        /* ignore — handled below */
      }
      if (!desc?.url) {
        const msg = "Respuesta sin URL.";
        errors.push(`${server}: ${msg}`);
        onProgress?.({ server, state: "error", error: msg });
        continue;
      }

      onProgress?.({
        server,
        state: "ok",
        loaded: file.size,
        total: file.size,
        percent: 1,
      });
      return {
        url: desc.url,
        sha256: desc.sha256 ?? sha,
        size: desc.size ?? (file as File).size ?? 0,
        type: desc.type ?? contentType,
        uploaded: desc.uploaded,
        server,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${server}: ${msg}`);
      onProgress?.({ server, state: "error", error: msg });
    }
  }

  throw new Error(
    `Blossom: ningún servidor aceptó el blob.\n${errors.join("\n")}`,
  );
}

export type FetchProgress = {
  /** Bytes received so far. */
  loaded: number;
  /** Total bytes (0 if the server didn't advertise Content-Length). */
  total: number;
  /** Convenience ratio 0..1, or undefined if total is unknown. */
  percent?: number;
};

/**
 * Download a blob from an HTTP URL while streaming progress. Uses
 * `response.body.getReader()` — the standard way to observe download
 * progress in modern browsers. The returned blob honours the server's
 * Content-Type when present.
 *
 * After the blob has been fully streamed, the underlying HTTP response is
 * in the browser cache, so setting `<img src={url}>` right after resolves
 * instantly without a second network round-trip.
 */
export async function fetchBlobWithProgress(
  url: string,
  onProgress: (p: FetchProgress) => void,
  opts?: { signal?: AbortSignal },
): Promise<Blob> {
  const res = await fetch(url, { signal: opts?.signal });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} al descargar ${url}`);
  }
  const contentType =
    res.headers.get("content-type") || "application/octet-stream";
  const contentLength = Number(res.headers.get("content-length") || 0);

  if (!res.body) {
    // Fallback: no stream support; consume the whole body at once.
    const blob = await res.blob();
    onProgress({ loaded: blob.size, total: blob.size, percent: 1 });
    return blob;
  }

  const reader = res.body.getReader();
  const chunks: BlobPart[] = [];
  let received = 0;

  // Emit an initial 0-tick so the UI reflects "download started".
  onProgress({
    loaded: 0,
    total: contentLength,
    percent: contentLength > 0 ? 0 : undefined,
  });

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.byteLength;
      onProgress({
        loaded: received,
        total: contentLength,
        percent: contentLength > 0 ? received / contentLength : undefined,
      });
    }
  }

  const blob = new Blob(chunks, { type: contentType });
  // If content-length was missing we still want to fire a terminal 100%.
  if (!contentLength) {
    onProgress({ loaded: blob.size, total: blob.size, percent: 1 });
  }
  return blob;
}
