import { NextResponse } from "next/server";
import {
  assertEmailLoginOriginMatchesAudience,
  emailLoginCorsHeaders,
  EmailLoginDestinationError,
} from "@/lib/emailLoginDestinations";
import { consumeEmailLoginToken, getLacryptaSecret } from "@/lib/emailLogin";

type ConsumeBody = {
  token?: string;
};

function jsonError(message: string, status = 400, origin?: string | null) {
  return NextResponse.json(
    { error: message },
    {
      headers: emailLoginCorsHeaders(origin ?? null, process.env.NEXT_PUBLIC_SITE_URL),
      status,
    },
  );
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, {
    headers: emailLoginCorsHeaders(req.headers.get("origin"), process.env.NEXT_PUBLIC_SITE_URL),
    status: 204,
  });
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  let body: ConsumeBody;
  try {
    body = (await req.json()) as ConsumeBody;
  } catch {
    return jsonError("Body JSON invalido.", 400, origin);
  }

  const token = body.token?.trim();
  if (!token) return jsonError("Falta token.", 400, origin);

  try {
    const rootSecret = await getLacryptaSecret();
    const { audOrigin, nsec, pubkey, redirectTo } =
      await consumeEmailLoginToken(rootSecret, token);
    assertEmailLoginOriginMatchesAudience(origin, audOrigin);
    return NextResponse.json(
      { nsec, pubkey, redirectTo },
      {
        headers: emailLoginCorsHeaders(origin, process.env.NEXT_PUBLIC_SITE_URL),
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo validar el enlace.";
    const status = message.includes("expiro")
      ? 401
      : error instanceof EmailLoginDestinationError
        ? 403
        : 400;
    return jsonError(message, status, origin);
  }
}
