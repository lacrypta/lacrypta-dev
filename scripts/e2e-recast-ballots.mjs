/**
 * E2E TEST HELPER (local relay only). Republishes clean ballots for the 10
 * dummy voters, each signed by their dev stand-in key (same key the voting
 * route treats as eligible in dev mode). Produces the exact kind-30078,
 * NIP-44-encrypted ballot the app's publishBallot() creates.
 *
 * Run with node 22+ (needs global WebSocket).
 */
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";
import * as nip44 from "nostr-tools/nip44";

const RELAY = "ws://localhost:7777";
const PUBLISHER = "b30c180cfd6ca8ac33a4e1793bcb655585efb7793df10ed8524d85f4a7fe5775";
const HACKATHON = "e2e";
const D_TAG = "lacrypta.dev:vote:e2e"; // production namespace (NEXT_PUBLIC_VOTING_NS unset)

async function sha256(str) {
  const data = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(digest);
}
// Real dummy key (lib/devSeed.ts): sha256("lacrypta-dev-dummy:v1:"+name)
const dummySecret = (name) => sha256("lacrypta-dev-dummy:v1:" + name);
// Stand-in key (lib/devImpersonation.ts): sha256("lacrypta-dev-impersonation:v1:"+realpub)
const standInSecret = (realPubHex) =>
  sha256("lacrypta-dev-impersonation:v1:" + realPubHex.trim().toLowerCase());

// name -> allocations (projectId: votes). Each voter spends their 5-vote budget
// across SEVERAL different projects (no self-votes), showcasing spread voting.
// Aggregate ranking: BoltBoard 22 · Keychain 13 · Zap Arena 7 · Castr 4 ·
// NodeRunner 2 · TetriSats 2.
const PLAN = [
  ["Satoshi Tester",  { "e2e-bolt-board": 3, "e2e-keychain": 2 }],
  ["Lightning Lucía", { "e2e-keychain": 3, "e2e-zap-arena": 2 }],
  ["Nostrich Nico",   { "e2e-bolt-board": 3, "e2e-zap-arena": 2 }],
  ["Zap Zoe",         { "e2e-bolt-board": 3, "e2e-keychain": 2 }],
  ["Block Bruno",     { "e2e-bolt-board": 3, "e2e-castr": 2 }],
  ["Relay Rita",      { "e2e-keychain": 3, "e2e-bolt-board": 2 }],
  ["Sat Sergio",      { "e2e-bolt-board": 3, "e2e-noderunner": 2 }],
  ["HODL Hilda",      { "e2e-zap-arena": 3, "e2e-bolt-board": 2 }],
  ["Mempool Mara",    { "e2e-bolt-board": 3, "e2e-tetris-sats": 2 }],
  ["Taproot Tomás",   { "e2e-keychain": 3, "e2e-castr": 2 }],
];

function publish(event) {
  return new Promise((resolve) => {
    const ws = new WebSocket(RELAY);
    let settled = false;
    const done = (ok, info) => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch {}
      resolve({ ok, info });
    };
    ws.onopen = () => ws.send(JSON.stringify(["EVENT", event]));
    ws.onmessage = (m) => {
      try {
        const msg = JSON.parse(m.data.toString());
        if (msg[0] === "OK" && msg[1] === event.id) done(msg[2], msg[3] || "");
      } catch {}
    };
    ws.onerror = (e) => done(false, "ws-error");
    setTimeout(() => done(false, "timeout"), 8000);
  });
}

const now = Math.floor(Date.now() / 1000); // current time: newer than messy ballots, not future (avoids "too-late")
const results = [];
for (const [name, allocations] of PLAN) {
  const realPub = getPublicKey(await dummySecret(name));
  const secret = await standInSecret(realPub);
  const total = Object.values(allocations).reduce((s, n) => s + n, 0);
  const content = JSON.stringify({
    version: 2,
    hackathonId: HACKATHON,
    allocations,
  });
  const ciphertext = nip44.encrypt(content, nip44.getConversationKey(secret, PUBLISHER));
  const ev = finalizeEvent(
    {
      kind: 30078,
      created_at: now,
      content: ciphertext,
      tags: [
        ["d", D_TAG],
        ["t", "lacrypta-dev-vote"],
        ["h", HACKATHON],
        ["enc", "nip44"],
        ["votes", String(total)],
        ["client", "La Crypta Dev"],
      ],
    },
    secret,
  );
  const r = await publish(ev);
  const summary = Object.entries(allocations).map(([p, v]) => `${p.replace("e2e-", "")}×${v}`).join(" + ");
  results.push({ name, ok: r.ok, info: r.info });
  console.log(`${r.ok ? "OK " : "ERR"} ${name} (${total} votos): ${summary} ${r.info}`);
}
const okCount = results.filter((r) => r.ok).length;
console.log(`\n${okCount}/${PLAN.length} ballots published.`);
process.exit(okCount === PLAN.length ? 0 : 1);
