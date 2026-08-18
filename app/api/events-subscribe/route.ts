import { NextResponse } from "next/server";
import { isValidEmail, normalizeEmail } from "@/lib/emailLogin";

/**
 * Public subscription endpoint of the La Crypta CRM (no auth, org in the path).
 * The old https://events.lacrypta.ar/api/subscribe now 307s to an org-scoped
 * route and answers `{"error":"Organization context required"}` — see
 * https://crm.lacrypta.ar/docs/workflows/subscription-email-lists.
 */
const DEFAULT_ENDPOINT =
  "https://crm.lacrypta.ar/api/public/organizations/la-crypta/subscriptions";

/** Default CRM contact list to subscribe contacts into ("La Crypta Dev"). */
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
};

type CrmResponse = {
  status?: string;
  message?: string;
  error?: string;
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
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

  const npub = body.npub?.trim() ?? "";
  if (!email && !npub) {
    return jsonError("Envia email, npub o ambos.");
  }

  // The public CRM API is email-only, so a Nostr-only subscriber has nothing
  // to register (see the TODO below). The signed notification event is still
  // published by the frontend, so the flow works — it just leaves no contact.
  if (!email) {
    return NextResponse.json({ ok: true, exists: false, message: "Skipped" });
  }

  const endpoint = process.env.EVENTS_SUBSCRIBE_URL?.trim() || DEFAULT_ENDPOINT;
  const name = body.name?.trim();
  const lists = getListIds();

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email,
        ...(name ? { name } : {}),
        ...(lists.length ? { list_ids: lists } : {}),
        // TODO: register the npub too. Blocked on the CRM: a top-level `npub`
        // is silently dropped, and `fields` keys are validated against the
        // list's declared fields — list 0135a251… declares none, so this 400s
        // with `unknown_subscription_field`. Uncomment once an `npub` custom
        // field is added to the list in the CRM dashboard. npub-only contacts
        // stay impossible either way: the public endpoint requires an email.
        // ...(npub ? { fields: { npub } } : {}),
      }),
    });
    const data = (await res.json().catch(() => ({}))) as CrmResponse;

    if (!res.ok) {
      const message =
        data.error || data.message || "No se pudo crear la suscripcion.";
      return jsonError(message, res.status >= 400 ? res.status : 502);
    }

    return NextResponse.json({
      ok: true,
      exists: false,
      message: data.status ?? "subscribed",
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "No se pudo crear la suscripcion.",
      502,
    );
  }
}
