/**
 * E2E TEST HELPER (local only). Performs an admin voting action (open-voting /
 * close-confirm) against the local dev server by signing a kind-27235 request
 * with the dev admin key — the same flow the DEV MODE bar uses, but headless.
 *
 *   node scripts/e2e-admin-action.mjs open-voting
 *   node scripts/e2e-admin-action.mjs close-confirm
 */
import { readFileSync } from "node:fs";
import { finalizeEvent } from "nostr-tools/pure";
import { decode } from "nostr-tools/nip19";

const action = process.argv[2] || "open-voting";
const HACKATHON = "e2e";
const BASE = "http://localhost:3000";

function envValue(key) {
  const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const line = raw.split("\n").find((l) => l.trim().startsWith(key + "="));
  return line ? line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "") : null;
}

const nsec = envValue("NEXT_PUBLIC_DEV_ADMIN_NSEC") || envValue("LACRYPTA_NSEC");
if (!nsec) { console.error("No admin nsec in .env.local"); process.exit(1); }
const secret = decode(nsec).data;

const tags = [
  ["u", `/api/hackathons/${HACKATHON}/voting`],
  ["method", "POST"],
  ["action", action],
  ["h", HACKATHON],
];
if (action === "open-voting") tags.push(["force", "1"]); // reopen past a closed poll

const request = finalizeEvent(
  { kind: 27235, created_at: Math.floor(Date.now() / 1000), content: `${action} · votación comunitaria`, tags },
  secret,
);

const res = await fetch(`${BASE}/api/hackathons/${HACKATHON}/voting`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ request }),
});
const data = await res.json().catch(() => ({}));
console.log("HTTP", res.status, JSON.stringify(data, null, 2));
process.exit(res.ok && data.ok ? 0 : 1);
