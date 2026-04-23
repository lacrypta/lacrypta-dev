"use client";

import { useEffect, useState } from "react";

export type AuthMethod = "nip07" | "nip46" | "local";

export type Auth = {
  method: AuthMethod;
  pubkey: string;
  bunker?: {
    pubkey?: string;
    relays: string[];
    /** one-time auth secret from nostrconnect:// URI or bunker:// URL */
    secret?: string | null;
  };
  clientSecret?: number[];
  /** 32-byte secret key (nsec) — populated **only** when `method === "local"`.
   *  Stored as a plain array so it round-trips through JSON. Storing a
   *  private key in localStorage is inherently insecure; this method is for
   *  throwaway/test identities and dev convenience. */
  localSecret?: number[];
};

const STORAGE_KEY = "labs:auth";
const EVENT = "labs:auth:changed";
const LOGOUT_REASON_KEY = "labs:auth:logout-reason";

export type LogoutReason = "signer-missing" | "user" | "bunker-failed";

export function getAuth(): Auth | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Auth;
  } catch {
    return null;
  }
}

export function setAuth(auth: Auth) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    /* quota */
  }
}

export function clearAuth(reason: LogoutReason = "user") {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  try {
    window.localStorage.setItem(LOGOUT_REASON_KEY, reason);
  } catch {
    /* quota */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** Reads the last logout reason and clears it. Use on the login page to show
 *  a contextual message (e.g. "your extension is missing, re-connect"). */
export function readAndClearLogoutReason(): LogoutReason | null {
  if (typeof window === "undefined") return null;
  try {
    const r = window.localStorage.getItem(LOGOUT_REASON_KEY);
    if (!r) return null;
    window.localStorage.removeItem(LOGOUT_REASON_KEY);
    return r as LogoutReason;
  } catch {
    return null;
  }
}

/** Resolves true once `window.nostr.signEvent` is available, or false after
 *  `timeoutMs`. Browser extensions (Alby, nos2x) inject asynchronously, so
 *  the app should always wait a beat before declaring them missing. */
export function waitForNostrSigner(timeoutMs = 3000): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.nostr && typeof window.nostr.signEvent === "function") {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      if (window.nostr && typeof window.nostr.signEvent === "function") {
        resolve(true);
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        resolve(false);
        return;
      }
      window.setTimeout(tick, 100);
    };
    tick();
  });
}

/** Confirms the signer for the current auth is actually usable on this
 *  browser. NIP-46 is trusted without a probe — the bunker is remote, and
 *  unavailability surfaces as a signing error rather than a missing signer.
 *  `local` is trusted because the secret key is already in-hand. */
export async function probeSignerAvailable(
  auth: Auth,
  timeoutMs = 3000,
): Promise<boolean> {
  if (auth.method === "nip46") return true;
  if (auth.method === "local") {
    return Array.isArray(auth.localSecret) && auth.localSecret.length === 32;
  }
  const present = await waitForNostrSigner(timeoutMs);
  if (!present) return false;
  try {
    // Some extensions expose window.nostr but a different pubkey (e.g. user
    // switched account in Alby). Treat that as a mismatch → auto-logout so
    // the app doesn't sign with the wrong key.
    const pk = await window.nostr!.getPublicKey();
    return pk === auth.pubkey;
  } catch {
    return false;
  }
}

export function useAuth(): {
  auth: Auth | null;
  ready: boolean;
  /** True once the signer has been confirmed usable. False while probing,
   *  or permanently false for NIP-07 sessions where the extension vanished
   *  (though in that case auth is cleared shortly afterwards). */
  signerReady: boolean;
} {
  const [auth, setState] = useState<Auth | null>(null);
  const [ready, setReady] = useState(false);
  const [signerReady, setSignerReady] = useState(false);

  useEffect(() => {
    setState(getAuth());
    setReady(true);
    const onChange = () => {
      setState(getAuth());
      setSignerReady(false);
    };
    window.addEventListener(EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  useEffect(() => {
    if (!auth) {
      setSignerReady(false);
      return;
    }
    let cancelled = false;
    setSignerReady(false);
    probeSignerAvailable(auth).then((ok) => {
      if (cancelled) return;
      if (ok) {
        setSignerReady(true);
      } else {
        console.warn(
          "[labs:auth] signer not available for stored session — auto logout",
        );
        clearAuth("signer-missing");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [auth?.method, auth?.pubkey]);

  return { auth, ready, signerReady };
}
