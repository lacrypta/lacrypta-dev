# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Stack note

Next.js **16** with `cacheComponents: true` (see `next.config.ts`), React 19, Tailwind 4, TypeScript strict. The `cacheComponents` flag and the `"use cache"` directive used in `lib/nostrCache.ts` are Next 16-only — do not "fix" them with older patterns. When unsure about Next API surface, read `node_modules/next/dist/docs/01-app/**/*.md` (the AGENTS.md note above is real — APIs differ from earlier versions).

There is no test runner, linter, or CI script wired up. Only `pnpm dev`, `pnpm build`, `pnpm start`. Package manager is pinned via `packageManager` in `package.json` — use pnpm, not npm; there is no `package-lock.json`.

## Hackathon reports pipeline

Per-project markdown reviews live in `data/hackathons/reports/<hackathonId>/<projectSlug>.md`. They are parsed into a single `data/hackathons/reports.json` consumed by the hackathon routes and the `useProjectReport` hook. After editing any markdown report:

```
node scripts/build-hackathon-reports.mjs
```

The parser is regex-based and depends on specific markdown structure (`**Posición:** N°`, `**Score final: X**`, `### <emoji> Name (Model) — score`, `## 💡 Feedback Consolidado` with `### Fortalezas` / `### Áreas de Mejora` lists). New reports must follow that shape or fields will silently parse as `null`/empty.

## Two-source content model

Project content comes from **both** curated JSON and community Nostr events, merged at view time:

- **Curated** — `data/hackathons/projects-<id>.json` (typed in `lib/hackathons.ts`) and `lib/projects.ts` (homepage list). Static, in-tree, edited by maintainers.
- **Community** — NIP-78 parameterized replaceable events (`kind 30078`) carrying the `t` tag `lacrypta-dev-project` and a `d` tag `lacrypta.dev:project:<id>`. Published from the dashboard, signed with the user's own key.

`lib/hackathons.ts:mergeWithSubmissions()` is the canonical merge: curated wins on id collisions, ordered by report rank; Nostr submissions follow, freshest first. When adding a new project field, update **both** the curated JSON shape (`HackathonProject`) and the Nostr serialization in `lib/userProjects.ts:buildProjectEvent` + `parseProjectContent` — they must round-trip.

## Server vs. client Nostr code

`lib/nostrCache.ts` and `lib/userProjects.ts` look like duplicates but are not interchangeable:

- `lib/nostrCache.ts` is **server-only** (no `"use client"`). It uses `"use cache"` + `cacheLife("hours")` + `cacheTag("nostr:hackathon-submissions")` so a single relay round-trip backs the sitemap, dynamic OG images, and SSR project pages. Revalidate via `POST /api/revalidate-nostr` with header `x-revalidate-secret: $REVALIDATE_SECRET` (defaults to the global submissions tag if no body).
- `lib/userProjects.ts` is `"use client"`. It owns publish/sign, localStorage caching (`labs:user-projects-v2:<pubkey>`, `labs:community-projects:v1`), and the live community-scan progress UI.

Don't import the client module from server code; don't add `"use cache"` to the client one. If a parser changes, update both.

## Signing & auth

Three signer methods, all wired through `lib/nostrSigner.ts:getSigner(auth)`:

1. **`nip07`** — browser extension (`window.nostr`). `lib/auth.ts:waitForNostrSigner` polls because extensions inject async; `probeSignerAvailable` also confirms the extension's pubkey still matches the stored session and auto-logouts on mismatch.
2. **`nip46`** — remote bunker. Two transports coexist:
   - QR-originated sessions persist `auth.bunker.encryption` (`"nip44"` or `"nip04"`) and use the in-tree `lib/nip46Client.ts`. This exists because `nostr-tools/nip46`'s `BunkerSigner` is NIP-44 only, which breaks against Amber (defaults to NIP-04). The custom client auto-detects on first decrypt and locks the version for the session.
   - Legacy paste-flow sessions (no `encryption` field) keep using `BunkerSigner` directly.
3. **`local`** — nsec stored in `localStorage` as `auth.localSecret` (32-byte array). Throwaway/dev only.

Auth state lives in `localStorage` under `labs:auth`. Mutations dispatch a `labs:auth:changed` event so `useAuth` (and other tabs via `storage`) re-render. Use `clearAuth(reason)` not `localStorage.removeItem` — the reason is read by the login modal to show contextual messages.

## Environment variables

- `LACRYPTA_NSEC` — **server-only** signing key for La Crypta's official events (reports, results). Never prefix with `NEXT_PUBLIC_`.
- `NEXT_PUBLIC_LACRYPTA_NPUB` — public key, used for Nostr filter `authors`, admin guard, and signature verification. Decoded to hex on demand and cached on `window.__lcpk__` (see `lib/nostrReports.ts:resolveLacryptaPubkey`).
- `REVALIDATE_SECRET` — gates `/api/revalidate-nostr`.

## Conventions worth knowing

- **User-facing copy is Spanish** (`lang="es"`, locale `es_AR`). Identifiers and most code comments are English; some error messages thrown to users are Spanish on purpose — keep them Spanish.
- **Path alias** `@/*` resolves to the repo root (e.g. `@/lib/hackathons`, `@/components/ui/PageHero`).
- **Theme tokens** live in `app/globals.css` as CSS custom properties exposed through Tailwind 4's `@theme inline` block. Use semantic names (`bg-background-card`, `text-foreground-muted`, `text-bitcoin`, `text-nostr`, `text-lightning`, `text-cyan`) — they're the contract, not raw hex.
- **Fonts** are exposed as `--font-sans` (Inter), `--font-display` (Space Grotesk), `--font-mono` (JetBrains Mono). Headings already default to display.
- **Modals must use** `lib/useScrollLock.ts` — it sets `data-scroll-lock` on `<html>` and a `--sbw` CSS var to compensate for the scrollbar gutter on the body and `header.fixed`. Bypassing it causes layout shift.
- **All Nostr events La Crypta publishes** carry a `["client", "La Crypta Dev"]` tag — match it on new event types.
- **Sitemap is split**: `sitemap/static.xml` (curated) and `sitemap/nostr.xml` (community submissions, deduped against curated). Both are declared in `app/sitemap.ts:generateSitemaps`. The Nostr sitemap shares the cached relay round-trip with project pages — don't add a second uncached fetch.
- **`/dashboard` and `/api` are noindex** (`app/robots.ts`). Per-page `metadata.robots: { index: false }` exists for the same reason on dashboard subroutes.
