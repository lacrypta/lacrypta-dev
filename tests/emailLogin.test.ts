import assert from "node:assert/strict";
import test from "node:test";
import {
  consumeEmailLoginToken,
  createEmailLoginToken,
  EMAIL_LOGIN_TTL_SECONDS,
} from "../lib/emailLogin";
import {
  assertEmailLoginOriginMatchesAudience,
  emailLoginCorsHeaders,
  resolveEmailLoginDestination,
} from "../lib/emailLoginDestinations";

const rootSecret = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const now = 1_800_000_000;
const siteUrl = "https://lacrypta.dev";

process.env.NEXT_PUBLIC_SITE_URL = siteUrl;
process.env.EMAIL_LOGIN_ALLOWED_CALLBACK_URLS =
  "https://figus.world/auth/lacrypta-email";

test("creates and consumes a token bound to a lacrypta.dev subdomain", async () => {
  const destination = resolveEmailLoginDestination({
    callbackUrl: "https://figus.lacrypta.dev/auth/lacrypta-email",
    redirectTo: "/packs?team=argentina",
    siteUrl,
  });
  const { nsec, pubkey, token } = await createEmailLoginToken(
    rootSecret,
    "user@example.com",
    destination,
    now,
  );

  const consumed = await consumeEmailLoginToken(rootSecret, token, now + 1);
  assert.equal(consumed.audOrigin, "https://figus.lacrypta.dev");
  assert.equal(consumed.callbackUrl, "https://figus.lacrypta.dev/auth/lacrypta-email");
  assert.equal(consumed.redirectTo, "/packs?team=argentina");
  assert.equal(consumed.nsec, nsec);
  assert.equal(consumed.pubkey, pubkey);
  assert.doesNotThrow(() =>
    assertEmailLoginOriginMatchesAudience("https://figus.lacrypta.dev", consumed.audOrigin),
  );
});

test("keeps the same email-derived nsec across allowed destinations", async () => {
  const first = resolveEmailLoginDestination({
    callbackUrl: "https://figus.lacrypta.dev/auth/lacrypta-email",
    siteUrl,
  });
  const second = resolveEmailLoginDestination({
    callbackUrl: "https://figus.world/auth/lacrypta-email",
    siteUrl,
  });

  const firstToken = await createEmailLoginToken(
    rootSecret,
    "USER@example.com",
    first,
    now,
  );
  const secondToken = await createEmailLoginToken(
    rootSecret,
    "user@example.com",
    second,
    now,
  );
  assert.equal(firstToken.nsec, secondToken.nsec);
  assert.equal(firstToken.pubkey, secondToken.pubkey);
});

test("rejects wrong consume origins", async () => {
  assert.throws(
    () =>
      assertEmailLoginOriginMatchesAudience(
        "https://figus.lacrypta.dev.evil.com",
        "https://figus.lacrypta.dev",
      ),
    /Origin no coincide/,
  );
});

test("rejects expired and malformed tokens", async () => {
  const destination = resolveEmailLoginDestination({
    callbackUrl: "https://figus.lacrypta.dev/auth/lacrypta-email",
    siteUrl,
  });
  const { token } = await createEmailLoginToken(
    rootSecret,
    "user@example.com",
    destination,
    now,
  );

  await assert.rejects(
    () =>
      consumeEmailLoginToken(
        rootSecret,
        token,
        now + EMAIL_LOGIN_TTL_SECONDS + 1,
      ),
    /expiro/,
  );
  await assert.rejects(
    () => consumeEmailLoginToken(rootSecret, "not-a-token", now),
    /invalido/,
  );
});

test("validates callback URL security rules", () => {
  assert.equal(
    resolveEmailLoginDestination({
      callbackUrl: "https://figus.lacrypta.dev/auth/lacrypta-email",
      siteUrl,
    }).kind,
    "lacrypta-subdomain",
  );
  assert.equal(
    resolveEmailLoginDestination({
      callbackUrl: "https://figus.world/auth/lacrypta-email",
      siteUrl,
    }).kind,
    "external",
  );
  assert.throws(
    () =>
      resolveEmailLoginDestination({
        callbackUrl: "https://figus.lacrypta.dev.evil.com/auth/lacrypta-email",
        siteUrl,
      }),
    /no esta permitida/,
  );
  assert.throws(
    () =>
      resolveEmailLoginDestination({
        callbackUrl: "https://figus.lacrypta.dev/auth/lacrypta-email?x=1",
        siteUrl,
      }),
    /query/,
  );
  assert.throws(
    () =>
      resolveEmailLoginDestination({
        callbackUrl: "https://user:pass@figus.lacrypta.dev/auth/lacrypta-email",
        siteUrl,
      }),
    /credenciales/,
  );
  assert.throws(
    () =>
      resolveEmailLoginDestination({
        callbackUrl: "https://figus.lacrypta.dev/api/auth/email",
        siteUrl,
      }),
    /\/api/,
  );
  assert.throws(
    () =>
      resolveEmailLoginDestination({
        callbackUrl: "https://figus.lacrypta.dev/login/email",
        siteUrl,
      }),
    /login interno/,
  );
});

test("preserves the own-site lacrypta.dev login flow", async () => {
  const destination = resolveEmailLoginDestination({
    redirectTo: "/dashboard",
    siteUrl,
  });
  assert.equal(destination.kind, "first-party");
  assert.equal(destination.audOrigin, "https://lacrypta.dev");
  assert.equal(destination.callbackUrl, "https://lacrypta.dev/login/email");

  const { token } = await createEmailLoginToken(
    rootSecret,
    "user@example.com",
    destination,
    now,
  );
  const consumed = await consumeEmailLoginToken(rootSecret, token, now + 1);
  assert.equal(consumed.redirectTo, "/dashboard");
  assert.doesNotThrow(() =>
    assertEmailLoginOriginMatchesAudience("https://lacrypta.dev", consumed.audOrigin),
  );
});

test("sets exact CORS headers only for allowed origins", () => {
  const allowed = new Headers(
    emailLoginCorsHeaders("https://figus.lacrypta.dev", siteUrl),
  );
  assert.equal(
    allowed.get("access-control-allow-origin"),
    "https://figus.lacrypta.dev",
  );
  assert.equal(allowed.get("cache-control"), "no-store");
  assert.equal(allowed.get("vary"), "Origin");

  const rejected = new Headers(
    emailLoginCorsHeaders("https://figus.lacrypta.dev.evil.com", siteUrl),
  );
  assert.equal(rejected.get("access-control-allow-origin"), null);
});
