import { NextResponse } from "next/server";

type NotificationBody = {
  handle?: string;
  recipientPubkey?: string;
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

async function getBackendSecret() {
  const nsec = process.env.LACRYPTA_NSEC;
  if (!nsec) throw new Error("Falta LACRYPTA_NSEC.");
  const { decode } = await import("nostr-tools/nip19");
  const decoded = decode(nsec);
  if (decoded.type !== "nsec") throw new Error("LACRYPTA_NSEC invalido.");
  return decoded.data as Uint8Array;
}

function isHexPubkey(value: string): boolean {
  return /^[0-9a-f]{64}$/iu.test(value);
}

export async function POST(req: Request) {
  let body: NotificationBody;
  try {
    body = (await req.json()) as NotificationBody;
  } catch {
    return jsonError("Body JSON invalido.");
  }

  const recipientPubkey = body.recipientPubkey?.trim().toLowerCase();
  if (!recipientPubkey || !isHexPubkey(recipientPubkey)) {
    return jsonError("Falta recipientPubkey valido.");
  }

  try {
    const secret = await getBackendSecret();
    const { getPublicKey } = await import("nostr-tools/pure");
    const { wrapEvent } = await import("nostr-tools/nip17");
    const senderPubkey = getPublicKey(secret);
    const handle = body.handle?.trim();
    const message = [
      "Hola! Te anotaste para recibir oportunidades de La Crypta Dev.",
      "Vamos a enviarte hackatones, proyectos y oportunidades relevantes por Nostr.",
      handle ? `Identificador: ${handle}` : null,
    ]
      .filter(Boolean)
      .join("\n\n");
    const event = wrapEvent(
      secret,
      { publicKey: recipientPubkey },
      message,
      "La Crypta Dev opportunities",
    );

    return NextResponse.json({ event, senderPubkey });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "No se pudo firmar la notificacion.",
      500,
    );
  }
}
