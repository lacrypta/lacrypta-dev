<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Local dev environment (isolated Nostr)

**Why this exists.** Nostr events can never be deleted once a relay accepts them. Testing flows that publish — community voting, project submissions, badges — against public relays with La Crypta's real key would permanently pollute production. So local dev runs against an **isolated local relay** signed by a **throwaway dev key**, and surfaces a **DEV MODE bar** for impersonating accounts. Three independent pillars, all off by default:

1. **Local relay** — `dev/relay/` serves `ws://localhost:7777`. It implements parameterized-replaceable events (kind 30078 / NIP-33), so ballot re-votes replace correctly. Nothing published here leaves the machine. See [Relay engines](#relay-engines) for what actually runs.
2. **Dev keypair** — a throwaway key, **never** the production nsec. Generate with `pnpm gen:dev-keys`; it prints the `.env.local` lines below.
3. **`NEXT_PUBLIC_DEV_MODE=true`** — gates the DEV MODE bar (`components/DevModeBar.tsx`) and impersonation. `isDevMode()` in `lib/devMode.ts` is the single check (build-time inlined, hydration-safe).

### Setup

```bash
pnpm install
pnpm gen:dev-keys          # prints dev keys — paste the block into .env.local
pnpm relay:up              # start + health-check the local relay (ws://localhost:7777)
pnpm dev                   # NEXT_PUBLIC_DEV_MODE=true → DEV MODE bar appears
# pnpm relay:logs / pnpm relay:down to tail / stop the relay
# pnpm relay:check to re-verify a running relay at any time
```

### Relay engines

`pnpm relay:up` runs **`dev/relay/server.mjs`** — a small in-tree Node relay (NIP-01 + NIP-09 + NIP-11, full replaceable/ephemeral/parameterized-replaceable semantics). It runs on the host arch, needs no Docker and no image pull, and persists to `dev/relay/data/events.jsonl` (gitignored, append-only, compacted on restart). One engine on every machine, by design: if arm64 and amd64 devs ran different relays, a relay-side bug would surface as an arch-specific app bug.

The original **`nostr-rs-relay` (Docker)** setup is still here as an opt-in:

```bash
RELAY_ENGINE=docker pnpm relay:up      # also :down / :logs / :check
```

⚠ `scsibug/nostr-rs-relay` publishes an **amd64-only** image, so on Apple Silicon it needs host amd64 emulation (Docker Desktop → "Use Rosetta for x86_64/amd64 emulation", or `tonistiigi/binfmt`). Without it the container starts and crash-loops on `exec /bin/sh: exec format error`. `docker-compose.yml` now declares `platform: linux/amd64` so Docker routes it through emulation rather than running it natively — necessary, but not sufficient on a host with no amd64 emulator.

### The relay never "succeeds" silently

`pnpm relay:up` finishes by actually using the relay (`dev/relay/healthcheck.mjs`): it opens a websocket, publishes a kind-30078 event, reads it back, republishes under the same `d` tag and asserts the result **replaced** rather than stacked. It exits non-zero and prints the engine's logs if any step fails.

This exists because every cheaper signal lies. `docker compose up -d` exits 0 the moment the container is *created* — an amd64 image on arm64 then crash-loops behind a successful-looking command. And `pool.publish()` resolves "fulfilled" as soon as a socket accepts the frame, so a relay that stores nothing lets voting and project flows look like they work while every read comes back empty. A port check would pass in both cases. The NIP-33 assertion is the one the app genuinely depends on: ballots are kind 30078 + `d = lacrypta.dev:vote:<hackathonId>` (`lib/voting.ts`), and a relay without replacement would stack a voter's second ballot on top of the first instead of superseding it.

### The DEV MODE bar

A fixed 32px strip above the header (header shifts to `top-8`, `<main>` gets `pt-8` — both gated by `isDevMode()`, no per-page edits). Its switcher (backed by `lib/useDevIdentities.ts`, shared with `/dev/voting`) lets you:

- Generate throwaway identities; log in as any of them.
- **"Entrar como La Crypta (admin)"** via `NEXT_PUBLIC_DEV_ADMIN_NSEC` to open/close voting.
- **Impersonate any soldier with a linked Nostr pubkey** (listed under "Soldados con Nostr", also available as an "Impersonar" button on each `/soldados/[slug]` profile).
- **"Generar datos dummy"** — seed a complete fake dataset (see below).

### Impersonation model (stand-in keys)

We never hold real users' secret keys, so impersonating a user logs in with a **deterministic dev stand-in key** derived from their pubkey (`lib/devImpersonation.ts`: `sha256("lacrypta-dev-impersonation:v1:" + pubkey)`). To make this consistent across the app:

- **Voting** (`app/api/hackathons/[id]/voting/route.ts`): in dev mode the eligibility snapshot is remapped real-pubkey → stand-in, so impersonated users are eligible and self-vote blocks/budgets are preserved.
- **Reads** (`/dashboard/projects`, `/dashboard/hackathones`): `auth.impersonating` holds the real pubkey; in dev these read the impersonated user's data by it.

`lib/voting.ts` (the shared contract) is untouched — all dev behaviour is gated by `isDevMode()`.

### Dummy data generator ("complete dev")

`lib/devSeed.ts` (`generateDummyData`, triggered by the bar's "Generar datos dummy") creates 8 dummy users + ~14 projects across hackathons and publishes **real kind-0 profiles + kind-30078 project events, each signed by that user's own key**, to the local relay. Because they go through the same event shapes the app reads, the dummy users automatically become soldiers (impersonatable + voting-eligible) with vote budgets matching their hackathon count, and their projects appear on hackathon pages, `/projects`, and the dashboard. The generated **nsecs are stored** in `localStorage["labs:dev:dummy-users:v1"]` and logged to the console. After seeding, the client flushes the roster cache via the dev-only `POST /api/dev/revalidate` (gated by `isDevMode()`, no secret needed).

`/dashboard/hackathones` ("Mis hackatones") shows the logged-in (or impersonated) user's hackathon participations grouped by hackathon, derived from their Nostr projects.

### Env vars (all dev-only; see `.env.example`)

| Var | Effect |
| --- | --- |
| `NEXT_PUBLIC_DEV_MODE` | `true` → DEV MODE bar + impersonation. |
| `NEXT_PUBLIC_NOSTR_RELAYS` | Comma-separated relay override. `ws://localhost:7777` routes **all** traffic local. Single chokepoint in `lib/nostrRelayConfig.ts`. |
| `NEXT_PUBLIC_DEV_ADMIN_NSEC` | Browser-side dev admin secret for the one-click admin login. Must match `NEXT_PUBLIC_LACRYPTA_ADMIN_NPUB`. |
| `LACRYPTA_NSEC` / `NEXT_PUBLIC_LACRYPTA_ADMIN_NPUB` | In dev, set both to the throwaway keypair from `gen:dev-keys`. |
| `RELAY_ENGINE` | `node` (default) → in-tree `dev/relay/server.mjs`. `docker` → `nostr-rs-relay` via `docker-compose.yml`. Read by `pnpm relay:*` only — not by the app. |
| `RELAY_PORT` / `RELAY_HOST` | Node relay bind overrides (default `7777` / `127.0.0.1`). Change both here and in `NEXT_PUBLIC_NOSTR_RELAYS`. |

> ⚠️ **Never set `NEXT_PUBLIC_DEV_MODE`, `NEXT_PUBLIC_DEV_ADMIN_NSEC`, or `NEXT_PUBLIC_NOSTR_RELAYS` in a production deploy.** They expose impersonation UI and a signing secret to the browser. Production leaves all three unset — the app falls back to the real relays and the bar never renders.
