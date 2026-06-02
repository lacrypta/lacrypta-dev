import { NextResponse } from "next/server";
import { isValidEmail, normalizeEmail } from "@/lib/emailLogin";

type SubscribeBody = {
  email?: string;
  handle?: string;
  npub?: string;
  recipientPubkey?: string;
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

function isHexPubkey(value: string): boolean {
  return /^[0-9a-f]{64}$/iu.test(value);
}

async function normalizeNpub(raw: string): Promise<string> {
  const value = raw.trim().toLowerCase();
  if (!value) return "";
  if (isHexPubkey(value)) return value;
  if (!value.startsWith("npub1")) throw new Error("npub invalida.");
  const { decode } = await import("nostr-tools/nip19");
  const decoded = decode(value);
  if (decoded.type !== "npub") throw new Error("npub invalida.");
  return decoded.data as string;
}

function subscriberEmailHtml({
  email,
  handle,
  siteUrl,
}: {
  email: string;
  handle?: string;
  siteUrl: string;
}): string {
  const safeEmail = escapeHtml(email);
  const safeHandle = handle ? escapeHtml(handle) : "";
  const safeUrl = escapeHtml(siteUrl);

  return `<!doctype html>
<html lang="es">
  <body style="margin:0;background:#05070e;color:#f4f4f5;font-family:Inter,Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#05070e;padding:36px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;border-collapse:separate;border-spacing:0;">
            <tr>
              <td style="padding:1px;border-radius:24px;background:linear-gradient(135deg,#f7931a 0%,#22d3ee 46%,#8b5cf6 100%);">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#090d16;border-radius:23px;border:1px solid #242938;overflow:hidden;">
                  <tr>
                    <td style="padding:30px 28px 0;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                        <tr>
                          <td>
                            <p style="margin:0;color:#f7931a;font-size:11px;font-weight:900;letter-spacing:.18em;text-transform:uppercase;">La Crypta Dev</p>
                          </td>
                          <td align="right">
                            <span style="display:inline-block;border:1px solid rgba(34,211,238,.35);border-radius:999px;background:rgba(34,211,238,.1);color:#67e8f9;font-size:10px;font-weight:900;letter-spacing:.12em;padding:6px 10px;text-transform:uppercase;">Oportunidades</span>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding:28px;">
                      <h1 style="margin:0 0 12px;color:#ffffff;font-size:32px;line-height:1.08;font-weight:900;letter-spacing:0;">Ya estás en la lista</h1>
                      <p style="margin:0 0 18px;color:#b8bdcc;font-size:15px;line-height:1.7;">Te vamos a mandar oportunidades reales para builders: hackatones, proyectos, llamados de trabajo y novedades del ecosistema Bitcoin, Lightning y Nostr.</p>

                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:20px 0;border:1px solid #242938;border-radius:16px;background:#0d1320;">
                        <tr>
                          <td style="padding:16px 18px;">
                            <p style="margin:0 0 4px;color:#8d93a6;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;">Suscripción</p>
                            <p style="margin:0;color:#ffffff;font-size:15px;font-weight:800;">${safeEmail}</p>
                            ${
                              safeHandle
                                ? `<p style="margin:8px 0 0;color:#8d93a6;font-size:13px;line-height:1.5;">Nostr: ${safeHandle}</p>`
                                : ""
                            }
                          </td>
                        </tr>
                      </table>

                      <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 24px;">
                        <tr>
                          <td style="border-radius:14px;background:#f7931a;">
                            <a href="${safeUrl}" style="display:inline-block;color:#05070e;text-decoration:none;font-size:15px;font-weight:900;border-radius:14px;padding:15px 22px;">Ver La Crypta Dev</a>
                          </td>
                        </tr>
                      </table>

                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #242938;padding-top:18px;">
                        <tr>
                          <td>
                            <p style="margin:0;color:#8d93a6;font-size:12px;line-height:1.6;">Cero spam. Si este correo no era para vos, podés ignorarlo tranquilo.</p>
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
                <p style="margin:0;color:#596074;font-size:11px;line-height:1.5;">Hecho en comunidad desde La Crypta.</p>
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

  let pubkey = "";
  try {
    pubkey = await normalizeNpub(body.recipientPubkey || body.npub || "");
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "npub invalida.");
  }

  if (!email && !pubkey) {
    return jsonError("Envia email, npub o ambos.");
  }

  try {
    let emailId: string | null = null;
    if (email) {
      const resendApiKey = requiredEnv("RESEND_API_KEY");
      const from = requiredEnv("RESEND_FROM_EMAIL");
      const siteUrl =
        process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/u, "") ||
        "https://lacrypta.dev";
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${resendApiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [email],
          subject: "Ya estás en la lista de La Crypta Dev",
          html: subscriberEmailHtml({
            email,
            handle: body.handle?.trim(),
            siteUrl,
          }),
          tags: [{ name: "category", value: "opportunities_subscription" }],
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        id?: string;
        message?: string;
      };
      if (!res.ok) {
        return jsonError(data.message || "No se pudo enviar el email.", 502);
      }
      emailId = data.id ?? null;
    }

    return NextResponse.json({
      ok: true,
      emailSent: Boolean(email),
      emailId,
      pubkey: pubkey || null,
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "No se pudo crear la suscripcion.",
      500,
    );
  }
}
