import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashConfirmationToken } from "@/lib/newsletter/tokens";
import { CONFIRMATION_COOKIE_NAME, parseConfirmationCookie } from "@/lib/newsletter/confirmationContext";
import { logSafeDiagnostic } from "@/lib/diagnostics/safeLog.server";
import { confirmNewsletterSubscription } from "./actions";
import { ConfirmSubmitButton } from "./ConfirmSubmitButton";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

function NewsletterConfirmShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center bg-paper px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-paper-muted bg-white p-8 text-center shadow-sm sm:p-10">
        {children}
      </div>
    </div>
  );
}

function ReturnHomeLink({ variant }: { variant: "button" | "text" }) {
  if (variant === "button") {
    return (
      <Link
        href="/"
        className="mt-8 inline-flex items-center justify-center rounded-md border border-paper-muted px-5 py-2.5 font-body text-sm font-medium text-ink transition-colors hover:bg-paper-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-900 focus-visible:ring-offset-2"
      >
        Return to Home
      </Link>
    );
  }
  return (
    <Link
      href="/"
      className="mt-4 inline-flex items-center justify-center rounded font-body text-sm text-ink-muted underline-offset-4 transition-colors hover:text-ink hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-900 focus-visible:ring-offset-2"
    >
      Return to Home
    </Link>
  );
}

export default async function ConfirmPage() {
  const cookieStore = await cookies();
  const token = parseConfirmationCookie(cookieStore.get(CONFIRMATION_COOKIE_NAME)?.value);

  if (!token) {
    return (
      <NewsletterConfirmShell>
        <h1 className="font-display text-xl text-brand-900">This link is invalid or has expired</h1>
        <p className="mt-3 font-body text-sm text-ink-muted">
          Please subscribe again from the CrazyCraft site to receive a fresh confirmation link.
        </p>
        <ReturnHomeLink variant="button" />
      </NewsletterConfirmShell>
    );
  }

  const admin = createAdminClient();
  const hash = hashConfirmationToken(token);

  const { data, error } = await admin
    .from("newsletter_subscribers")
    .select("status, confirmation_token_expires_at")
    .eq("confirmation_token_hash", hash)
    .maybeSingle();

  if (error) {
    logSafeDiagnostic("confirmPage.lookup", error);
    return (
      <NewsletterConfirmShell>
        <h1 className="font-display text-xl text-brand-900">Something went wrong</h1>
        <p className="mt-3 font-body text-sm text-ink-muted">
          We couldn&rsquo;t load this page right now. Please try again in a moment.
        </p>
        <ReturnHomeLink variant="button" />
      </NewsletterConfirmShell>
    );
  }

  const isValid =
    !!data && data.status === "pending" && new Date(data.confirmation_token_expires_at as string) > new Date();

  if (!isValid) {
    return (
      <NewsletterConfirmShell>
        <h1 className="font-display text-xl text-brand-900">This link is invalid or has expired</h1>
        <p className="mt-3 font-body text-sm text-ink-muted">
          Please subscribe again from the CrazyCraft site to receive a fresh confirmation link.
        </p>
        <ReturnHomeLink variant="button" />
      </NewsletterConfirmShell>
    );
  }

  return (
    <NewsletterConfirmShell>
      <h1 className="font-display text-2xl font-medium text-brand-900 sm:text-3xl">
        Confirm your subscription
      </h1>
      <p className="mt-3 font-body text-sm text-ink-muted sm:text-base">
        You&rsquo;re one step away from receiving CrazyCraft product updates, sourcing insights, and news.
      </p>
      <form action={confirmNewsletterSubscription} className="mt-8">
        <ConfirmSubmitButton />
      </form>
      <ReturnHomeLink variant="text" />
    </NewsletterConfirmShell>
  );
}