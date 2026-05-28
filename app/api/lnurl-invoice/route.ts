import { NextResponse } from "next/server";

type InvoiceRequestBody = {
  endpoint?: unknown;
  amount?: unknown;
  nostr?: unknown;
};

function isAllowedEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:") return false;
    const hostname = url.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname.endsWith(".local")
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function resolveInvoiceCallback(endpoint: string): Promise<string> {
  const url = new URL(endpoint);
  if (!url.pathname.toLowerCase().includes("/.well-known/lnurlp/")) {
    return endpoint;
  }

  const metadataRes = await fetch(endpoint, {
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  const metadata = (await metadataRes.json().catch(() => ({}))) as {
    callback?: unknown;
    status?: unknown;
    reason?: unknown;
  };
  if (!metadataRes.ok || metadata.status === "ERROR") {
    throw new Error(
      typeof metadata.reason === "string"
        ? metadata.reason
        : "No se pudo resolver la lightning address.",
    );
  }
  if (typeof metadata.callback !== "string" || !isAllowedEndpoint(metadata.callback)) {
    throw new Error("La lightning address no devolvió un callback válido.");
  }
  return metadata.callback;
}

export async function POST(req: Request) {
  let body: InvoiceRequestBody;
  try {
    body = (await req.json()) as InvoiceRequestBody;
  } catch {
    return NextResponse.json(
      { ok: false, reason: "Body JSON inválido." },
      { status: 400 },
    );
  }

  const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
  const amount = typeof body.amount === "string" ? body.amount : "";
  const nostr = typeof body.nostr === "string" ? body.nostr : "";

  if (!isAllowedEndpoint(endpoint)) {
    return NextResponse.json(
      { ok: false, reason: "Endpoint LNURL inválido." },
      { status: 400 },
    );
  }
  if (!/^\d+$/.test(amount) || !nostr) {
    return NextResponse.json(
      { ok: false, reason: "Faltan amount o nostr." },
      { status: 400 },
    );
  }

  let callback: string;
  try {
    callback = await resolveInvoiceCallback(endpoint);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        reason: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    );
  }

  const url = new URL(callback);
  url.searchParams.set("amount", amount);
  url.searchParams.set("nostr", nostr);

  try {
    const invoiceRes = await fetch(url.toString(), {
      cache: "no-store",
      headers: {
        accept: "application/json",
      },
    });
    const text = await invoiceRes.text();
    let payload: unknown = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { reason: text };
    }

    if (!invoiceRes.ok) {
      const reason =
        typeof payload === "object" &&
        payload !== null &&
        "reason" in payload &&
        typeof payload.reason === "string"
          ? payload.reason
          : `LNURL respondió HTTP ${invoiceRes.status}`;
      return NextResponse.json(
        { ok: false, reason },
        { status: invoiceRes.status },
      );
    }

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        reason: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    );
  }
}
