import type { Metadata } from "next";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { deriveUnsubscribeToken, constantTimeHexEqual } from "@/lib/newsletter/tokens";
import { UNSUBSCRIBE_COOKIE_NAME, parseUnsubscribeCookie } from "@/lib/newsletter/unsubscribeContext";
import { logSafeDiagnostic } from "@/lib/diagnostics/safeLog.server";
import { unsubscribeNewsletterSubscription } from "./actions";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function UnsubscribePage() {
  const cookieStore = await cookies();
  const ctx = parseUnsubscribeCookie(cookieStore.get(UNSUBSCRIBE_COOKIE_NAME)?.value);
  if (!ctx) return <p>This unsubscribe link is invalid.</p>;

  const admin = createAdminClient();
  const { data: row, error: lookupError } = await admin
    .from("newsletter_subscribers")
    .select("unsubscribe_lifecycle_nonce")
    .eq("id", ctx.id)
    .maybeSingle();

  if (lookupError) {
    logSafeDiagnostic("unsubscribePage.lookup", lookupError);
    return <p>Something went wrong loading this page. Please try again in a moment.</p>;
  }
  if (!row) return <p>This unsubscribe link is invalid.</p>;

  const expectedToken = deriveUnsubscribeToken(ctx.id, row.unsubscribe_lifecycle_nonce);
  if (!constantTimeHexEqual(ctx.token, expectedToken)) return <p>This unsubscribe link is invalid.</p>;

  return (
    <form action={unsubscribeNewsletterSubscription}>
      <button type="submit">Unsubscribe</button>
    </form>
  );
}