import { NextResponse, type NextRequest } from "next/server";
import { type EmailOtpType, type User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { ensureBuyerProfile } from "@/lib/auth/buyer-profile";
import { getSafeRedirectPath } from "@/lib/auth/safe-redirect";

export async function GET(request: NextRequest) {
  const requestUrl = request.nextUrl;

  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type") as EmailOtpType | null;
  const safePath = getSafeRedirectPath(
    requestUrl.searchParams.get("next"),
  );

  const redirectUrl = requestUrl.clone();
  redirectUrl.search = "";

  const supabase = await createClient();
  let user: User | null = null;

  // PKCE magic-link and OAuth callback flow.
  if (code) {
    const { data, error } =
      await supabase.auth.exchangeCodeForSession(code);

    if (error || !data.user) {
      redirectUrl.pathname = "/login";
      redirectUrl.searchParams.set("error", "confirmation_failed");
      return NextResponse.redirect(redirectUrl);
    }

    user = data.user;
  } else if (tokenHash && type) {
    // Token-hash flow used by custom email confirmation templates.
    const { data, error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });

    if (error || !data.user) {
      redirectUrl.pathname = "/login";
      redirectUrl.searchParams.set("error", "confirmation_failed");
      return NextResponse.redirect(redirectUrl);
    }

    user = data.user;
  } else {
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set(
      "error",
      "missing_confirmation_params",
    );
    return NextResponse.redirect(redirectUrl);
  }

  const { error: profileError } = await ensureBuyerProfile(
    supabase,
    user,
  );

  if (profileError) {
    console.error(
      "ensureBuyerProfile failed after email confirmation:",
      profileError,
    );

    redirectUrl.pathname = safePath;
    redirectUrl.searchParams.set("profile_setup_error", "1");
    return NextResponse.redirect(redirectUrl);
  }

  redirectUrl.pathname = safePath;
  return NextResponse.redirect(redirectUrl);
}