import {
  DEFAULT_LOGIN_REDIRECT,
  safeLoginRedirect,
} from "./loginRedirect";

export const EMAIL_LOGIN_CALLBACK_PATH = "/login/email";
export const LACRYPTA_EMAIL_LOGIN_DOMAIN = "lacrypta.dev";

const CALLBACK_ALLOWLIST_ENV = "EMAIL_LOGIN_ALLOWED_CALLBACK_URLS";

type CallbackKind = "first-party" | "lacrypta-subdomain" | "external";

export type EmailLoginDestination = {
  audOrigin: string;
  callbackUrl: string;
  kind: CallbackKind;
  redirectTo: string;
};

export class EmailLoginDestinationError extends Error {
  status = 400;
}

function destinationError(message: string): never {
  throw new EmailLoginDestinationError(message);
}

function isLocalhost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

function isHttpsOrLocalDev(url: URL): boolean {
  if (url.protocol === "https:") return true;
  return process.env.NODE_ENV !== "production" && url.protocol === "http:" && isLocalhost(url.hostname);
}

function isLacryptaSubdomain(url: URL): boolean {
  return (
    url.protocol === "https:" &&
    url.hostname !== LACRYPTA_EMAIL_LOGIN_DOMAIN &&
    url.hostname.endsWith(`.${LACRYPTA_EMAIL_LOGIN_DOMAIN}`)
  );
}

function normalizePath(pathname: string): string {
  if (!pathname || pathname === "/") return "/";
  return pathname.endsWith("/") && pathname.length > 1
    ? pathname.slice(0, -1)
    : pathname;
}

function parseUrl(raw: string, label: string): URL {
  try {
    return new URL(raw);
  } catch {
    destinationError(`${label} invalida.`);
  }
}

function validateCallbackShape(url: URL, allowOwnLoginPage: boolean) {
  if (url.username || url.password) {
    destinationError("La URL de callback no puede incluir credenciales.");
  }
  if (url.search) {
    destinationError("La URL de callback no puede incluir query params.");
  }
  if (url.hash) {
    destinationError("La URL de callback no puede incluir hash.");
  }
  if (!isHttpsOrLocalDev(url)) {
    destinationError("La URL de callback debe usar HTTPS.");
  }

  const path = normalizePath(url.pathname);
  if (path === "/api" || path.startsWith("/api/")) {
    destinationError("La URL de callback no puede apuntar a /api.");
  }
  if (
    !allowOwnLoginPage &&
    (path === EMAIL_LOGIN_CALLBACK_PATH ||
      path.startsWith(`${EMAIL_LOGIN_CALLBACK_PATH}/`))
  ) {
    destinationError("La URL de callback no puede apuntar al login interno.");
  }
}

export function normalizeEmailLoginCallbackUrl(
  rawCallbackUrl: string,
  options: { allowOwnLoginPage?: boolean } = {},
): string {
  const url = parseUrl(rawCallbackUrl.trim(), "URL de callback");
  url.hostname = url.hostname.toLowerCase();
  validateCallbackShape(url, options.allowOwnLoginPage === true);
  return url.toString();
}

export function normalizeEmailLoginOrigin(rawOrigin: string | null): string | null {
  if (!rawOrigin || rawOrigin === "null") return null;
  try {
    const url = new URL(rawOrigin);
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      return null;
    }
    if (!isHttpsOrLocalDev(url)) return null;
    url.hostname = url.hostname.toLowerCase();
    return url.origin;
  } catch {
    return null;
  }
}

function normalizeSiteOrigin(siteUrl?: string): string | null {
  if (!siteUrl?.trim()) return null;
  try {
    const url = new URL(siteUrl.trim());
    if (!isHttpsOrLocalDev(url)) return null;
    url.hostname = url.hostname.toLowerCase();
    return url.origin;
  } catch {
    return null;
  }
}

function isFirstPartyLoginCallback(url: URL, siteUrl?: string): boolean {
  const path = normalizePath(url.pathname);
  if (path !== EMAIL_LOGIN_CALLBACK_PATH) return false;
  if (url.protocol === "https:" && url.hostname === LACRYPTA_EMAIL_LOGIN_DOMAIN) {
    return true;
  }
  const siteOrigin = normalizeSiteOrigin(siteUrl);
  return !!siteOrigin && url.origin === siteOrigin;
}

function allowedExternalCallbackUrls(): Set<string> {
  const raw = process.env[CALLBACK_ALLOWLIST_ENV]?.trim();
  if (!raw) return new Set();

  const urls = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => normalizeEmailLoginCallbackUrl(value));
  return new Set(urls);
}

function callbackKind(
  callbackUrl: string,
  options: { allowOwnLoginPage?: boolean; siteUrl?: string } = {},
): CallbackKind | null {
  const url = parseUrl(callbackUrl, "URL de callback");
  if (options.allowOwnLoginPage && isFirstPartyLoginCallback(url, options.siteUrl)) {
    return "first-party";
  }
  if (isLacryptaSubdomain(url)) return "lacrypta-subdomain";
  if (allowedExternalCallbackUrls().has(callbackUrl)) return "external";
  return null;
}

export function isAllowedEmailLoginOrigin(
  rawOrigin: string | null,
  siteUrl?: string,
): boolean {
  const origin = normalizeEmailLoginOrigin(rawOrigin);
  if (!origin) return false;

  const url = parseUrl(origin, "Origin");
  if (isLacryptaSubdomain(url)) return true;
  if (url.protocol === "https:" && url.hostname === LACRYPTA_EMAIL_LOGIN_DOMAIN) {
    return true;
  }

  const siteOrigin = normalizeSiteOrigin(siteUrl);
  if (siteOrigin && origin === siteOrigin) return true;

  for (const callbackUrl of allowedExternalCallbackUrls()) {
    if (new URL(callbackUrl).origin === origin) return true;
  }
  return false;
}

export function resolveEmailLoginDestination({
  callbackUrl,
  redirectTo,
  siteUrl,
}: {
  callbackUrl?: string;
  redirectTo?: string;
  siteUrl: string;
}): EmailLoginDestination {
  const safeRedirectTo = safeLoginRedirect(redirectTo, DEFAULT_LOGIN_REDIRECT);

  if (!callbackUrl?.trim()) {
    const siteOrigin = normalizeSiteOrigin(siteUrl);
    if (!siteOrigin) destinationError("NEXT_PUBLIC_SITE_URL invalida.");
    const ownCallbackUrl = normalizeEmailLoginCallbackUrl(
      new URL(EMAIL_LOGIN_CALLBACK_PATH, siteOrigin).toString(),
      { allowOwnLoginPage: true },
    );
    return {
      audOrigin: new URL(ownCallbackUrl).origin,
      callbackUrl: ownCallbackUrl,
      kind: "first-party",
      redirectTo: safeRedirectTo,
    };
  }

  const normalizedCallbackUrl = normalizeEmailLoginCallbackUrl(callbackUrl);
  const kind = callbackKind(normalizedCallbackUrl, { siteUrl });
  if (!kind) {
    destinationError(
      "La URL de callback no esta permitida. Usa un subdominio de lacrypta.dev o agregala a EMAIL_LOGIN_ALLOWED_CALLBACK_URLS.",
    );
  }

  return {
    audOrigin: new URL(normalizedCallbackUrl).origin,
    callbackUrl: normalizedCallbackUrl,
    kind,
    redirectTo: safeRedirectTo,
  };
}

export function validateEmailLoginTokenDestination({
  audOrigin,
  callbackUrl,
  redirectTo,
  siteUrl,
}: {
  audOrigin: string;
  callbackUrl: string;
  redirectTo: string;
  siteUrl?: string;
}) {
  const normalizedCallbackUrl = normalizeEmailLoginCallbackUrl(callbackUrl, {
    allowOwnLoginPage: true,
  });
  const kind = callbackKind(normalizedCallbackUrl, {
    allowOwnLoginPage: true,
    siteUrl,
  });
  if (!kind) destinationError("La audiencia del token ya no esta permitida.");

  const callbackOrigin = new URL(normalizedCallbackUrl).origin;
  if (callbackOrigin !== audOrigin) {
    destinationError("La audiencia del token no coincide con el callback.");
  }
  if (safeLoginRedirect(redirectTo, DEFAULT_LOGIN_REDIRECT) !== redirectTo) {
    destinationError("El redirect del token no es valido.");
  }
}

export function assertEmailLoginOriginMatchesAudience(
  rawOrigin: string | null,
  audOrigin: string,
) {
  const origin = normalizeEmailLoginOrigin(rawOrigin);
  if (!origin) destinationError("Falta Origin valido.");
  if (origin !== audOrigin) {
    destinationError("Origin no coincide con la audiencia del token.");
  }
}

export function emailLoginCorsHeaders(
  rawOrigin: string | null,
  siteUrl?: string,
): HeadersInit {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "600",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
  const origin = normalizeEmailLoginOrigin(rawOrigin);
  if (origin && isAllowedEmailLoginOrigin(origin, siteUrl)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}
