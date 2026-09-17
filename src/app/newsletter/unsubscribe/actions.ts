"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { deriveUnsubscribeToken, constantTimeHexEqual } from "@/lib/newsletter/tokens";
import {
  UNSUBSCRIBE_COOKIE_NAME,
  parseUnsubscribeCookie,
  unsubscribeCookieClearOptions,
} from "@/lib/newsletter/unsubscribeContext";
import { logSafeDiagnostic } from "@/lib/diagnostics/safeLog.server";

export async function unsubscribeNewsletterSubscription() {
  const cookieStore = await cookies();
  const ctx = parseUnsubscribeCookie(cookieStore.get(UNSUBSCRIBE_COOKIE_NAME)?.value);

  cookieStore.set(UNSUBSCRIBE_COOKIE_NAME, "", unsubscribeCookieClearOptions());

  if (!ctx) redirect("/newsletter/unsubscribe");

  const admin = createAdminClient();
  const { data: row, error: lookupError } = await admin
    .from("newsletter_subscribers")
    .select("unsubscribe_lifecycle_nonce")
    .eq("id", ctx.id)
    .maybeSingle();
  if (lookupError) {
    logSafeDiagnostic("unsubscribeNewsletterSubscription.lookup", lookupError);
    redirect("/newsletter/unsubscribe");
  }
  if (!row) redirect("/newsletter/unsubscribe");

  const verifiedNonce = row.unsubscribe_lifecycle_nonce;
  const expectedToken = deriveUnsubscribeToken(ctx.id, verifiedNonce);
  if (!constantTimeHexEqual(ctx.token, expectedToken)) redirect("/newsletter/unsubscribe");

  const { data: updated, error: updateError } = await admin
    .from("newsletter_subscribers")
    .update({
      status: "unsubscribed",
      unsubscribed_at: new Date().toISOString(),
      confirmation_token_hash: null,
      confirmation_token_expires_at: null,
      confirmation_last_attempt_at: null,
    })
    .eq("id", ctx.id)
    .eq("unsubscribe_lifecycle_nonce", verifiedNonce)
    .select("id")
    .maybeSingle();

  if (updateError) {
    logSafeDiagnostic("unsubscribeNewsletterSubscription.update", updateError);
    redirect("/newsletter/unsubscribe");
  }
  if (!updated) redirect("/newsletter/unsubscribe");
  redirect("/newsletter/unsubscribed");
}