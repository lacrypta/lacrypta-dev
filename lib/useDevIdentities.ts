"use client";

import { useCallback, useEffect, useState } from "react";
import { setAuth, clearAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";

/** A throwaway dev account. `secret` is a plain array so it round-trips JSON
 *  and matches `Auth.localSecret` exactly. */
export type DevIdentity = {
  label: string;
  pubkey: string;
  npub: string;
  secret: number[];
};

/** Shared with the original /dev/voting harness so identities carry over. */
const STORAGE_KEY = "labs:dev:voting-voters:v1";
/** Fired on mutation so every mounted consumer (header bar + voting lab) stays
 *  in sync, mirroring the `labs:auth:changed` pattern in lib/auth.ts. */
const CHANGED_EVENT = "labs:dev:identities:changed";

function loadIdentities(): DevIdentity[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DevIdentity[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(identities: DevIdentity[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(identities));
    window.dispatchEvent(new CustomEvent(CHANGED_EVENT));
  } catch {
    /* quota */
  }
}

/**
 * Manages the local pool of throwaway dev identities and the impersonation
 * actions built on top of them. Used by the global DEV MODE bar and the
 * /dev/voting lab — single source of truth, kept in sync across instances.
 */
export function useDevIdentities() {
  const { push } = useToast();
  const [identities, setIdentities] = useState<DevIdentity[]>([]);

  useEffect(() => {
    setIdentities(loadIdentities());
    const sync = () => setIdentities(loadIdentities());
    window.addEventListener(CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const generateIdentity = useCallback(async () => {
    const { generateSecretKey, getPublicKey } = await import("nostr-tools/pure");
    const { npubEncode } = await import("nostr-tools/nip19");
    const secret = generateSecretKey();
    const pubkey = getPublicKey(secret);
    const current = loadIdentities();
    const identity: DevIdentity = {
      label: `Identidad ${current.length + 1}`,
      pubkey,
      npub: npubEncode(pubkey),
      secret: Array.from(secret),
    };
    persist([...current, identity]);
    return identity;
  }, []);

  const removeIdentity = useCallback((pubkey: string) => {
    persist(loadIdentities().filter((i) => i.pubkey !== pubkey));
  }, []);

  const loginAs = useCallback(
    (identity: DevIdentity) => {
      setAuth({
        method: "local",
        pubkey: identity.pubkey,
        localSecret: identity.secret,
      });
      push({
        kind: "success",
        title: `Sesión: ${identity.label}`,
        description: identity.npub.slice(0, 20) + "…",
      });
    },
    [push],
  );

  /** Logs in as La Crypta using the dev-only NEXT_PUBLIC_DEV_ADMIN_NSEC, so the
   *  developer can open/close voting and exercise admin-guarded actions. The
   *  matching npub must equal NEXT_PUBLIC_LACRYPTA_ADMIN_NPUB. */
  const loginAsAdmin = useCallback(async () => {
    const raw = process.env.NEXT_PUBLIC_DEV_ADMIN_NSEC;
    if (!raw) {
      push({
        kind: "error",
        title: "Falta NEXT_PUBLIC_DEV_ADMIN_NSEC",
        description: "Generá la clave con pnpm gen:dev-keys y reiniciá el server.",
      });
      return;
    }
    try {
      const { decode } = await import("nostr-tools/nip19");
      const { getPublicKey } = await import("nostr-tools/pure");
      const decoded = decode(raw.trim());
      if (decoded.type !== "nsec") throw new Error("no es una nsec válida");
      const secret = decoded.data as Uint8Array;
      const pubkey = getPublicKey(secret);
      setAuth({ method: "local", pubkey, localSecret: Array.from(secret) });
      push({
        kind: "success",
        title: "Sesión: La Crypta (admin)",
        description: pubkey.slice(0, 16) + "…",
      });
    } catch (e) {
      push({
        kind: "error",
        title: "NSEC de admin inválida",
        description: e instanceof Error ? e.message : String(e),
      });
    }
  }, [push]);

  /** Impersonate a real user by their PUBLIC key (e.g. a soldier from the
   *  roster). Logs in as the deterministic dev stand-in for that pubkey — the
   *  same key the voting route treats as eligible in dev mode. */
  const impersonate = useCallback(
    async (realPubkey: string, name: string) => {
      const { devSecretForPubkey } = await import("@/lib/devImpersonation");
      const { getPublicKey } = await import("nostr-tools/pure");
      const { npubEncode } = await import("nostr-tools/nip19");
      const secret = await devSecretForPubkey(realPubkey);
      const pubkey = getPublicKey(secret);
      setAuth({
        method: "local",
        pubkey,
        localSecret: Array.from(secret),
        // Track the real pubkey so dashboards show the impersonated user's data.
        impersonating: realPubkey.trim().toLowerCase(),
      });
      push({
        kind: "success",
        title: `Impersonando: ${name}`,
        description: npubEncode(pubkey).slice(0, 18) + "…",
      });
    },
    [push],
  );

  const logout = useCallback(() => clearAuth("user"), []);

  const copy = useCallback(
    async (text: string, what: string) => {
      try {
        await navigator.clipboard.writeText(text);
        push({ kind: "info", title: `${what} copiado` });
      } catch {
        push({ kind: "error", title: "No se pudo copiar" });
      }
    },
    [push],
  );

  return {
    identities,
    generateIdentity,
    removeIdentity,
    loginAs,
    loginAsAdmin,
    impersonate,
    logout,
    copy,
  };
}
