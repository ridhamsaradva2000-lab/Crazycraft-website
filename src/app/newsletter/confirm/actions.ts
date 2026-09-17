"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashConfirmationToken } from "@/lib/newsletter/tokens";
import {
  CONFIRMATION_COOKIE_NAME,
  parseConfirmationCookie,
  confirmationCookieClearOptions,
} from "@/lib/newsletter/confirmationContext";
import { logSafeDiagnostic } from "@/lib/diagnostics/safeLog.server";

export async function confirmNewsletterSubscription() {
  const cookieStore = await cookies();
  const token = parseConfirmationCookie(cookieStore.get(CONFIRMATION_COOKIE_NAME)?.value);

  cookieStore.set(CONFIRMATION_COOKIE_NAME, "", confirmationCookieClearOptions());

  if (!token) redirect("/newsletter/confirm");

  const admin = createAdminClient();
  const hash = hashConfirmationToken(token);

  const { data, error } = await admin
    .from("newsletter_subscribers")
    .update({
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
      confirmation_token_hash: null,
      confirmation_token_expires_at: null,
      confirmation_last_attempt_at: null,
    })
    .eq("confirmation_token_hash", hash)
    .eq("status", "pending")
    .gt("confirmation_token_expires_at", new Date().toISOString())
    .select("id")
    .maybeSingle();

  if (error) {
    logSafeDiagnostic("confirmNewsletterSubscription", error);
    redirect("/newsletter/confirm");
  }
  if (!data) redirect("/newsletter/confirm");
  redirect("/newsletter/confirmed");
}