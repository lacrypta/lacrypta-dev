export const DEFAULT_LOGIN_REDIRECT = "/dashboard";

export function safeLoginRedirect(
  value?: string | null,
  fallback = DEFAULT_LOGIN_REDIRECT,
): string {
  const candidate = value?.trim();
  if (!candidate) return fallback;
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return fallback;
  if (candidate.startsWith("/api/")) return fallback;
  if (candidate.startsWith("/login/email")) return fallback;
  if (/[\u0000-\u001f\u007f]/u.test(candidate)) return fallback;
  return candidate;
}

export function currentLoginRedirect(fallback = DEFAULT_LOGIN_REDIRECT): string {
  if (typeof window === "undefined") return fallback;
  return safeLoginRedirect(
    `${window.location.pathname}${window.location.search}${window.location.hash}`,
    fallback,
  );
}
