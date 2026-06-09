import { NextResponse } from "next/server";
import { isValidEmail, normalizeEmail } from "@/lib/emailLogin";

const DEFAULT_ENDPOINT = "https://events.lacrypta.ar/api/subscribe";

/** Default CRM contact list to subscribe contacts into (see API_SUBSCRIBE docs). */
const DEFAULT_LIST_IDS = "0135a251-8a46-4f88-b5bc-315d982eb7fa";

/** Parse the comma-separated list-id env var into a clean UUID array. */
function getListIds(): string[] {
  const raw = process.env.EVENTS_SUBSCRIBE_LISTS?.trim() || DEFAULT_LIST_IDS;
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

type SubscribeBody = {
  email?: string;
  npub?: string;
  name?: string;
  phone?: string;
};

type CrmResponse = {
  ok?: boolean;
  exists?: boolean;
  message?: string;
  error?: string;
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function isHexPubkey(value: string): boolean {
  return /^[0-9a-f]{64}$/iu.test(value);
}

/**
 * The events CRM expects a bech32 `npub1…` string (it decodes it to hex on
 * its side). Accept either an `npub1…` or a raw 64-char hex pubkey and always
 * forward the bech32 form. Returns "" when nothing usable was provided.
 */
async function normalizeNpub(raw: string): Promise<string> {
  const value = raw.trim().toLowerCase();
  if (!value) return "";
  const { decode, npubEncode } = await import("nostr-tools/nip19");
  if (isHexPubkey(value)) return npubEncode(value);
  if (!value.startsWith("npub1")) throw new Error("npub invalida.");
  try {
    const decoded = decode(value);
    if (decoded.type !== "npub") throw new Error("npub invalida.");
    return npubEncode(decoded.data as string);
  } catch {
    throw new Error("npub invalida.");
  }
}

export async function POST(req: Request) {
  let body: SubscribeBody;
  try {
    body = (await req.json()) as SubscribeBody;
  } catch {
    return jsonError("Body JSON invalido.");
  }

  const email = normalizeEmail(body.email ?? "");
  if (body.email && !isValidEmail(email)) {
    return jsonError("Correo electronico invalido.");
  }

  let npub = "";
  try {
    npub = await normalizeNpub(body.npub ?? "");
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "npub invalida.");
  }

  if (!email && !npub) {
    return jsonError("Envia email, npub o ambos.");
  }

  const endpoint = process.env.EVENTS_SUBSCRIBE_URL?.trim() || DEFAULT_ENDPOINT;
  const name = body.name?.trim();
  const phone = body.phone?.trim();
  const lists = getListIds();

  // Fields shared across every attempt; only the identity (email/npub) varies.
  const baseFields = {
    ...(name ? { name } : {}),
    ...(phone ? { phone } : {}),
    ...(lists.length ? { lists } : {}),
  };

  async function subscribe(identity: { email?: string; npub?: string }) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...identity, ...baseFields }),
    });
    const data = (await res.json().catch(() => ({}))) as CrmResponse;
    return { res, data };
  }

  try {
    let { res, data } = await subscribe({
      ...(email ? { email } : {}),
      ...(npub ? { npub } : {}),
    });

    // The CRM returns `identity_conflict` when email + npub are sent together
    // but already belong to existing/different contacts (it never links them).
    // Fall back to subscribing each identifier on its own — preferring the
    // email — so the contact still gets added to the list.
    if (
      res.status === 409 &&
      data.error === "identity_conflict" &&
      email &&
      npub
    ) {
      for (const identity of [{ email }, { npub }]) {
        const retry = await subscribe(identity);
        if (retry.res.ok) {
          res = retry.res;
          data = retry.data;
          break;
        }
      }
    }

    if (!res.ok) {
      const message =
        data.error || data.message || "No se pudo crear la suscripcion.";
      // Surface the upstream status (e.g. 409 identity_conflict) to the client.
      return jsonError(message, res.status >= 400 ? res.status : 502);
    }

    return NextResponse.json({
      ok: true,
      exists: Boolean(data.exists),
      message: data.message ?? (data.exists ? "Already subscribed" : "Subscribed"),
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "No se pudo crear la suscripcion.",
      502,
    );
  }
}
