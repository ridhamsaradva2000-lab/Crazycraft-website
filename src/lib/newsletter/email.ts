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
      html: `<p>Please confirm your subscription to the CrazyCraft newsletter:</p><p><a href="${confirmUrl.toString()}">Confirm subscription</a></p><p>This link expires in 48 hours.</p><p style="font-size:12px;color:#888;">Didn't request this? <a href="${unsubscribeUrl}">Unsubscribe</a></p>`,
      text: `Please confirm your subscription: ${confirmUrl.toString()}\n\nThis link expires in 48 hours.\n\nDidn't request this? Unsubscribe: ${unsubscribeUrl}`,
    });
    return error ? { ok: false, error } : { ok: true };
  } catch (err) {
    return { ok: false, error: err };
  }
}