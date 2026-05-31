import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

const DERIVATION_CONTEXT = "lacrypta.dev:email-login:derive:v1";
const ENCRYPTION_CONTEXT = "lacrypta.dev:email-login:encrypt:v1";
const TOKEN_PURPOSE = "lacrypta-email-login";
const TOKEN_VERSION = "1";
export const EMAIL_LOGIN_TTL_SECONDS = 15 * 60;

type TokenPayload = {
  email: string;
  exp: number;
  nsec: string;
};

type EncryptedContent = {
  alg: "A256GCM";
  ciphertext: string;
  iv: string;
};

type SignedEvent = {
  content: string;
  created_at: number;
  id: string;
  kind: number;
  pubkey: string;
  sig: string;
  tags: string[][];
};

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function base64UrlEncode(bytes: Uint8Array | string): string {
  const buffer = typeof bytes === "string" ? Buffer.from(bytes, "utf8") : Buffer.from(bytes);
  return buffer
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

export function base64UrlDecode(value: string): Buffer {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  return Buffer.from(padded, "base64");
}

export async function getLacryptaSecret(): Promise<Uint8Array> {
  const nsec = process.env.LACRYPTA_NSEC;
  if (!nsec) throw new Error("Falta LACRYPTA_NSEC.");
  const { decode } = await import("nostr-tools/nip19");
  const decoded = decode(nsec);
  if (decoded.type !== "nsec") throw new Error("LACRYPTA_NSEC invalido.");
  return decoded.data as Uint8Array;
}

export function deriveEmailSecret(rootSecret: Uint8Array, email: string): Uint8Array {
  return createHmac("sha256", Buffer.from(rootSecret))
    .update(DERIVATION_CONTEXT)
    .update("\0")
    .update(email)
    .digest();
}

function encryptionKey(rootSecret: Uint8Array): Buffer {
  return createHmac("sha256", Buffer.from(rootSecret)).update(ENCRYPTION_CONTEXT).digest();
}

function encryptPayload(rootSecret: Uint8Array, payload: TokenPayload): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(rootSecret), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  const content: EncryptedContent = {
    alg: "A256GCM",
    iv: base64UrlEncode(iv),
    ciphertext: base64UrlEncode(Buffer.concat([ciphertext, authTag])),
  };
  return JSON.stringify(content);
}

function decryptPayload(rootSecret: Uint8Array, content: string): TokenPayload {
  const encrypted = JSON.parse(content) as Partial<EncryptedContent>;
  if (encrypted.alg !== "A256GCM" || !encrypted.iv || !encrypted.ciphertext) {
    throw new Error("Token de email invalido.");
  }
  const iv = base64UrlDecode(encrypted.iv);
  const sealed = base64UrlDecode(encrypted.ciphertext);
  if (sealed.length <= 16) throw new Error("Token de email invalido.");
  const ciphertext = sealed.subarray(0, -16);
  const authTag = sealed.subarray(-16);
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(rootSecret), iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const payload = JSON.parse(plaintext.toString("utf8")) as Partial<TokenPayload>;
  if (!payload.email || !payload.nsec || typeof payload.exp !== "number") {
    throw new Error("Token de email invalido.");
  }
  return payload as TokenPayload;
}

function eventTag(event: SignedEvent, name: string): string | null {
  return event.tags.find((tag) => tag[0] === name)?.[1] ?? null;
}

export async function createEmailLoginToken(
  rootSecret: Uint8Array,
  email: string,
  now = Math.floor(Date.now() / 1000),
): Promise<{ exp: number; nsec: string; pubkey: string; token: string }> {
  const { nsecEncode } = await import("nostr-tools/nip19");
  const { finalizeEvent, getPublicKey } = await import("nostr-tools/pure");
  const userSecret = deriveEmailSecret(rootSecret, email);
  const nsec = nsecEncode(userSecret);
  const pubkey = getPublicKey(userSecret);
  const exp = now + EMAIL_LOGIN_TTL_SECONDS;
  const event = finalizeEvent(
    {
      kind: 27235,
      created_at: now,
      tags: [
        ["purpose", TOKEN_PURPOSE],
        ["v", TOKEN_VERSION],
        ["exp", String(exp)],
      ],
      content: encryptPayload(rootSecret, { email, exp, nsec }),
    },
    rootSecret,
  );
  return {
    exp,
    nsec,
    pubkey,
    token: base64UrlEncode(JSON.stringify(event)),
  };
}

export async function consumeEmailLoginToken(
  rootSecret: Uint8Array,
  token: string,
  now = Math.floor(Date.now() / 1000),
): Promise<{ email: string; exp: number; nsec: string; pubkey: string }> {
  let event: SignedEvent;
  try {
    event = JSON.parse(base64UrlDecode(token).toString("utf8")) as SignedEvent;
  } catch {
    throw new Error("Token de email invalido.");
  }

  const { decode } = await import("nostr-tools/nip19");
  const { getPublicKey, verifyEvent } = await import("nostr-tools/pure");
  if (!verifyEvent(event)) throw new Error("Token de email invalido.");
  if (event.pubkey !== getPublicKey(rootSecret)) {
    throw new Error("Token de email invalido.");
  }
  if (event.kind !== 27235 || eventTag(event, "purpose") !== TOKEN_PURPOSE) {
    throw new Error("Token de email invalido.");
  }

  const tagExp = Number(eventTag(event, "exp"));
  if (!Number.isFinite(tagExp) || tagExp < now) {
    throw new Error("El enlace de email expiro.");
  }

  const payload = decryptPayload(rootSecret, event.content);
  if (payload.exp !== tagExp || payload.exp < now) {
    throw new Error("El enlace de email expiro.");
  }

  const decoded = decode(payload.nsec);
  if (decoded.type !== "nsec") throw new Error("Token de email invalido.");
  return {
    email: payload.email,
    exp: payload.exp,
    nsec: payload.nsec,
    pubkey: getPublicKey(decoded.data as Uint8Array),
  };
}
