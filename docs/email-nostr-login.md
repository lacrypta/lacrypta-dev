# Email Nostr Login For Lacrypta Subdomains

La Crypta Dev can issue email magic links for partner projects. The partner app
collects the email address, asks `lacrypta.dev` to send the link, then consumes
the token from its own callback page.

The standard integration is browser CORS. Partner apps do not need a backend for
the callback.

## Flow

1. The partner frontend calls `POST https://lacrypta.dev/api/auth/email/request`
   with the user's email and its callback URL.
2. `lacrypta.dev` normalizes the email, derives the user's deterministic Nostr
   key from `LACRYPTA_NSEC`, creates a signed encrypted token, and sends the
   email.
3. The email link opens the partner callback URL, for example
   `https://figus.lacrypta.dev/auth/lacrypta-email?token=...`.
4. The partner callback page calls
   `POST https://lacrypta.dev/api/auth/email/consume` from the browser.
5. `lacrypta.dev` verifies the token signature, expiry, encrypted audience, and
   browser `Origin`. If the token audience matches the caller origin, it returns
   `{ nsec, pubkey, redirectTo }`.
6. The partner stores the returned `nsec` as its local Nostr identity and
   redirects within the app.

## Allowed Callback URLs

Allowed automatically:

- `https://*.lacrypta.dev/...`
- `https://lacrypta.dev/login/email` for La Crypta Dev's own login page
- local development origins when `NODE_ENV !== "production"`

Allowed by env:

```bash
EMAIL_LOGIN_ALLOWED_CALLBACK_URLS=https://figus.world/auth/lacrypta-email,https://example.com/auth/lacrypta-email
```

External entries are exact callback URLs. They must include `https://`, host,
and path. Query strings, hashes, URL credentials, `/api` paths, and
`/login/email` partner callbacks are rejected.

## Request Endpoint

`POST https://lacrypta.dev/api/auth/email/request`

Headers:

```http
Content-Type: application/json
Origin: https://figus.lacrypta.dev
```

Body:

```json
{
  "email": "user@example.com",
  "callbackUrl": "https://figus.lacrypta.dev/auth/lacrypta-email",
  "redirectTo": "/packs"
}
```

Response:

```json
{
  "ok": true,
  "id": "resend-email-id",
  "callbackUrl": "https://figus.lacrypta.dev/auth/lacrypta-email"
}
```

If `callbackUrl` is omitted, the legacy first-party flow is preserved and the
email link points to `NEXT_PUBLIC_SITE_URL/login/email`.

The request `Origin`, when present, must match the callback URL origin. This
prevents one site from asking La Crypta to mint a token for another site's
callback.

## Consume Endpoint

`POST https://lacrypta.dev/api/auth/email/consume`

Headers:

```http
Content-Type: application/json
Origin: https://figus.lacrypta.dev
```

Body:

```json
{
  "token": "<token from callback URL>"
}
```

Response:

```json
{
  "nsec": "nsec1...",
  "pubkey": "<hex pubkey>",
  "redirectTo": "/packs"
}
```

The consume endpoint requires the browser `Origin` to match the encrypted token
audience. CORS is not the only security check; the token is the bearer
authorization artifact and is signed by La Crypta.

## Browser Helper Example

```ts
const LACRYPTA_LOGIN_API = "https://lacrypta.dev";
const CALLBACK_PATH = "/auth/lacrypta-email";

export async function requestEmailLogin(email: string, redirectTo = "/") {
  const callbackUrl = new URL(CALLBACK_PATH, window.location.origin).toString();
  const res = await fetch(`${LACRYPTA_LOGIN_API}/api/auth/email/request`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, callbackUrl, redirectTo }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Could not send login email.");
  return data;
}

export async function consumeEmailLogin(token: string) {
  const res = await fetch(`${LACRYPTA_LOGIN_API}/api/auth/email/consume`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Could not consume login token.");
  return data as { nsec: string; pubkey: string; redirectTo: string };
}
```

## Callback Page Responsibilities

The partner callback page should:

- Read `token` from `window.location.search`.
- Call `consumeEmailLogin(token)` from the browser.
- Validate that the returned `nsec` decodes as a NIP-19 `nsec`.
- Store it using the app's existing local Nostr identity path.
- Redirect to `redirectTo`, falling back to a safe in-app path.

For Figus, the final persistence step is:

```ts
import { importLocalNsec } from "@/lib/identity";

importLocalNsec(data.nsec);
```

For La Crypta Dev's local auth shape, the equivalent is:

```ts
import { setAuth } from "@/lib/auth";

const { decode } = await import("nostr-tools/nip19");
const decoded = decode(data.nsec);
if (decoded.type !== "nsec") throw new Error("Invalid nsec.");

setAuth({
  method: "local",
  pubkey: data.pubkey,
  localSecret: Array.from(decoded.data as Uint8Array),
});
```

## CORS Smoke Check

With a local or deployed server running:

```bash
node scripts/email-login-cors-smoke.mjs http://localhost:3000 https://figus.lacrypta.dev
```

The allowed origin should be echoed for both `/request` and `/consume`.
