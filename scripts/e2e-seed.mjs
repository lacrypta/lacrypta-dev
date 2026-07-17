/**
 * E2E TEST HELPER (local only). Re-seeds the 10 dummy users + 10 projects to the
 * local relay — mirrors lib/devSeed.ts exactly (kind-0 profiles + kind-30078
 * projects, each signed by that user's own deterministic key). Run after wiping
 * the relay DB to rebuild the roster from scratch. Node 22+ (global WebSocket).
 */
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";

const RELAY = "ws://localhost:7777";

const USERS = [
  { name: "Satoshi Tester", about: "Probando todo lo que se mueva ⚡" },
  { name: "Lightning Lucía", about: "Pagos instantáneos o nada." },
  { name: "Nostrich Nico", about: "Relays, zaps y café." },
  { name: "Zap Zoe", about: "Gamedev sobre Bitcoin." },
  { name: "Block Bruno", about: "Infra y nodos toda la noche." },
  { name: "Relay Rita", about: "Self-hosting evangelist." },
  { name: "Sat Sergio", about: "Comercio Lightning para todos." },
  { name: "HODL Hilda", about: "Identidad soberana primero." },
  { name: "Mempool Mara", about: "Cazando fees bajos." },
  { name: "Taproot Tomás", about: "Scripts, firmas y privacidad." },
];

const PROJECTS = [
  { id: "e2e-zappy-pos", name: "Zappy POS", description: "Punto de venta Lightning sin custodia.", repo: "https://github.com/e2e/zappy-pos", author: 0 },
  { id: "e2e-bolt-board", name: "BoltBoard", description: "Leaderboard de zaps en vivo.", repo: "https://github.com/e2e/bolt-board", author: 1 },
  { id: "e2e-keychain", name: "Keychain", description: "Backup social de claves Nostr.", repo: "https://github.com/e2e/keychain", author: 2 },
  { id: "e2e-zap-arena", name: "Zap Arena", description: "Juego PvP con apuestas en sats.", repo: "https://github.com/e2e/zap-arena", author: 3 },
  { id: "e2e-tetris-sats", name: "TetriSats", description: "Tetris que paga por líneas.", repo: "https://github.com/e2e/tetrisats", author: 4 },
  { id: "e2e-noderunner", name: "NodeRunner", description: "Dashboard de liquidez y rutas.", repo: "https://github.com/e2e/noderunner", author: 5 },
  { id: "e2e-castr", name: "Castr", description: "Podcasting 2.0 con value-for-value.", repo: "https://github.com/e2e/castr", author: 6 },
  { id: "e2e-soberano", name: "Soberano", description: "Wallet de identidad + pagos.", repo: "https://github.com/e2e/soberano", author: 7 },
  { id: "e2e-mediavault", name: "MediaVault", description: "Almacenamiento cifrado sobre Blossom.", repo: "https://github.com/e2e/mediavault", author: 8 },
  { id: "e2e-sat-checkout", name: "SatCheckout", description: "Checkout para tiendas con LNURL.", repo: "https://github.com/e2e/sat-checkout", author: 9 },
];

const avatarFor = (name) =>
  `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${encodeURIComponent(name)}`;

async function dummySecret(name) {
  const data = new TextEncoder().encode("lacrypta-dev-dummy:v1:" + name);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", data));
}

function publish(event) {
  return new Promise((resolve) => {
    const ws = new WebSocket(RELAY);
    let settled = false;
    const done = (ok, info) => { if (settled) return; settled = true; try { ws.close(); } catch {} resolve({ ok, info }); };
    ws.onopen = () => ws.send(JSON.stringify(["EVENT", event]));
    ws.onmessage = (m) => { try { const a = JSON.parse(m.data.toString()); if (a[0] === "OK" && a[1] === event.id) done(a[2], a[3] || ""); } catch {} };
    ws.onerror = () => done(false, "ws-error");
    setTimeout(() => done(false, "timeout"), 8000);
  });
}

const now = Math.floor(Date.now() / 1000);
const keys = await Promise.all(
  USERS.map(async (u) => { const sk = await dummySecret(u.name); return { ...u, sk, pk: getPublicKey(sk) }; }),
);

let profiles = 0;
for (const u of keys) {
  const ev = finalizeEvent({ kind: 0, created_at: now, tags: [["client", "La Crypta Dev"]],
    content: JSON.stringify({ name: u.name, display_name: u.name, about: u.about, picture: avatarFor(u.name) }) }, u.sk);
  const r = await publish(ev);
  if (r.ok) profiles++;
  console.log(`${r.ok ? "OK " : "ERR"} profile ${u.name} ${r.info}`);
}

let projects = 0;
for (const p of PROJECTS) {
  const owner = keys[p.author];
  const team = [{ name: owner.name, role: "Lead Dev", pubkey: owner.pk, picture: avatarFor(owner.name) }];
  const ev = finalizeEvent({
    kind: 30078, created_at: now,
    tags: [
      ["d", `lacrypta.dev:project:${p.id}`],
      ["t", "lacrypta-dev-project"],
      ["t", "e2e"], ["h", "e2e"],
      ["client", "La Crypta Dev"],
      ["name", p.name],
      ["r", p.repo],
    ],
    content: JSON.stringify({
      id: p.id, name: p.name, description: p.description, repo: p.repo, tech: [],
      team, status: "submitted", hackathon: "e2e", createdAt: now, updatedAt: now,
    }),
  }, owner.sk);
  const r = await publish(ev);
  if (r.ok) projects++;
  console.log(`${r.ok ? "OK " : "ERR"} project ${p.name} (${owner.name}) ${r.info}`);
}

console.log(`\nSeeded ${profiles}/${USERS.length} profiles, ${projects}/${PROJECTS.length} projects.`);
process.exit(profiles === USERS.length && projects === PROJECTS.length ? 0 : 1);
