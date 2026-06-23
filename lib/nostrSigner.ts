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
  /** NIP-44 encrypt `plaintext` to `peerPubkeyHex` (e.g. La Crypta's key for
   *  encrypted ballots). Throws a clear error if the method can't encrypt. */
  nip44Encrypt: (peerPubkeyHex: string, plaintext: string) => Promise<string>;
  /** NIP-44 decrypt `ciphertext` from `peerPubkeyHex`. The conversation key is
   *  symmetric, so a voter can decrypt their own ballot (peer = La Crypta). */
  nip44Decrypt: (peerPubkeyHex: string, ciphertext: string) => Promise<string>;
  close?: () => Promise<void>;
};

declare global {
  interface Window {
    nostr?: {
      getPublicKey: () => Promise<string>;
      signEvent?: (event: UnsignedEvent) => Promise<SignedEvent>;
      nip44?: {
        encrypt?: (pubkey: string, plaintext: string) => Promise<string>;
        decrypt?: (pubkey: string, ciphertext: string) => Promise<string>;
      };
    };
  }
}

const NIP44_UNSUPPORTED =
  "Tu firmante no soporta cifrado NIP-44. Usá una extensión actualizada (Alby/nos2x) o una identidad local.";

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
      async nip44Encrypt(peer, plaintext) {
        if (typeof ext.nip44?.encrypt !== "function") {
          throw new Error(NIP44_UNSUPPORTED);
        }
        return ext.nip44.encrypt(peer, plaintext);
      },
      async nip44Decrypt(peer, ciphertext) {
        if (typeof ext.nip44?.decrypt !== "function") {
          throw new Error(NIP44_UNSUPPORTED);
        }
        return ext.nip44.decrypt(peer, ciphertext);
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
      async nip44Encrypt(peer, plaintext) {
        const nip44 = await import("nostr-tools/nip44");
        return nip44.encrypt(plaintext, nip44.getConversationKey(sk, peer));
      },
      async nip44Decrypt(peer, ciphertext) {
        const nip44 = await import("nostr-tools/nip44");
        return nip44.decrypt(ciphertext, nip44.getConversationKey(sk, peer));
      },
    };
  }

  if (auth.method === "nip46") {
    console.log("[labs:signer] building NIP-46 signer", {
      bunker: auth.bunker?.pubkey?.slice(0, 10) + "…",
      relays: auth.bunker?.relays,
      hasClientSecret: !!auth.clientSecret?.length,
      encryption: auth.bunker?.encryption ?? "(legacy nip44)",
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

    const clientSecret = Uint8Array.from(auth.clientSecret);

    // QR-originated sessions persist their detected transport encryption.
    // Use the dual-encryption client so Amber-on-NIP-04 stays reachable
    // across reloads. Legacy paste-flow sessions (no `encryption` field)
    // keep using nostr-tools' BunkerSigner, which is NIP-44 only.
    if (auth.bunker.encryption) {
      const { Nip46Client } = await import("./nip46Client");
      const client = await Nip46Client.fromStored({
        clientSecret,
        bunkerPubkey: auth.bunker.pubkey,
        relays: auth.bunker.relays,
        secret: auth.bunker.secret ?? null,
        encryption: auth.bunker.encryption,
        onAuthUrl: (url: string) => {
          console.log("[labs:signer] bunker requested auth_url", url);
          opts.onAuthUrl?.(url);
        },
      });

      let connectPromise: Promise<void> | null = null;
      const ensureConnected = () => {
        if (!connectPromise) {
          connectPromise = Promise.race([
            client.connect().then(
              () => console.log("[labs:signer] bunker connect OK"),
              (e) => console.warn("[labs:signer] bunker connect failed", e),
            ),
            new Promise<void>((r) => setTimeout(r, 5000)),
          ]).then(() => {});
        }
        return connectPromise;
      };
      ensureConnected();

      return {
        pubkey: auth.pubkey,
        async signEvent(event) {
          console.log("[labs:signer] asking bunker to sign");
          await ensureConnected();
          const signed = await client.signEvent(event);
          console.log("[labs:signer] bunker signed", {
            id: signed.id?.slice(0, 12),
          });
          return signed;
        },
        async nip44Encrypt(peer, plaintext) {
          await ensureConnected();
          return client.nip44Encrypt(peer, plaintext);
        },
        async nip44Decrypt(peer, ciphertext) {
          await ensureConnected();
          return client.nip44Decrypt(peer, ciphertext);
        },
        async close() {
          try {
            await Promise.race([
              client.close(),
              new Promise((r) => setTimeout(r, 1000)),
            ]);
          } catch {
            /* noop */
          }
        },
      };
    }

    const { BunkerSigner } = await import("nostr-tools/nip46");
    const { SimplePool } = await import("nostr-tools/pool");

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

    const innerEnc = inner as unknown as {
      nip44Encrypt?: (peer: string, text: string) => Promise<string>;
      nip44Decrypt?: (peer: string, text: string) => Promise<string>;
    };
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
      async nip44Encrypt(peer, plaintext) {
        if (typeof innerEnc.nip44Encrypt !== "function") {
          throw new Error(NIP44_UNSUPPORTED);
        }
        await ensureConnected();
        return innerEnc.nip44Encrypt(peer, plaintext);
      },
      async nip44Decrypt(peer, ciphertext) {
        if (typeof innerEnc.nip44Decrypt !== "function") {
          throw new Error(NIP44_UNSUPPORTED);
        }
        await ensureConnected();
        return innerEnc.nip44Decrypt(peer, ciphertext);
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
