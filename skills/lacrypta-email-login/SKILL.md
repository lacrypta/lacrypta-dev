---
name: lacrypta-email-login
description: Add or migrate email-based Nostr login in a web app to the centralized lacrypta.dev browser-CORS issuer. Use when a project on a lacrypta.dev subdomain or an explicitly allowlisted external domain needs magic-link email login, when replacing local MAGIC_SECRET/Resend magic links, or when benchmarking the integration against Negr087/figus.
---

# Lacrypta Email Login

## Workflow

1. Inspect the target app's routing, auth storage, and email-login UI. Prefer existing local Nostr identity helpers over inventing a new auth shape.
2. Run the bundled installer from the target repo root:

```bash
python /path/to/skills/lacrypta-email-login/scripts/install_lacrypta_email_login.py .
```

Use `--force` only after reviewing generated files that already exist.

3. Wire the existing email form to the generated helper:

```ts
import { requestLacryptaEmailLogin } from "@/lib/lacryptaEmailLogin";

await requestLacryptaEmailLogin({ email, redirectTo: "/" });
```

4. Confirm the callback page exists at `/auth/lacrypta-email` and persists the identity through the generated `persistLacryptaEmailIdentity` adapter.
5. Remove or bypass the app's old local magic-token issuer only when the user asked for migration. Keep unrelated NIP-07/NIP-46/local-key login paths intact.
6. Validate with the app's build/typecheck command.

## Generated Files

The installer detects `app/` vs `src/app/`, `@/*` path aliases, package manager, and known adapters:

- Figus: uses `importLocalNsec(data.nsec)` from `@/lib/identity`.
- La Crypta Dev: uses `setAuth({ method: "local", pubkey, localSecret })`.
- Generic: stores `lacrypta:email-login:nsec` and dispatches a browser event for manual wiring.

Generated files:

- `lib/lacryptaEmailLogin.ts`: browser helper for request/consume.
- `lib/lacryptaEmailLoginAdapter.ts`: app-specific persistence adapter.
- `app/auth/lacrypta-email/page.tsx`: callback route.
- `app/auth/lacrypta-email/LacryptaEmailLoginClient.tsx`: browser consume/persist/redirect flow.

## Figus Migration Notes

For `Negr087/figus`, replace the `fetch("/api/auth/email/request", ...)` call in `src/components/Connect.tsx` with `requestLacryptaEmailLogin({ email: normalized, redirectTo: window.location.hash || "/" })`.

After the helper is wired, the old Figus files become unused and can be removed if the migration scope allows it:

- `src/app/api/auth/email/request/route.ts`
- `src/app/auth/magic/page.tsx`
- `src/app/auth/magic/MagicLinkClient.tsx`
- `src/lib/magicToken.ts`
- `MAGIC_SECRET`, `RESEND_API_KEY`, and `MAGIC_FROM_EMAIL` from `.env.example`

Do not remove unrelated issuer, Lightning, NIP-07, NIP-46, or local-key flows.

## Contract Reference

Read `references/integration-contract.md` when implementing a custom callback, debugging CORS, adding an external allowlist entry, or explaining security tradeoffs.
