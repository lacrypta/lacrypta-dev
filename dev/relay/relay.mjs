/**
 * La Crypta Dev — local relay control script (`pnpm relay:up|down|logs|check`).
 *
 * Two engines back ws://localhost:7777:
 *
 *   node   (default) — dev/relay/server.mjs, runs on the host arch, no image
 *                      pull, starts in well under a second.
 *   docker           — scsibug/nostr-rs-relay via docker-compose.yml. Opt in
 *                      with RELAY_ENGINE=docker. The published image is
 *                      amd64-only, so on Apple Silicon it needs Rosetta/QEMU
 *                      emulation and may not come up at all.
 *
 * `node` is the default on every arch on purpose: if arm64 machines ran a
 * different relay than amd64 ones, a relay-side bug would show up as an
 * arch-specific app bug. One default, one behaviour.
 *
 * `up` NEVER reports success on faith. Whatever the engine, it finishes by
 * opening a websocket, publishing an event and reading it back (see
 * healthcheck.mjs) — because both engines can fail in ways that leave the
 * command looking fine: `docker compose up -d` exits 0 while the container
 * crash-loops on the wrong arch, and a stale process can hold the port without
 * serving. A non-zero exit here means the relay is genuinely not usable.
 */
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkRelay, RELAY_URL } from "./healthcheck.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPOSE_FILE = join(HERE, "docker-compose.yml");
const DATA_DIR = join(HERE, "data");
const PID_FILE = join(DATA_DIR, "relay.pid");
const LOG_FILE = join(DATA_DIR, "relay.log");
const CONTAINER = "labs-nostr-relay";

const ENGINE = (process.env.RELAY_ENGINE ?? "node").toLowerCase();
if (ENGINE !== "node" && ENGINE !== "docker") {
  fail(`RELAY_ENGINE must be "node" or "docker" (got "${ENGINE}")`);
}

function fail(message, hint) {
  console.error(`✖ ${message}`);
  if (hint) console.error(`  ${hint}`);
  process.exit(1);
}

const run = (cmd, args, opts = {}) =>
  spawnSync(cmd, args, { encoding: "utf8", stdio: "pipe", ...opts });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── node engine ────────────────────────────────────────────────────────────

function readPid() {
  if (!existsSync(PID_FILE)) return null;
  const pid = Number(readFileSync(PID_FILE, "utf8").trim());
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try {
    process.kill(pid, 0); // signal 0 = liveness probe, kills nothing
    return pid;
  } catch {
    rmSync(PID_FILE, { force: true }); // stale pidfile from a crash/reboot
    return null;
  }
}

/** Byte offset of the log at the moment we spawned, so a crash report shows
 *  only this run's output and not a previous run's stack trace. */
let logOffsetAtStart = 0;

async function nodeUp() {
  const running = readPid();
  if (running) {
    console.log(`• relay already running (pid ${running}) — verifying it still serves`);
    return;
  }

  mkdirSync(DATA_DIR, { recursive: true });
  logOffsetAtStart = existsSync(LOG_FILE) ? statSync(LOG_FILE).size : 0;
  const log = openSync(LOG_FILE, "a");
  const child = spawn(process.execPath, [join(HERE, "server.mjs")], {
    detached: true,
    stdio: ["ignore", log, log],
  });
  child.unref();
  writeFileSync(PID_FILE, String(child.pid));
  console.log(`• started dev relay (pid ${child.pid}) → ${LOG_FILE}`);
  await sleep(250); // let it bind (or die on EADDRINUSE) before the first probe
}

/** Bail out of the health-check retry loop the moment the process we started is
 *  gone — the log says why (port in use, bad data file, …), a connect timeout
 *  would not. Only meaningful after `up`; on a bare `check` a missing process
 *  just means the relay was never started. */
function assertNodeAlive() {
  if (ENGINE !== "node" || readPid()) return;
  const output = logSince(logOffsetAtStart);
  fail(
    "the relay process exited right after starting",
    output ? `it logged:\n${output}` : `check ${LOG_FILE}`,
  );
}

function nodeDown() {
  const pid = readPid();
  if (!pid) {
    console.log("• no dev relay running");
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch (err) {
    fail(`could not stop the relay (pid ${pid}): ${err.message}`);
  }
  rmSync(PID_FILE, { force: true });
  console.log(`• stopped dev relay (pid ${pid})`);
}

/** Everything the relay wrote after byte `offset`, capped so a noisy crash stays
 *  readable. Sliced as a Buffer, not a string — the log is full of multi-byte
 *  glyphs, so a character slice at a byte offset lands mid-line. */
function logSince(offset, maxLines = 20) {
  if (!existsSync(LOG_FILE)) return "";
  const text = readFileSync(LOG_FILE).subarray(offset).toString("utf8").trimEnd();
  if (!text) return "";
  return text
    .split("\n")
    .slice(-maxLines)
    .map((line) => `    ${line}`)
    .join("\n");
}

function nodeLogs() {
  if (!existsSync(LOG_FILE)) fail(`no log file yet at ${LOG_FILE}`, "start the relay: pnpm relay:up");
  spawnSync("tail", ["-n", "100", "-f", LOG_FILE], { stdio: "inherit" });
}

// ─── docker engine ──────────────────────────────────────────────────────────

function requireDocker() {
  const probe = run("docker", ["version", "--format", "{{.Server.Arch}}"]);
  if (probe.error || probe.status !== 0) {
    fail(
      "RELAY_ENGINE=docker but the Docker daemon is not reachable",
      "start Docker, or drop RELAY_ENGINE to use the built-in Node relay (pnpm relay:up)",
    );
  }
  return probe.stdout.trim();
}

async function dockerUp() {
  const arch = requireDocker();
  if (arch !== "amd64") {
    console.warn(
      `⚠ Docker is running on ${arch}, but scsibug/nostr-rs-relay only publishes an amd64 image.\n` +
        `  It needs host amd64 emulation (Docker Desktop → "Use Rosetta for x86_64/amd64\n` +
        `  emulation", or tonistiigi/binfmt) and will crash-loop without it. The health check\n` +
        `  below catches that either way — the default Node relay avoids it entirely.`,
    );
  }

  const up = run("docker", ["compose", "-f", COMPOSE_FILE, "up", "-d"], { stdio: "inherit" });
  if (up.status !== 0) fail("`docker compose up -d` failed");

  // `up -d` exits 0 the instant the container is created — an amd64 image on
  // arm64 then dies with "exec format error" and restarts forever. Give it a
  // beat, then read the real state instead of trusting the exit code.
  await sleep(1500);
  const inspect = run("docker", [
    "inspect",
    "-f",
    "{{.State.Status}} {{.State.Restarting}} {{.State.ExitCode}}",
    CONTAINER,
  ]);
  const [status, restarting] = inspect.stdout.trim().split(" ");
  if (inspect.status !== 0 || status !== "running" || restarting === "true") {
    const logs = run("docker", ["logs", "--tail", "20", CONTAINER]);
    fail(
      `the ${CONTAINER} container is not serving (status: ${status || "unknown"}${
        restarting === "true" ? ", crash-looping" : ""
      })`,
      `docker logs ${CONTAINER}:\n${(logs.stdout + logs.stderr).trim() || "(empty)"}\n\n` +
        `  If that says "exec format error", this host has no amd64 emulation and the image\n` +
        `  cannot run here at all. Use the built-in Node relay instead:\n` +
        `      RELAY_ENGINE=docker pnpm relay:down && pnpm relay:up`,
    );
  }
  console.log(`• ${CONTAINER} container is running`);
}

function dockerDown() {
  requireDocker();
  run("docker", ["compose", "-f", COMPOSE_FILE, "down"], { stdio: "inherit" });
}

function dockerLogs() {
  requireDocker();
  spawnSync("docker", ["compose", "-f", COMPOSE_FILE, "logs", "-f"], { stdio: "inherit" });
}

// ─── health check ───────────────────────────────────────────────────────────

/** Retry briefly: the engine is up but may still be a few ms from listening. */
async function verify({ attempts, delayMs, justStarted }) {
  let last;
  for (let i = 0; i < attempts; i++) {
    if (justStarted) assertNodeAlive();
    try {
      return await checkRelay();
    } catch (err) {
      last = err;
      // A protocol-level failure (rejected / not stored / not replacing) is a
      // real verdict, not a warm-up hiccup — no point retrying it.
      if (!/connect|no response|timed out/i.test(err.message)) break;
      if (i < attempts - 1) await sleep(delayMs);
    }
  }
  throw last;
}

/**
 * `justStarted` distinguishes the two callers: after `up` we know a relay
 * should be there, so a slow first connect is worth retrying and a vanished
 * process is a startup crash. A bare `check` gets one quick attempt and a
 * plain "not running" when nothing is listening.
 */
async function check({ justStarted = false } = {}) {
  if (!justStarted && ENGINE === "node" && !readPid()) {
    fail("no dev relay is running", "start it with:  pnpm relay:up");
  }
  try {
    const { url, ms } = await verify({
      attempts: justStarted ? 8 : 2,
      delayMs: 400,
      justStarted,
    });
    console.log(
      `✔ relay healthy at ${url} — publish, read-back and NIP-33 replacement all OK (${ms}ms)`,
    );
  } catch (err) {
    if (justStarted) assertNodeAlive();
    console.error(`✖ relay health check FAILED: ${err.message}`);
    if (err.hint) console.error(`  ${err.hint}`);
    console.error(
      ENGINE === "docker"
        ? `\n  Inspect:  docker logs ${CONTAINER}\n  Fall back to the Node relay:  RELAY_ENGINE=docker pnpm relay:down && pnpm relay:up`
        : `\n  Inspect:  pnpm relay:logs\n  Restart:  pnpm relay:down && pnpm relay:up`,
    );
    process.exit(1);
  }
}

// ─── entrypoint ─────────────────────────────────────────────────────────────

const command = process.argv[2] ?? "up";

switch (command) {
  case "up":
    console.log(`• engine: ${ENGINE}  → ${RELAY_URL}`);
    await (ENGINE === "docker" ? dockerUp() : nodeUp());
    await check({ justStarted: true });
    console.log(`\n  Point the app at it:  NEXT_PUBLIC_NOSTR_RELAYS=${RELAY_URL}`);
    break;
  case "down":
    if (ENGINE === "docker") dockerDown();
    else nodeDown();
    break;
  case "logs":
    if (ENGINE === "docker") dockerLogs();
    else nodeLogs();
    break;
  case "check":
    await check();
    break;
  default:
    fail(`unknown command "${command}"`, "expected one of: up, down, logs, check");
}
