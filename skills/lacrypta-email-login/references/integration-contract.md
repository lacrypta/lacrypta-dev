# lacrypta.dev Email Login Contract

Base URL: `https://lacrypta.dev`

Callback path installed by default: `/auth/lacrypta-email`

## Request

`POST /api/auth/email/request`

```json
{
  "email": "user@example.com",
  "callbackUrl": "https://project.lacrypta.dev/auth/lacrypta-email",
  "redirectTo": "/"
}
```

The browser `Origin`, when present, must equal the callback URL origin.

If `callbackUrl` is omitted, La Crypta Dev's own `/login/email` callback is used.

## Consume

`POST /api/auth/email/consume`

```json
{ "token": "<token from callback URL>" }
```

Returns:

```json
{
  "nsec": "nsec1...",
  "pubkey": "<hex pubkey>",
  "redirectTo": "/"
}
```

The consume request must be made from the browser callback page. The browser
`Origin` must match the encrypted token audience.

## Allowed Callbacks

Allowed automatically:

- `https://*.lacrypta.dev/...`
- La Crypta Dev first-party `https://lacrypta.dev/login/email`

Allowed manually on the La Crypta side:

```bash
EMAIL_LOGIN_ALLOWED_CALLBACK_URLS=https://example.com/auth/lacrypta-email
```

The allowlist is exact. Query strings, hashes, URL credentials, `/api` callback
paths, and partner `/login/email` callbacks are rejected.

## Security Notes

- The token is a signed Nostr event with encrypted content, not a plaintext JWT.
- The encrypted content includes `email`, `exp`, `nsec`, `audOrigin`,
  `callbackUrl`, and `redirectTo`.
- CORS is browser enforcement. The token remains the bearer authorization
  artifact, and consume still checks signature, expiry, allowed callback, and
  `Origin`.
- The same normalized email derives the same Nostr key across integrations.
