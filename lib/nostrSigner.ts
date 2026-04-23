"use client";

import { waitForNostrSigner, type Auth } from "./auth";

export type UnsignedEvent = {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
  pubkey?: string;
};

export type SignedEvent = {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
};

export type UserSigner = {
  pubkey: string;
  signEvent: (event: UnsignedEvent) => Promise<SignedEvent>;
  close?: () => Promise<void>;
};

declare global {
  interface Window {
    nostr?: {
      getPublicKey: () => Promise<string>;
      signEvent?: (event: UnsignedEvent) => Promise<SignedEvent>;
    };
  }
}

export type GetSignerOptions = {
  /** Called by the bunker when it requires user approval in its web UI */
  onAuthUrl?: (url: string) => void;
};

export async function getSigner(
  auth: Auth,
  opts: GetSignerOptions = {},
): Promise<UserSigner> {
  if (auth.method === "nip07") {
    if (typeof window === "undefined") {
      throw new Error("No hay acceso al window (SSR).");
    }
    // Extensions inject `window.nostr` asynchronously. If the user clicks
    // before that finishes (first-click-after-reload race), wait a short
    // moment rather than erroring out immediately.
    const ok = await waitForNostrSigner(2000);
    console.log("[labs:signer] building NIP-07 signer", {
      hasWindowNostr: !!window.nostr,
      hasSignEvent: typeof window?.nostr?.signEvent === "function",
      waitResolved: ok,
    });
    if (!ok || !window.nostr) {
      throw new Error(
        "No se detectó window.nostr. Instalá una extensión como Alby o nos2x y recargá.",
      );
    }
    if (typeof window.nostr.signEvent !== "function") {
      throw new Error(
        "La extensión no implementa signEvent (NIP-07). Actualizala a la última versión.",
      );
    }
    const ext = window.nostr;
    return {
      pubkey: auth.pubkey,
      async signEvent(event) {
        console.log("[labs:signer] asking NIP-07 extension to sign");
        const signed = await ext.signEvent!(event);
        return signed;
      },
    };
  }

  if (auth.method === "local") {
    if (!auth.localSecret || auth.localSecret.length !== 32) {
      throw new Error(
        "Sesión local inválida: falta la clave privada. Volvé a generar un usuario.",
      );
    }
    const sk = Uint8Array.from(auth.localSecret);
    const { finalizeEvent, getPublicKey } = await import("nostr-tools/pure");
    const pk = getPublicKey(sk);
    if (pk !== auth.pubkey) {
      throw new Error(
        "La clave local no coincide con el pubkey de la sesión. Volvé a iniciar.",
      );
    }
    console.log("[labs:signer] building local signer", {
      pubkey: pk.slice(0, 10) + "…",
    });
    return {
      pubkey: pk,
      async signEvent(event) {
        // `finalizeEvent` takes an `EventTemplate` (no pubkey) and stamps
        // pubkey + id + sig itself from the secret key.
        const template = {
          kind: event.kind,
          tags: event.tags,
          content: event.content,
          created_at: event.created_at,
        };
        return finalizeEvent(template, sk);
      },
    };
  }

  if (auth.method === "nip46") {
    console.log("[labs:signer] building NIP-46 signer", {
      bunker: auth.bunker?.pubkey?.slice(0, 10) + "…",
      relays: auth.bunker?.relays,
      hasClientSecret: !!auth.clientSecret?.length,
    });
    if (!auth.bunker?.pubkey || !auth.clientSecret?.length) {
      throw new Error(
        "Los datos del bunker son incompletos. Volvé a iniciar sesión.",
      );
    }
    if (!auth.bunker.relays?.length) {
      throw new Error(
        "No hay relays guardados para el bunker. Volvé a iniciar sesión.",
      );
    }

    const { BunkerSigner } = await import("nostr-tools/nip46");
    const { SimplePool } = await import("nostr-tools/pool");

    const clientSecret = Uint8Array.from(auth.clientSecret);
    const pool = new SimplePool();
    const inner = BunkerSigner.fromBunker(
      clientSecret,
      {
        pubkey: auth.bunker.pubkey,
        relays: auth.bunker.relays,
        secret: auth.bunker.secret ?? null,
      },
      {
        pool,
        onauth: (url: string) => {
          console.log("[labs:signer] bunker requested auth_url", url);
          opts.onAuthUrl?.(url);
        },
      },
    );

    // Re-establish the session opportunistically. Many bunkers (including
    // nsec.app and nsecbunker) treat each page load as a new session and
    // need a `connect` request before accepting `sign_event`. We fire it
    // best-effort so slow/offline bunkers don't block the UI.
    let connectPromise: Promise<void> | null = null;
    const ensureConnected = () => {
      if (!connectPromise) {
        connectPromise = Promise.race([
          inner.connect().then(
            () => {
              console.log("[labs:signer] bunker connect OK");
            },
            (e) => {
              console.warn("[labs:signer] bunker connect failed", e);
            },
          ),
          new Promise<void>((r) => setTimeout(r, 5000)),
        ]).then(() => {});
      }
      return connectPromise;
    };
    // Kick it off immediately so first signEvent is faster
    ensureConnected();

    return {
      pubkey: auth.pubkey,
      async signEvent(event) {
        console.log("[labs:signer] asking bunker to sign");
        await ensureConnected();
        const signed = (await inner.signEvent(event)) as SignedEvent;
        console.log("[labs:signer] bunker signed", {
          id: signed.id?.slice(0, 12),
        });
        return signed;
      },
      async close() {
        // Don't block the UI — close with a hard cap
        try {
          await Promise.race([
            inner.close(),
            new Promise((r) => setTimeout(r, 1000)),
          ]);
        } catch {
          /* noop */
        }
      },
    };
  }

  throw new Error("Método de autenticación no soportado.");
}
