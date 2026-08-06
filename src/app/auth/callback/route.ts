import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureBuyerProfile } from "@/lib/auth/buyer-profile";
import { getSafeRedirectPath } from "@/lib/auth/safe-redirect";

/**
 * Handles the redirect back from an OAuth provider (Google) after the
 * user grants consent. Exchanges the `code` query param for a session,
 * then — since this is the only entry point for OAuth sign-in, meaning
 * there was no separate registration form to collect company details —
 * ensures at least a minimal buyers row exists so the account isn't
 * stuck with no profile at all. ensureBuyerProfile() is a no-op if there
 * is no pending metadata to work from, which is expected here; a
 * first-time OAuth buyer lands on /dashboard with an incomplete profile
 * and is prompted to fill in company details there.
 */
export async function GET(request: NextRequest) {
  const requestUrl = request.nextUrl;
  const code = requestUrl.searchParams.get("code");
  const safePath = getSafeRedirectPath(requestUrl.searchParams.get("next"));

  // Base every outcome on a clone of the incoming URL, with the query
  // string cleared immediately — the OAuth "code" and raw "next" value
  // must never leak into the final redirect or browser history, and
  // this guarantees a single place they're dropped rather than relying
  // on remembering to omit them in every branch below.
  const redirectUrl = requestUrl.clone();
  redirectUrl.search = "";

  if (!code) {
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("error", "missing_code");
    return NextResponse.redirect(redirectUrl);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("error", "auth_callback_failed");
    return NextResponse.redirect(redirectUrl);
  }

  const { error: profileError } = await ensureBuyerProfile(supabase, data.user);

  if (profileError) {
    // The user IS validly signed in at this point — do not sign them out
    // or treat this as an auth failure. Surface it explicitly instead of
    // silently proceeding as if the profile exists: land on the
    // dashboard with a flag it reads to prompt manual profile
    // completion (the profile page's form already handles a
    // not-yet-created profile via upsert).
    console.error("ensureBuyerProfile failed after OAuth sign-in:", profileError);
    redirectUrl.pathname = safePath;
    redirectUrl.searchParams.set("profile_setup_error", "1");
    return NextResponse.redirect(redirectUrl);
  }

  redirectUrl.pathname = safePath;
  return NextResponse.redirect(redirectUrl);
}
