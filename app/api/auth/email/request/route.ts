import { NextResponse } from "next/server";
import {
  createEmailLoginToken,
  getLacryptaSecret,
  isValidEmail,
  normalizeEmail,
} from "@/lib/emailLogin";

type RequestBody = {
  email?: string;
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta ${name}.`);
  return value;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function emailHtml(link: string, email: string): string {
  const safeLink = escapeHtml(link);
  const safeEmail = escapeHtml(email);
  return `<!doctype html>
<html>
  <body style="margin:0;background:#05070e;color:#f4f4f5;font-family:Inter,Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#05070e;padding:36px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;border-collapse:separate;border-spacing:0;">
            <tr>
              <td style="padding:1px;border-radius:22px;background:linear-gradient(135deg,#f7931a 0%,#3b82f6 42%,#8b5cf6 100%);">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#090d16;border-radius:21px;border:1px solid #242938;">
                  <tr>
                    <td style="padding:30px 28px 28px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                        <tr>
                          <td>
                            <p style="margin:0;color:#f7931a;font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;">La Crypta Dev</p>
                          </td>
                          <td align="right">
                            <span style="display:inline-block;border:1px solid rgba(247,147,26,.35);border-radius:999px;background:rgba(247,147,26,.1);color:#f7931a;font-size:10px;font-weight:800;letter-spacing:.12em;padding:6px 10px;text-transform:uppercase;">Nostr Login</span>
                          </td>
                        </tr>
                      </table>

                      <h1 style="margin:28px 0 12px;color:#ffffff;font-size:30px;line-height:1.1;font-weight:800;letter-spacing:0;">Tu acceso está listo</h1>
                      <p style="margin:0 0 22px;color:#b8bdcc;font-size:15px;line-height:1.65;">Recibimos un pedido para iniciar sesión como <strong style="color:#ffffff;">${safeEmail}</strong>. El botón genera tu sesión Nostr local y expira en 15 minutos.</p>

                      <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 24px;">
                        <tr>
                          <td style="border-radius:14px;background:#f7931a;">
                            <a href="${safeLink}" style="display:inline-block;color:#05070e;text-decoration:none;font-size:15px;font-weight:900;border-radius:14px;padding:15px 22px;">Ingresar a La Crypta Dev</a>
                          </td>
                        </tr>
                      </table>

                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #242938;padding-top:18px;">
                        <tr>
                          <td>
                            <p style="margin:0;color:#8d93a6;font-size:12px;line-height:1.6;">Si no pediste este acceso, podés ignorar este email. No compartas este correo: el botón abre una sesión privada en tu navegador.</p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding-top:16px;">
                <p style="margin:0;color:#596074;font-size:11px;line-height:1.5;">Bitcoin, Lightning y Nostr desde La Crypta.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export async function POST(req: Request) {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonError("Body JSON invalido.");
  }

  const email = normalizeEmail(body.email ?? "");
  if (!isValidEmail(email)) return jsonError("Correo electronico invalido.");

  try {
    const resendApiKey = requiredEnv("RESEND_API_KEY");
    const from = requiredEnv("RESEND_FROM_EMAIL");
    const siteUrl = requiredEnv("NEXT_PUBLIC_SITE_URL").replace(/\/+$/u, "");
    const rootSecret = await getLacryptaSecret();
    const { token } = await createEmailLoginToken(rootSecret, email);
    const link = `${siteUrl}/login/email?token=${encodeURIComponent(token)}`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${resendApiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: "Ingresá a La Crypta Dev",
        html: emailHtml(link, email),
        tags: [{ name: "category", value: "email_login" }],
      }),
    });

    const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) {
      return jsonError(data.message || "No se pudo enviar el email.", 502);
    }

    return NextResponse.json({ ok: true, id: data.id ?? null });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "No se pudo enviar el email.",
      500,
    );
  }
}
