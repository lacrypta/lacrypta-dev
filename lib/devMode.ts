/**
 * Dev-only feature gate.
 *
 * Enables the in-app DEV MODE bar (account impersonation, admin login) used to
 * exercise flows like community voting against a local relay without touching
 * production data. `NEXT_PUBLIC_*` is inlined at build time, so this is a
 * compile-time constant — server and client agree (no hydration mismatch).
 *
 * OFF by default. NEVER set NEXT_PUBLIC_DEV_MODE=true in a production deploy:
 * it exposes impersonation UI and (paired with NEXT_PUBLIC_DEV_ADMIN_NSEC) a
 * signing secret to the browser.
 */
export function isDevMode(): boolean {
  return process.env.NEXT_PUBLIC_DEV_MODE === "true";
}
