import type { Metadata } from "next";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashConfirmationToken } from "@/lib/newsletter/tokens";
import { CONFIRMATION_COOKIE_NAME, parseConfirmationCookie } from "@/lib/newsletter/confirmationContext";
import { logSafeDiagnostic } from "@/lib/diagnostics/safeLog.server";
import { confirmNewsletterSubscription } from "./actions";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function ConfirmPage() {
  const cookieStore = await cookies();
  const token = parseConfirmationCookie(cookieStore.get(CONFIRMATION_COOKIE_NAME)?.value);
  if (!token) return <p>This confirmation link is invalid or has expired.</p>;

  const admin = createAdminClient();
  const hash = hashConfirmationToken(token);

  const { data, error } = await admin
    .from("newsletter_subscribers")
    .select("status, confirmation_token_expires_at")
    .eq("confirmation_token_hash", hash)
    .maybeSingle();

  if (error) {
    logSafeDiagnostic("confirmPage.lookup", error);
    return <p>Something went wrong loading this page. Please try again in a moment.</p>;
  }

  const isValid =
    !!data && data.status === "pending" && new Date(data.confirmation_token_expires_at as string) > new Date();
  if (!isValid) return <p>This confirmation link is invalid or has expired.</p>;

  return (
    <form action={confirmNewsletterSubscription}>
      <button type="submit">Confirm subscription</button>
    </form>
  );
}