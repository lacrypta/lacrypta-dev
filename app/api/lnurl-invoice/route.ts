import { NextResponse } from "next/server";

type InvoiceRequestBody = {
  endpoint?: unknown;
  amount?: unknown;
  nostr?: unknown;
  comment?: unknown;
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

type ResolvedCallback = {
  callback: string;
  /** Max comment length the service accepts (LUD-12), or null if unknown. */
  commentAllowed: number | null;
};

async function resolveInvoiceCallback(
  endpoint: string,
): Promise<ResolvedCallback> {
  const url = new URL(endpoint);
  if (!url.pathname.toLowerCase().includes("/.well-known/lnurlp/")) {
    // Already a callback URL (e.g. a NIP-57 zap endpoint) — pass through.
    return { callback: endpoint, commentAllowed: null };
  }

  const metadataRes = await fetch(endpoint, {
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  const metadata = (await metadataRes.json().catch(() => ({}))) as {
    callback?: unknown;
    status?: unknown;
    reason?: unknown;
    commentAllowed?: unknown;
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
  return {
    callback: metadata.callback,
    commentAllowed:
      typeof metadata.commentAllowed === "number"
        ? metadata.commentAllowed
        : null,
  };
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
  const comment = typeof body.comment === "string" ? body.comment : "";

  if (!isAllowedEndpoint(endpoint)) {
    return NextResponse.json(
      { ok: false, reason: "Endpoint LNURL inválido." },
      { status: 400 },
    );
  }
  if (!/^\d+$/.test(amount)) {
    return NextResponse.json(
      { ok: false, reason: "Falta amount." },
      { status: 400 },
    );
  }

  let resolved: ResolvedCallback;
  try {
    resolved = await resolveInvoiceCallback(endpoint);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        reason: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    );
  }

  const url = new URL(resolved.callback);
  url.searchParams.set("amount", amount);
  if (nostr) {
    // NIP-57 zap: the signed zap request carries the comment in its content.
    url.searchParams.set("nostr", nostr);
  } else if (comment) {
    // Plain LNURL-pay (LUD-12): include the comment within the allowed length.
    const max = resolved.commentAllowed;
    const trimmed = max && max > 0 ? comment.slice(0, max) : comment;
    if (max === null || max > 0) {
      url.searchParams.set("comment", trimmed);
    }
  }

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
