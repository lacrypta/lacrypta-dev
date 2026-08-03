/**
 * La Crypta Dev — local Nostr relay (Node).
 *
 * Why this exists instead of only the Docker relay: `scsibug/nostr-rs-relay`
 * publishes an amd64-only image, so on Apple Silicon the container starts and
 * immediately crash-loops (`exec /bin/sh: exec format error`). `docker compose
 * up -d` still reports success, and `pool.publish()` to ws://localhost:7777
 * resolves "fulfilled" while nothing is ever stored — voting and project flows
 * appear to work locally and silently read nothing back. This relay runs on the
 * host arch with no image pull, so `pnpm relay:up` works everywhere.
 *
 * Scope: NIP-01 (EVENT / REQ / CLOSE / OK / EOSE / CLOSED / NOTICE) with the
 * full event-class model — replaceable, ephemeral and, critically for us,
 * parameterized-replaceable (kind 30078 / NIP-33), which is what makes ballot
 * re-votes replace the prior ballot instead of stacking (see `lib/voting.ts`,
 * `voteDTag` + `dedupeBallots`). Plus NIP-09 deletes and a NIP-11 info doc.
 *
 * Not a production relay: no NIP-42 auth, no rate limits, no allowlist — any
 * throwaway test pubkey may publish any kind, on purpose. It is only ever
 * reachable at ws://localhost:7777 and nothing published here leaves the
 * machine.
 *
 * Run directly in the foreground:  node dev/relay/server.mjs
 * Managed (background + health check): pnpm relay:up / relay:down / relay:logs
 */
import { createServer } from "node:http";
import { appendFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { verifyEvent } from "nostr-tools/pure";

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.RELAY_PORT ?? 7777);
const HOST = process.env.RELAY_HOST ?? "127.0.0.1";
const DATA_DIR = process.env.RELAY_DATA_DIR ?? join(HERE, "data");
const DB_FILE = join(DATA_DIR, "events.jsonl");

/** Mirrors `reject_future_seconds` in config.toml — generous so mild dev-machine
 *  clock skew never silently drops a ballot. */
const MAX_FUTURE_SECONDS = 1800;
/** NIP-01 caps a REQ's stored-event page; also the default when no limit given. */
const MAX_LIMIT = 5000;
/** Rewrite the append-only log once it holds this many superseded lines. */
const COMPACT_THRESHOLD = 2000;

const RELAY_INFO = {
  name: "La Crypta Dev (local)",
  description: "Local development relay. Ephemeral, isolated from production.",
  software: "https://github.com/lacrypta/lacrypta.dev/tree/main/dev/relay",
  version: "1.0.0",
  supported_nips: [1, 9, 11, 33],
  limitation: { auth_required: false, payment_required: false },
};

// ─── storage ────────────────────────────────────────────────────────────────

/** id → event. Insertion order is irrelevant; queries sort explicitly. */
const events = new Map();
/** Replaceable/parameterized-replaceable coordinate → event id currently held. */
const coordinates = new Map();
/** Lines appended to the log that no longer correspond to a live event. */
let staleLines = 0;

const isReplaceable = (kind) => kind === 0 || kind === 3 || (kind >= 10000 && kind < 20000);
const isEphemeral = (kind) => kind >= 20000 && kind < 30000;
const isParameterized = (kind) => kind >= 30000 && kind < 40000;

function dTagOf(event) {
  for (const tag of event.tags) if (tag[0] === "d") return tag[1] ?? "";
  return "";
}

/** NIP-01 replacement coordinate, or null for regular (non-replaceable) events. */
function coordinateOf(event) {
  if (isReplaceable(event.kind)) return `${event.kind}:${event.pubkey}`;
  if (isParameterized(event.kind)) return `${event.kind}:${event.pubkey}:${dTagOf(event)}`;
  return null;
}

/**
 * NIP-01 tie-break: the newer `created_at` wins; on an exact tie the lexically
 * lower id is retained. `lib/voting.ts:dedupeBallots` applies the same rule
 * client-side, so a relay that got this backwards would show one winner in the
 * tally and another in the UI.
 */
function supersedes(candidate, incumbent) {
  if (candidate.created_at !== incumbent.created_at) {
    return candidate.created_at > incumbent.created_at;
  }
  return candidate.id < incumbent.id;
}

/**
 * Insert an already-validated event. Returns the OK reason string, or null when
 * the event was stored. `persist` is false while replaying the log at startup.
 */
function store(event, { persist = true } = {}) {
  if (events.has(event.id)) return "duplicate: have this event";

  const coordinate = coordinateOf(event);
  if (coordinate) {
    const incumbentId = coordinates.get(coordinate);
    const incumbent = incumbentId ? events.get(incumbentId) : undefined;
    if (incumbent && !supersedes(event, incumbent)) {
      return "replaced: have a newer event for this coordinate";
    }
    if (incumbent) {
      events.delete(incumbent.id);
      staleLines++;
    }
    coordinates.set(coordinate, event.id);
  }

  events.set(event.id, event);
  if (persist) appendLine(event);
  return null;
}

/** NIP-09: a kind-5 event deletes the author's own events named by `e` tags. */
function applyDeletion(event) {
  for (const tag of event.tags) {
    if (tag[0] !== "e" || !tag[1]) continue;
    const target = events.get(tag[1]);
    if (!target || target.pubkey !== event.pubkey) continue;
    events.delete(target.id);
    const coordinate = coordinateOf(target);
    if (coordinate && coordinates.get(coordinate) === target.id) coordinates.delete(coordinate);
    staleLines++;
  }
}

// ─── persistence (append-only JSONL, compacted on startup) ──────────────────

function appendLine(event) {
  try {
    appendFileSync(DB_FILE, `${JSON.stringify(event)}\n`);
  } catch (err) {
    console.error(`[relay] could not persist event ${event.id.slice(0, 8)}: ${err.message}`);
  }
}

function load() {
  mkdirSync(DATA_DIR, { recursive: true });
  let raw;
  try {
    raw = readFileSync(DB_FILE, "utf8");
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
    writeFileSync(DB_FILE, "");
    return;
  }

  let replayed = 0;
  let skipped = 0;
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      skipped++;
      continue;
    }
    // Replay through the same rules that accepted it, so replacements and
    // deletes resolve exactly as they did live.
    if (event.kind === 5) {
      store(event, { persist: false });
      applyDeletion(event);
      replayed++;
      continue;
    }
    if (store(event, { persist: false }) === null) replayed++;
    else staleLines++;
  }
  if (skipped) console.warn(`[relay] skipped ${skipped} unparseable line(s) in ${DB_FILE}`);
  console.log(`[relay] loaded ${events.size} event(s) from disk (${replayed} line(s) replayed)`);
  if (staleLines > 0) compact();
}

/** Rewrite the log with only the surviving events. Atomic via rename. */
function compact() {
  const tmp = `${DB_FILE}.tmp`;
  const body = [...events.values()].map((e) => `${JSON.stringify(e)}\n`).join("");
  writeFileSync(tmp, body);
  renameSync(tmp, DB_FILE);
  staleLines = 0;
}

// ─── filters ────────────────────────────────────────────────────────────────

const TAG_FILTER = /^#([a-zA-Z])$/;

function matchesFilter(event, filter) {
  if (filter.ids && !filter.ids.includes(event.id)) return false;
  if (filter.authors && !filter.authors.includes(event.pubkey)) return false;
  if (filter.kinds && !filter.kinds.includes(event.kind)) return false;
  if (typeof filter.since === "number" && event.created_at < filter.since) return false;
  if (typeof filter.until === "number" && event.created_at > filter.until) return false;

  for (const [key, wanted] of Object.entries(filter)) {
    const tagMatch = TAG_FILTER.exec(key);
    if (!tagMatch || !Array.isArray(wanted)) continue;
    const name = tagMatch[1];
    const hit = event.tags.some((tag) => tag[0] === name && wanted.includes(tag[1]));
    if (!hit) return false;
  }
  return true;
}

const matchesAny = (event, filters) => filters.some((f) => matchesFilter(event, f));

/** Newest-first, id-ascending on ties — the order clients expect from a REQ. */
function query(filters) {
  const out = [];
  for (const event of events.values()) if (matchesAny(event, filters)) out.push(event);
  out.sort((a, b) => b.created_at - a.created_at || (a.id < b.id ? -1 : 1));

  const limits = filters.map((f) => f.limit).filter((n) => typeof n === "number" && n >= 0);
  const limit = limits.length ? Math.max(...limits) : MAX_LIMIT;
  return out.slice(0, Math.min(limit, MAX_LIMIT));
}

// ─── validation ─────────────────────────────────────────────────────────────

function validate(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) return "invalid: not an event";
  if (typeof event.id !== "string" || !/^[0-9a-f]{64}$/.test(event.id)) return "invalid: bad id";
  if (typeof event.pubkey !== "string" || !/^[0-9a-f]{64}$/.test(event.pubkey)) {
    return "invalid: bad pubkey";
  }
  if (typeof event.sig !== "string" || !/^[0-9a-f]{128}$/.test(event.sig)) return "invalid: bad sig";
  if (!Number.isInteger(event.kind) || event.kind < 0) return "invalid: bad kind";
  if (!Number.isInteger(event.created_at)) return "invalid: bad created_at";
  if (typeof event.content !== "string") return "invalid: bad content";
  if (!Array.isArray(event.tags) || event.tags.some((t) => !Array.isArray(t))) {
    return "invalid: bad tags";
  }

  const now = Math.floor(Date.now() / 1000);
  if (event.created_at > now + MAX_FUTURE_SECONDS) {
    return `invalid: created_at is more than ${MAX_FUTURE_SECONDS}s in the future`;
  }
  // verifyEvent recomputes the id and checks the schnorr signature.
  if (!verifyEvent(event)) return "invalid: signature verification failed";
  return null;
}

// ─── connections ────────────────────────────────────────────────────────────

/** ws → Map<subId, filters[]> */
const subscriptions = new Map();

function send(ws, message) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}

function broadcast(event) {
  for (const [ws, subs] of subscriptions) {
    for (const [subId, filters] of subs) {
      if (matchesAny(event, filters)) send(ws, ["EVENT", subId, event]);
    }
  }
}

function handleEvent(ws, event) {
  const reason = validate(event);
  if (reason) {
    send(ws, ["OK", event?.id ?? "", false, reason]);
    return;
  }

  // Ephemeral events are relayed to live subscribers but never stored.
  if (isEphemeral(event.kind)) {
    send(ws, ["OK", event.id, true, ""]);
    broadcast(event);
    return;
  }

  const rejection = store(event);
  if (event.kind === 5 && !rejection) applyDeletion(event);
  if (staleLines >= COMPACT_THRESHOLD) compact();

  // A duplicate/superseded event is still an accepted OK per NIP-01 — the
  // client's write succeeded, the relay just already holds an equal-or-newer
  // version. Only validation failures are `false`.
  send(ws, ["OK", event.id, true, rejection ?? ""]);
  if (!rejection) broadcast(event);
}

function handleReq(ws, subId, filters) {
  if (!filters.length) {
    send(ws, ["CLOSED", subId, "invalid: REQ needs at least one filter"]);
    return;
  }
  const subs = subscriptions.get(ws);
  if (!subs) return;
  subs.set(subId, filters);
  for (const event of query(filters)) send(ws, ["EVENT", subId, event]);
  send(ws, ["EOSE", subId]);
}

function handleMessage(ws, raw) {
  let message;
  try {
    message = JSON.parse(raw.toString());
  } catch {
    send(ws, ["NOTICE", "invalid: malformed JSON"]);
    return;
  }
  if (!Array.isArray(message) || typeof message[0] !== "string") {
    send(ws, ["NOTICE", "invalid: message must be a JSON array"]);
    return;
  }

  switch (message[0]) {
    case "EVENT":
      handleEvent(ws, message[1]);
      return;
    case "REQ":
      if (typeof message[1] !== "string") {
        send(ws, ["NOTICE", "invalid: REQ needs a subscription id"]);
        return;
      }
      handleReq(ws, message[1], message.slice(2).filter((f) => f && typeof f === "object"));
      return;
    case "CLOSE":
      subscriptions.get(ws)?.delete(message[1]);
      return;
    case "COUNT":
      if (typeof message[1] === "string") {
        const filters = message.slice(2).filter((f) => f && typeof f === "object");
        send(ws, ["COUNT", message[1], { count: filters.length ? query(filters).length : 0 }]);
      }
      return;
    case "AUTH":
      // No NIP-42 on the dev relay; acknowledge so clients do not stall.
      send(ws, ["NOTICE", "auth not required on the dev relay"]);
      return;
    default:
      send(ws, ["NOTICE", `invalid: unknown message type ${message[0]}`]);
  }
}

// ─── server ─────────────────────────────────────────────────────────────────

load();

const http = createServer((req, res) => {
  // NIP-11 relay information document.
  if (req.headers.accept?.includes("application/nostr+json")) {
    res.writeHead(200, {
      "content-type": "application/nostr+json",
      "access-control-allow-origin": "*",
    });
    res.end(JSON.stringify(RELAY_INFO));
    return;
  }
  res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
  res.end(
    `${RELAY_INFO.name}\nConnect a Nostr client to ws://localhost:${PORT}\nStored events: ${events.size}\n`,
  );
});

const wss = new WebSocketServer({ server: http });

wss.on("connection", (ws, req) => {
  subscriptions.set(ws, new Map());
  console.log(`[relay] client connected (${req.socket.remoteAddress}) — ${wss.clients.size} open`);
  ws.on("message", (raw) => {
    try {
      handleMessage(ws, raw);
    } catch (err) {
      console.error(`[relay] error handling message: ${err.stack ?? err}`);
      send(ws, ["NOTICE", "error: relay failed to handle that message"]);
    }
  });
  ws.on("close", () => {
    subscriptions.delete(ws);
    console.log(`[relay] client disconnected — ${wss.clients.size} open`);
  });
  ws.on("error", (err) => console.error(`[relay] socket error: ${err.message}`));
});

// `ws` re-emits the HTTP server's `error` on the WebSocketServer, and an
// unhandled 'error' event would crash with a raw stack trace before this ever
// ran — so both need the handler, and only the first one to fire may report.
let reportedFatal = false;
function onFatal(err) {
  if (reportedFatal) return;
  reportedFatal = true;
  if (err.code === "EADDRINUSE") {
    console.error(
      `[relay] port ${PORT} is already in use — another relay (or a stale one) is bound.\n` +
        `[relay] stop it with \`pnpm relay:down\`, or find it with \`lsof -nP -iTCP:${PORT} -sTCP:LISTEN\`.`,
    );
  } else {
    console.error(`[relay] server error: ${err.stack ?? err}`);
  }
  process.exit(1);
}

http.on("error", onFatal);
wss.on("error", onFatal);

http.listen(PORT, HOST, () => {
  console.log(`[relay] La Crypta dev relay listening on ws://${HOST}:${PORT}`);
  console.log(`[relay] storage: ${DB_FILE} (${events.size} event(s))`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    console.log(`[relay] ${signal} — shutting down`);
    try {
      compact();
    } catch {
      /* best effort */
    }
    wss.close();
    http.close(() => process.exit(0));
    // Don't hang on lingering sockets.
    setTimeout(() => process.exit(0), 1000).unref();
  });
}
