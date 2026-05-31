import { NextResponse } from "next/server";
import { consumeEmailLoginToken, getLacryptaSecret } from "@/lib/emailLogin";

type ConsumeBody = {
  token?: string;
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: Request) {
  let body: ConsumeBody;
  try {
    body = (await req.json()) as ConsumeBody;
  } catch {
    return jsonError("Body JSON invalido.");
  }

  const token = body.token?.trim();
  if (!token) return jsonError("Falta token.");

  try {
    const rootSecret = await getLacryptaSecret();
    const { nsec, pubkey } = await consumeEmailLoginToken(rootSecret, token);
    return NextResponse.json({ nsec, pubkey });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo validar el enlace.";
    const status = message.includes("expiro") ? 401 : 400;
    return jsonError(message, status);
  }
}
