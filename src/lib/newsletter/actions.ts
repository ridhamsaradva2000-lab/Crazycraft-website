"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { clientEnv } from "@/lib/env.client";
import { logSafeDiagnostic } from "@/lib/diagnostics/safeLog.server";
import { honeypotProbeSchema, newsletterSignupSchema } from "@/lib/newsletter/validations";
import { newsletterClientIp, getOrCreateVisitorCookie } from "@/lib/newsletter/clientIdentity";
import { checkPreVerificationRateLimit } from "@/lib/newsletter/rateLimit";
import { hmacIdentifier } from "@/lib/newsletter/hmac";
import { generateConfirmationToken, generateLifecycleNonce } from "@/lib/newsletter/tokens";
import { newsletterSignupResultSchema } from "@/lib/newsletter/signupResult";
import { sendNewsletterConfirmationEmail } from "@/lib/newsletter/email";

const NEWSLETTER_TURNSTILE_ACTION = "newsletter_signup";

const GENERIC_RESPONSE = {
  ok: true as const,
  message: "If this address can be subscribed, check your email.",
};
const RETRYABLE_FAILURE = { ok: false as const, error: "retryable" as const };

export async function submitNewsletterSignup(rawInput: unknown) {
  const honeypotProbe = honeypotProbeSchema.safeParse(rawInput);
  if (
    honeypotProbe.success &&
    typeof honeypotProbe.data.honeypot === "string" &&
    honeypotProbe.data.honeypot.length > 0
  ) {
    return GENERIC_RESPONSE;
  }

  const parsed = newsletterSignupSchema.safeParse(rawInput);
  if (!parsed.success) return RETRYABLE_FAILURE;
  const { email, source, turnstileToken } = parsed.data;

  const ip = await newsletterClientIp();
  const visitorId = await getOrCreateVisitorCookie();

  const preOk = await checkPreVerificationRateLimit(visitorId, ip);
  if (!preOk) return RETRYABLE_FAILURE;

  const isProductionRuntime = process.env.NODE_ENV === "production";
  const turnstileResult = await verifyTurnstileToken(turnstileToken, {
    remoteIp: ip ?? undefined,
    expectedHostname: isProductionRuntime ? new URL(clientEnv.NEXT_PUBLIC_SITE_URL).hostname : undefined,
    expectedAction: isProductionRuntime ? NEWSLETTER_TURNSTILE_ACTION : undefined,
  });
  if (!turnstileResult.success) return RETRYABLE_FAILURE;

  const normalizedEmail = email.trim().toLowerCase();
  const { rawToken: confirmRawToken, hash: confirmHash } = generateConfirmationToken();
  const newLifecycleNonce = generateLifecycleNonce();

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("process_newsletter_signup", {
    p_email: email,
    p_email_hash: hmacIdentifier(normalizedEmail),
    p_source: source,
    p_confirmation_token_hash: confirmHash,
    p_confirmation_token_expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
    p_new_unsubscribe_lifecycle_nonce: newLifecycleNonce,
  });

  if (error) {
    logSafeDiagnostic("submitNewsletterSignup.rpc", error);
    return GENERIC_RESPONSE;
  }

  const resultParsed = newsletterSignupResultSchema.safeParse(data);
  if (!resultParsed.success) {
    logSafeDiagnostic("submitNewsletterSignup.resultShape", resultParsed.error);
    return GENERIC_RESPONSE;
  }
  const result = resultParsed.data;

  if (result.should_send && result.subscriber_id && result.unsubscribe_lifecycle_nonce) {
    const sendResult = await sendNewsletterConfirmationEmail(
      email,
      confirmRawToken,
      result.subscriber_id,
      result.unsubscribe_lifecycle_nonce
    );
    if (!sendResult.ok) {
      logSafeDiagnostic("submitNewsletterSignup.emailSend", sendResult.error);
    }
  }

  return GENERIC_RESPONSE;
}