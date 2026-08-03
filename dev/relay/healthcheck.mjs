/**
 * La Crypta Dev — local relay health check.
 *
 * The failure this exists to catch: a relay that *accepts* the connection but
 * never stores anything. `pool.publish()` resolves "fulfilled" the moment a
 * socket accepts the frame, so a dead or half-broken relay lets voting and
 * project flows look like they work while every read comes back empty. A port
 * check or a `docker ps` would both pass in that state.
 *
 * So this does a real round trip, and asserts the one property the app actually
 * depends on: kind-30078 parameterized-replaceable semantics (NIP-33). Ballots
 * are `kind 30078` + `d = lacrypta.dev:vote:<hackathonId>` (`lib/voting.ts`),
 * and re-voting MUST replace the prior ballot rather than stack a second one.
 *
 *   1. connect                 → the socket opens at all
 *   2. publish a kind-30078    → OK true (event validated + accepted)
 *   3. REQ it back             → the event is really stored, EOSE arrives
 *   4. publish a replacement   → same d-tag, newer created_at
 *   5. REQ again               → exactly ONE event, with the new content
 *
 * Run standalone: pnpm relay:check   (also runs automatically after relay:up)
 */
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";

/**
 * Derived from the same variables server.mjs binds, so `RELAY_PORT=7778` moves
 * both ends together — otherwise the relay would bind 7778, the probe would
 * knock on 7777, and `relay:up` would fail against a perfectly healthy relay.
 * Wildcard binds are probed on the loopback address you can actually dial.
 */
function defaultRelayUrl() {
  const host = process.env.RELAY_HOST ?? "127.0.0.1";
  const port = process.env.RELAY_PORT ?? "7777";
  const dialable = host === "0.0.0.0" || host === "::" || !host ? "127.0.0.1" : host;
  return `ws://${dialable.includes(":") ? `[${dialable}]` : dialable}:${port}`;
}

export const RELAY_URL = process.env.RELAY_URL ?? defaultRelayUrl();

/** Deterministic throwaway key + d-tag: the probe replaces its own previous
 *  event every run, so repeated checks never accumulate junk on the relay. */
const PROBE_SECRET = new Uint8Array(
  createHash("sha256").update("lacrypta-dev-relay-healthcheck:v1").digest(),
);
const PROBE_PUBKEY = getPublicKey(PROBE_SECRET);
const PROBE_D_TAG = "lacrypta.dev:healthcheck";
const PROBE_KIND = 30078;

class HealthcheckError extends Error {
  /** `retryable` marks warm-up noise (not listening *yet*, slow first connect)
   *  as distinct from a protocol verdict, which is final. The caller in
   *  relay.mjs reads this flag — matching on message text would silently break
   *  the retry loop the next time one of these strings is reworded. */
  constructor(message, hint, { retryable = false } = {}) {
    super(message);
    this.name = "HealthcheckError";
    this.hint = hint;
    this.retryable = retryable;
  }
}

function connect(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { handshakeTimeout: timeoutMs });
    const timer = setTimeout(() => {
      ws.terminate();
      reject(
        new HealthcheckError(`no response from ${url} within ${timeoutMs}ms`, undefined, {
          retryable: true,
        }),
      );
    }, timeoutMs);
    ws.once("open", () => {
      clearTimeout(timer);
      resolve(ws);
    });
    ws.once("error", (err) => {
      clearTimeout(timer);
      reject(
        new HealthcheckError(
          `could not connect to ${url}: ${err.message}`,
          err.code === "ECONNREFUSED"
            ? "nothing is listening on that port — the relay is not running"
            : undefined,
          { retryable: true },
        ),
      );
    });
  });
}

/** Resolve on the first message the predicate accepts. */
function awaitMessage(ws, predicate, { timeoutMs, describe }) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(
        new HealthcheckError(`timed out after ${timeoutMs}ms waiting for ${describe}`, undefined, {
          retryable: true,
        }),
      );
    }, timeoutMs);
    const onMessage = (raw) => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (!Array.isArray(message)) return;
      // The predicate throws to report a verdict (a CLOSED answer). Unhandled,
      // that escapes the ws 'message' emit as an uncaught exception: this
      // promise never settles, the timer stays armed, and the diagnosis is lost.
      let accepted;
      try {
        accepted = predicate(message);
      } catch (err) {
        cleanup();
        reject(err);
        return;
      }
      if (!accepted) return;
      cleanup();
      resolve(message);
    };
    const onClose = () => {
      cleanup();
      reject(
        new HealthcheckError(
          `the relay closed the connection while waiting for ${describe}`,
          "the relay process is dying mid-request — check `pnpm relay:logs`",
        ),
      );
    };
    function cleanup() {
      clearTimeout(timer);
      ws.off("message", onMessage);
      ws.off("close", onClose);
    }
    ws.on("message", onMessage);
    ws.once("close", onClose);
  });
}

/** Publish one event and assert the relay's OK is affirmative. Returns the OK
 *  message, which relays use to explain a no-op accept ("duplicate:", "replaced:"). */
async function publish(ws, event, timeoutMs, label) {
  const pending = awaitMessage(ws, (m) => m[0] === "OK" && m[1] === event.id, {
    timeoutMs,
    describe: `an OK for the ${label} event`,
  });
  ws.send(JSON.stringify(["EVENT", event]));
  const [, , accepted, info] = await pending;
  if (!accepted) {
    throw new HealthcheckError(
      `the relay rejected the ${label} event: ${info || "(no reason given)"}`,
      "the relay is reachable but refusing valid events",
    );
  }
  return typeof info === "string" ? info : "";
}

/** Run one REQ to completion and return the matching stored events. */
async function fetchStored(ws, subId, timeoutMs, label, dTag) {
  const collected = [];
  const pending = awaitMessage(
    ws,
    (m) => {
      if (m[0] === "EVENT" && m[1] === subId) {
        collected.push(m[2]);
        return false;
      }
      if (m[0] === "CLOSED" && m[1] === subId) {
        throw new HealthcheckError(`the relay refused the ${label} subscription: ${m[2] ?? ""}`);
      }
      return m[0] === "EOSE" && m[1] === subId;
    },
    { timeoutMs, describe: `EOSE on the ${label} subscription` },
  );
  ws.send(
    JSON.stringify(["REQ", subId, { kinds: [PROBE_KIND], authors: [PROBE_PUBKEY], "#d": [dTag] }]),
  );
  await pending;
  ws.send(JSON.stringify(["CLOSE", subId]));
  return collected;
}

/**
 * Full round trip. Resolves with a summary on success; rejects with a
 * HealthcheckError carrying a human-readable hint on any failure.
 */
export async function checkRelay({ url = RELAY_URL, timeoutMs = 8000 } = {}) {
  const started = Date.now();
  const ws = await connect(url, timeoutMs);
  try {
    const now = Math.floor(Date.now() / 1000);

    // A previous run's probe is very likely still stored under this coordinate
    // (that is the point of a replaceable event). Timestamp this run strictly
    // above it — otherwise the relay correctly rejects our "new" probe as the
    // older one, and the read-back below would misreport that as data loss.
    let dTag = PROBE_D_TAG;
    const previous = await fetchStored(ws, "healthcheck-0", timeoutMs, "warm-up", dTag);
    let base = Math.max(now, ...previous.map((e) => e.created_at + 1));
    if (base > now + 300) {
      // Only reachable if a stale probe was stored with a wildly future
      // timestamp. Sidestep it with a fresh coordinate rather than pushing our
      // own events further into the future (relays reject those outright).
      dTag = `${PROBE_D_TAG}:${randomUUID().slice(0, 8)}`;
      base = now;
    }

    const build = (content, createdAt) =>
      finalizeEvent(
        {
          kind: PROBE_KIND,
          created_at: createdAt,
          tags: [
            ["d", dTag],
            ["client", "La Crypta Dev"],
          ],
          content,
        },
        PROBE_SECRET,
      );

    const first = build(JSON.stringify({ probe: "first", at: now }), base);
    const firstInfo = await publish(ws, first, timeoutMs, "first probe");

    const stored = await fetchStored(ws, "healthcheck-1", timeoutMs, "read-back", dTag);
    if (!stored.some((e) => e.id === first.id)) {
      throw new HealthcheckError(
        `the relay accepted the probe event but did not return it (${stored.length} event(s) came back` +
          `${firstInfo ? `, OK message: "${firstInfo}"` : ""})`,
        "the relay acknowledges writes without storing them — this is exactly the silent-failure mode " +
          "that makes voting and project flows look like they work while reading back nothing",
      );
    }

    // NIP-33: same author + kind + d-tag, newer created_at → must REPLACE.
    const replacement = build(JSON.stringify({ probe: "replacement", at: now }), base + 1);
    await publish(ws, replacement, timeoutMs, "replacement probe");

    const after = await fetchStored(ws, "healthcheck-2", timeoutMs, "replacement read-back", dTag);
    const live = after.filter((e) => e.id === first.id || e.id === replacement.id);
    if (live.length !== 1 || live[0].id !== replacement.id) {
      throw new HealthcheckError(
        `parameterized-replaceable (NIP-33) events are not replacing: expected 1 event after the ` +
          `re-publish, got ${live.length}${live.length === 1 ? " (the stale one)" : ""}`,
        "this relay does not implement kind 30078 replacement, so a voter's second ballot would stack " +
          "on top of the first instead of superseding it (see lib/voting.ts: voteDTag / dedupeBallots)",
      );
    }

    return { url, ms: Date.now() - started, storedProbes: after.length };
  } finally {
    ws.close();
  }
}

// ─── CLI ────────────────────────────────────────────────────────────────────

// Path-safe entry check: string-comparing the URL breaks on paths containing
// spaces, `#`, `%` or non-ASCII, which percent-encode in import.meta.url.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const { url, ms } = await checkRelay();
    console.log(`✔ relay healthy at ${url} — publish, read-back and NIP-33 replacement all OK (${ms}ms)`);
    process.exit(0);
  } catch (err) {
    console.error(`✖ relay health check FAILED: ${err.message}`);
    if (err.hint) console.error(`  ${err.hint}`);
    console.error(`\n  Try:  pnpm relay:logs      (what the relay is actually doing)`);
    console.error(`        pnpm relay:down && pnpm relay:up   (restart it)`);
    process.exit(1);
  }
}
