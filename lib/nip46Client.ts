"use client";

import type { SimplePool, SubCloser } from "nostr-tools/pool";
import type { UnsignedEvent, SignedEvent } from "./nostrSigner";

export type EncryptionVersion = "nip44" | "nip04";

const NOSTR_CONNECT_KIND = 24133;
const RPC_TIMEOUT_MS = 30_000;

type Listener = {
  resolve: (v: string) => void;
  reject: (e: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
};

type FromURIOptions = {
  clientSecret: Uint8Array;
  relays: string[];
  /** Secret string embedded in the nostrconnect:// URI — bunker echoes it back */
  secret: string;
  timeoutMs: number;
  abortSignal?: AbortSignal;
  onAuthUrl?: (url: string) => void;
  onDiag?: (msg: string) => void;
};

type FromStoredOptions = {
  clientSecret: Uint8Array;
  bunkerPubkey: string;
  relays: string[];
  secret?: string | null;
  encryption: EncryptionVersion;
  onAuthUrl?: (url: string) => void;
};

/**
 * Minimal NIP-46 client that auto-detects the remote signer's encryption
 * (NIP-44 vs NIP-04) on the first message and uses it consistently for the
 * rest of the session. nostr-tools' BunkerSigner only speaks NIP-44, which
 * breaks against signers like Amber that default to NIP-04.
 *
 * Borrows the dual-encryption pattern from lawalletio/lawallet-nwc's
 * `apps/web/lib/client/nostr-signer.ts`.
 */
export class Nip46Client {
  /** Selected on first successful decrypt, then locked for the session. */
  encryptionVersion: EncryptionVersion = "nip44";
  bunkerPubkey: string = "";
  relays: string[] = [];
  secret: string | null = null;

  private pool!: SimplePool;
  private subCloser?: SubCloser;
  private listeners: Record<string, Listener> = {};
  private serial = 0;
  private idPrefix = Math.random().toString(36).slice(2, 8);
  private isOpen = false;
  private cachedPubkey?: string;
  private clientSecret!: Uint8Array;
  private clientPubkey!: string;
  private onAuthUrl?: (url: string) => void;

  private constructor() {}

  // ─── Factory: nostrconnect:// (QR) flow ────────────────────────────────
  static async fromURI(opts: FromURIOptions): Promise<Nip46Client> {
    const { generateSecretKey, getPublicKey } = await import("nostr-tools/pure");
    const { SimplePool } = await import("nostr-tools/pool");
    void generateSecretKey;

    const c = new Nip46Client();
    c.clientSecret = opts.clientSecret;
    c.clientPubkey = getPublicKey(opts.clientSecret);
    c.relays = opts.relays;
    c.secret = opts.secret;
    c.pool = new SimplePool();
    c.onAuthUrl = opts.onAuthUrl;
    const diag = opts.onDiag ?? (() => {});

    return new Promise<Nip46Client>((resolve, reject) => {
      let settled = false;
      let pendingSub: SubCloser | null = null;

      const cleanup = () => {
        try {
          pendingSub?.close();
        } catch {
          /* noop */
        }
      };

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error("__qr_timeout__"));
      }, opts.timeoutMs);

      opts.abortSignal?.addEventListener("abort", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        cleanup();
        reject(new Error("Cancelado por el usuario."));
      });

      pendingSub = c.pool.subscribe(
        opts.relays,
        {
          kinds: [NOSTR_CONNECT_KIND],
          "#p": [c.clientPubkey],
          limit: 0,
        },
        {
          onevent: async (event) => {
            if (settled) return;
            diag(
              `← evento kind ${event.kind} de ${event.pubkey.slice(0, 8)}…`,
            );
            let decoded: { plaintext: string; version: EncryptionVersion };
            try {
              decoded = await c.tryDecrypt(event.content, event.pubkey);
              diag(`  ✓ decifrado ${decoded.version.toUpperCase()}`);
            } catch {
              diag(`  ✗ decifrado falló con NIP-44 y NIP-04`);
              return;
            }

            let response: { id?: string; result?: string; error?: string };
            try {
              response = JSON.parse(decoded.plaintext);
            } catch {
              diag(`  ✗ JSON inválido: ${decoded.plaintext.slice(0, 60)}`);
              return;
            }

            // Auth-url events: forward to caller, keep waiting.
            if (response.result === "auth_url" && response.error) {
              c.onAuthUrl?.(response.error);
              diag(`  → auth_url recibida`);
              return;
            }

            const accepted =
              response.result === opts.secret || response.result === "ack";
            if (!accepted) {
              diag(
                `  ⚠ result inesperado: "${response.result}" (esperado "${opts.secret}")`,
              );
              return;
            }

            // Lock in the bunker identity + encryption choice for the session.
            settled = true;
            clearTimeout(timer);
            cleanup();
            c.bunkerPubkey = event.pubkey;
            c.encryptionVersion = decoded.version;
            diag(
              `  ✓ conexión aceptada por ${event.pubkey.slice(0, 8)}… (${decoded.version})`,
            );
            try {
              await c.openSession();
              resolve(c);
            } catch (err) {
              reject(err);
            }
          },
          oneose() {
            diag(`EOSE recibido, siguiendo en tiempo real`);
          },
          onclose(reason: unknown) {
            diag(`subscription cerrada: ${String(reason)}`);
          },
        },
      );
      diag(`subscription abierta — esperando al firmante`);
    });
  }

  // ─── Factory: restore from stored auth ─────────────────────────────────
  static async fromStored(opts: FromStoredOptions): Promise<Nip46Client> {
    const { getPublicKey } = await import("nostr-tools/pure");
    const { SimplePool } = await import("nostr-tools/pool");
    const c = new Nip46Client();
    c.clientSecret = opts.clientSecret;
    c.clientPubkey = getPublicKey(opts.clientSecret);
    c.bunkerPubkey = opts.bunkerPubkey;
    c.relays = opts.relays;
    c.secret = opts.secret ?? null;
    c.encryptionVersion = opts.encryption;
    c.onAuthUrl = opts.onAuthUrl;
    c.pool = new SimplePool();
    await c.openSession();
    return c;
  }

  // ─── Encryption helpers ────────────────────────────────────────────────
  private async tryDecrypt(
    content: string,
    peerPubkey: string,
  ): Promise<{ plaintext: string; version: EncryptionVersion }> {
    try {
      const nip44 = await import("nostr-tools/nip44");
      const convKey = nip44.getConversationKey(this.clientSecret, peerPubkey);
      return { plaintext: nip44.decrypt(content, convKey), version: "nip44" };
    } catch {
      // fall through
    }
    try {
      const nip04 = await import("nostr-tools/nip04");
      const plaintext = await nip04.decrypt(
        this.clientSecret,
        peerPubkey,
        content,
      );
      return { plaintext, version: "nip04" };
    } catch {
      throw new Error("decrypt failed for both NIP-44 and NIP-04");
    }
  }

  private async encryptContent(plaintext: string): Promise<string> {
    if (this.encryptionVersion === "nip44") {
      const nip44 = await import("nostr-tools/nip44");
      const convKey = nip44.getConversationKey(
        this.clientSecret,
        this.bunkerPubkey,
      );
      return nip44.encrypt(plaintext, convKey);
    }
    const nip04 = await import("nostr-tools/nip04");
    return nip04.encrypt(this.clientSecret, this.bunkerPubkey, plaintext);
  }

  // ─── Session subscription + RPC ────────────────────────────────────────
  private async openSession(): Promise<void> {
    if (this.isOpen) return;
    this.subCloser = this.pool.subscribe(
      this.relays,
      {
        kinds: [NOSTR_CONNECT_KIND],
        authors: [this.bunkerPubkey],
        "#p": [this.clientPubkey],
        limit: 0,
      },
      {
        onevent: async (event) => {
          let decoded: { plaintext: string; version: EncryptionVersion };
          try {
            decoded = await this.tryDecrypt(event.content, event.pubkey);
          } catch (e) {
            console.warn("[nip46] failed to decrypt session event", e);
            return;
          }
          // If the bunker switches encryption mid-session (rare, but allowed
          // by some signers), follow them so subsequent outbound requests
          // stay readable.
          if (decoded.version !== this.encryptionVersion) {
            this.encryptionVersion = decoded.version;
          }
          let parsed: { id?: string; result?: string; error?: string };
          try {
            parsed = JSON.parse(decoded.plaintext);
          } catch {
            return;
          }
          const { id, result, error } = parsed;
          if (result === "auth_url" && error) {
            this.onAuthUrl?.(error);
            return;
          }
          if (!id) return;
          const handler = this.listeners[id];
          if (!handler) return;
          clearTimeout(handler.timer);
          delete this.listeners[id];
          if (error) handler.reject(new Error(error));
          else handler.resolve(result ?? "");
        },
        onclose: () => {
          this.subCloser = undefined;
          this.isOpen = false;
        },
      },
    );
    this.isOpen = true;
  }

  /** Sends a `connect` request — used to re-handshake stored sessions. */
  async connect(): Promise<void> {
    await this.openSession();
    await this.sendRequest("connect", [
      this.bunkerPubkey,
      this.secret ?? "",
    ]);
  }

  async sendRequest(method: string, params: string[]): Promise<string> {
    if (!this.isOpen) await this.openSession();
    const { finalizeEvent } = await import("nostr-tools/pure");
    this.serial++;
    const id = `${this.idPrefix}-${this.serial}`;
    const encryptedContent = await this.encryptContent(
      JSON.stringify({ id, method, params }),
    );
    const event = finalizeEvent(
      {
        kind: NOSTR_CONNECT_KIND,
        tags: [["p", this.bunkerPubkey]],
        content: encryptedContent,
        created_at: Math.floor(Date.now() / 1000),
      },
      this.clientSecret,
    );
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        delete this.listeners[id];
        reject(new Error(`bunker did not reply to ${method} in time`));
      }, RPC_TIMEOUT_MS);
      this.listeners[id] = { resolve, reject, timer };
      Promise.any(this.pool.publish(this.relays, event)).catch((err) => {
        clearTimeout(timer);
        delete this.listeners[id];
        reject(err);
      });
    });
  }

  async getPublicKey(): Promise<string> {
    if (!this.cachedPubkey) {
      this.cachedPubkey = await this.sendRequest("get_public_key", []);
    }
    return this.cachedPubkey;
  }

  async signEvent(event: UnsignedEvent): Promise<SignedEvent> {
    const resp = await this.sendRequest("sign_event", [JSON.stringify(event)]);
    return JSON.parse(resp) as SignedEvent;
  }

  /** NIP-46 remote NIP-44 encrypt: bunker encrypts `plaintext` to `peer`. */
  async nip44Encrypt(peer: string, plaintext: string): Promise<string> {
    return this.sendRequest("nip44_encrypt", [peer, plaintext]);
  }

  /** NIP-46 remote NIP-44 decrypt: bunker decrypts `ciphertext` from `peer`. */
  async nip44Decrypt(peer: string, ciphertext: string): Promise<string> {
    return this.sendRequest("nip44_decrypt", [peer, ciphertext]);
  }

  async close(): Promise<void> {
    this.isOpen = false;
    for (const id of Object.keys(this.listeners)) {
      clearTimeout(this.listeners[id].timer);
      this.listeners[id].reject(new Error("client closed"));
      delete this.listeners[id];
    }
    try {
      this.subCloser?.close();
    } catch {
      /* noop */
    }
  }
}
