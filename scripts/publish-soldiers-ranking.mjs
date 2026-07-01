#!/usr/bin/env node
// Recomputes and republishes the official /soldados ranking snapshot without
// a browser step. Mirrors the signing flow in
// app/soldados/AdminRepublishRanking.tsx, but self-signs the admin
// authorization with LACRYPTA_NSEC — the same keypair
// NEXT_PUBLIC_LACRYPTA_ADMIN_NPUB must resolve to (see .env.example) — so it
// can run headless from build-hackathon-reports.mjs or a terminal.
//
//   node scripts/publish-soldiers-ranking.mjs
//
// No-ops (exit 0) when LACRYPTA_NSEC isn't set, so local report editing
// without production secrets doesn't fail the reports build.

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

function loadEnvLocal() {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const path = join(root, ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^\s*([\w.-]+)\s*=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvLocal();

const nsec = process.env.LACRYPTA_NSEC;
if (!nsec) {
  console.log(
    "[publish-soldiers-ranking] LACRYPTA_NSEC not set — skipping ranking republish.",
  );
  process.exit(0);
}

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(
  /\/+$/,
  "",
);

const { decode } = await import("nostr-tools/nip19");
const { finalizeEvent, getPublicKey } = await import("nostr-tools/pure");

const decoded = decode(nsec);
if (decoded.type !== "nsec") {
  console.error("[publish-soldiers-ranking] LACRYPTA_NSEC is not a valid nsec.");
  process.exit(1);
}
const secret = decoded.data;
const pubkey = getPublicKey(secret);

const request = finalizeEvent(
  {
    kind: 27235,
    created_at: Math.floor(Date.now() / 1000),
    content: "Recompute & publish soldiers ranking",
    tags: [
      ["u", "/api/soldiers/ranking"],
      ["method", "POST"],
      ["action", "publish-soldiers-ranking"],
    ],
  },
  secret,
);

console.log(
  `[publish-soldiers-ranking] POST ${siteUrl}/api/soldiers/ranking as ${pubkey.slice(0, 8)}…`,
);

const res = await fetch(`${siteUrl}/api/soldiers/ranking`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ request }),
});
const data = await res.json().catch(() => ({}));

if (!res.ok || !data.ok) {
  console.error(`[publish-soldiers-ranking] failed (${res.status}):`, data.error ?? data);
  process.exit(1);
}

console.log(
  `[publish-soldiers-ranking] published — ${data.soldierCount ?? "?"} soldiers, generatedAt ${data.generatedAt ?? "?"}.`,
);
