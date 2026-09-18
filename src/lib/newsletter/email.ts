import "server-only";
import { Resend } from "resend";
import { serverEnv } from "@/lib/env.server";
import { clientEnv } from "@/lib/env.client";
import { buildUnsubscribeUrl } from "@/lib/newsletter/tokens";

const resend = new Resend(serverEnv.RESEND_API_KEY);

export async function sendNewsletterConfirmationEmail(
  email: string,
  rawConfirmationToken: string,
  subscriberId: string,
  lifecycleNonce: string
): Promise<{ ok: true } | { ok: false; error: unknown }> {
  const confirmUrl = new URL("/newsletter/confirm/start", clientEnv.NEXT_PUBLIC_SITE_URL);
  confirmUrl.searchParams.set("token", rawConfirmationToken);
  const unsubscribeUrl = buildUnsubscribeUrl(subscriberId, lifecycleNonce);

  try {
    const { error } = await resend.emails.send({
      from: "CrazyCraft <newsletter@mail.crazycraftglobal.com>",
      to: email,
      subject: "Confirm your CrazyCraft newsletter subscription",
      html: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <title>Confirm your CrazyCraft newsletter subscription</title>
  </head>
  <body style="margin:0; padding:0; background-color:#f6f1ea; font-family:Arial, Helvetica, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f6f1ea; padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:12px;">
            <tr>
              <td style="padding:32px 40px 24px 40px; text-align:center; border-bottom:1px solid #ece4d6;">
                <span style="font-family:Georgia, 'Times New Roman', serif; font-size:22px; font-weight:bold; letter-spacing:1px; color:#16243f;">CrazyCraft</span>
                <div style="margin-top:6px; font-family:Arial, Helvetica, sans-serif; font-size:12px; letter-spacing:0.5px; color:#948d7e; text-transform:uppercase;">Indian Handicrafts for Global Buyers</div>
              </td>
            </tr>
            <tr>
              <td style="padding:40px 40px 8px 40px;">
                <h1 style="margin:0 0 16px 0; font-family:Arial, Helvetica, sans-serif; font-size:22px; line-height:1.3; color:#16243f; font-weight:bold; text-align:center;">Confirm your subscription</h1>
                <p style="margin:0 0 12px 0; font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.6; color:#3d382f; text-align:center;">Thanks for signing up for CrazyCraft updates.</p>
                <p style="margin:0 0 28px 0; font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.6; color:#3d382f; text-align:center;">Confirm your email to receive product updates, sourcing insights, new collections, and news from CrazyCraft.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 40px 8px 40px;" align="center">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="center" bgcolor="#16243f" style="border-radius:6px;">
                      <a href="${confirmUrl.toString()}" target="_blank" style="display:inline-block; padding:14px 40px; font-family:Arial, Helvetica, sans-serif; font-size:15px; font-weight:bold; color:#ffffff; text-decoration:none; border-radius:6px;">Confirm Subscription</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 40px 0 40px;" align="center">
                <p style="margin:0; font-family:Arial, Helvetica, sans-serif; font-size:12px; line-height:1.5; color:#948d7e;">This confirmation link expires in 48 hours.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 40px 0 40px;">
                <p style="margin:0 0 8px 0; font-family:Arial, Helvetica, sans-serif; font-size:12px; line-height:1.5; color:#948d7e; text-align:center;">If the button doesn't work, copy and paste this link into your browser:</p>
                <p style="margin:0; font-family:Arial, Helvetica, sans-serif; font-size:12px; line-height:1.5; text-align:center; word-break:break-all;"><a href="${confirmUrl.toString()}" target="_blank" style="color:#46618a; text-decoration:underline;">${confirmUrl.toString()}</a></p>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 40px 0 40px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-top:1px solid #ece4d6; font-size:1px; line-height:1px;">&nbsp;</td></tr></table>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 40px 32px 40px;" align="center">
                <p style="margin:0 0 4px 0; font-family:Arial, Helvetica, sans-serif; font-size:12px; line-height:1.5; color:#948d7e;">Didn't request this email?</p>
                <p style="margin:0; font-family:Arial, Helvetica, sans-serif; font-size:12px; line-height:1.5;"><a href="${unsubscribeUrl}" target="_blank" style="color:#948d7e; text-decoration:underline;">Unsubscribe</a></p>
              </td>
            </tr>
          </table>
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%;">
            <tr>
              <td style="padding:24px 40px; text-align:center;">
                <p style="margin:0 0 4px 0; font-family:Arial, Helvetica, sans-serif; font-size:12px; font-weight:bold; color:#948d7e;">CrazyCraft</p>
                <p style="margin:0 0 4px 0; font-family:Arial, Helvetica, sans-serif; font-size:11px; color:#a8a294;">Indian Handicrafts &bull; OEM &bull; Private Label &bull; Bulk Orders</p>
                <p style="margin:0; font-family:Arial, Helvetica, sans-serif; font-size:11px; color:#c2bdb0;">&copy; 2026 CrazyCraft. All rights reserved.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
      text: `CrazyCraft
Indian Handicrafts for Global Buyers

Confirm your subscription

Thanks for signing up for CrazyCraft updates.

Confirm your email to receive product updates, sourcing insights, new collections, and news from CrazyCraft.

Confirm Subscription: ${confirmUrl.toString()}

This confirmation link expires in 48 hours.

If the button doesn't work, copy and paste this link into your browser:
${confirmUrl.toString()}

Didn't request this email? Unsubscribe: ${unsubscribeUrl}

CrazyCraft
Indian Handicrafts \u2022 OEM \u2022 Private Label \u2022 Bulk Orders
\u00A9 2026 CrazyCraft. All rights reserved.`,
    });
    return error ? { ok: false, error } : { ok: true };
  } catch (err) {
    return { ok: false, error: err };
  }
}