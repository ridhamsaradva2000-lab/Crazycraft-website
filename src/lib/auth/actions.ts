"use server";

import { redirect } from "next/navigation";
import type { Route } from "next";
import { createClient } from "@/lib/supabase/server";
import { ensureBuyerProfile } from "@/lib/auth/buyer-profile";
import {
  loginSchema,
  magicLinkSchema,
  buyerRegisterSchema,
  buyerProfileSchema,
  type LoginInput,
  type MagicLinkInput,
  type BuyerRegisterInput,
  type BuyerProfileInput,
} from "@/lib/validations/auth";
import { clientEnv } from "@/lib/env.client";
import { getSafeRedirectPath } from "@/lib/auth/safe-redirect";

type ActionResult = { error: string | null };

/**
 * Buyer sign-in. Deliberately generic on failure ("Incorrect email or
 * password") rather than distinguishing "no such account" from "wrong
 * password" — the standard mitigation against account enumeration.
 *
 * redirectTo defaults to /dashboard but honors proxy.ts's ?next= param so
 * a buyer bounced off a protected page lands back where they meant to
 * go. Validated through the single centralized safe-redirect helper —
 * see src/lib/auth/safe-redirect.ts for the full rejection list.
 */
export async function signInBuyerAction(
  input: LoginInput,
  redirectTo?: string
): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Enter a valid email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { error: "Incorrect email or password." };
  }

  redirect(getSafeRedirectPath(redirectTo) as Route);
}

/**
 * Admin sign-in. Same underlying Supabase Auth call as buyer sign-in
 * (there is only one auth.users table) — the distinction is entirely
 * whether the signed-in user has an admin_users row. If not, the session
 * is torn down immediately rather than left active with nowhere
 * authorized to go.
 */
export async function signInAdminAction(input: LoginInput): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Enter a valid email and password." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error || !data.user) {
    return { error: "Incorrect email or password." };
  }

  const { data: adminRow, error: adminError } = await supabase
    .from("admin_users")
    .select("id")
    .eq("id", data.user.id)
    .maybeSingle();

  if (adminError || !adminRow) {
    await supabase.auth.signOut();
    return { error: "This account is not authorized for admin access." };
  }

  redirect("/admin");
}

/**
 * Buyer registration. Profile fields are stashed in Supabase Auth's
 * user_metadata (via options.data) at signUp time, since a session may
 * not exist until the user confirms their email — see
 * ensureBuyerProfile() for why and where the buyers row actually gets
 * created.
 */
export async function signUpBuyerAction(
  input: BuyerRegisterInput
): Promise<ActionResult & { needsEmailConfirmation?: boolean }> {
  const parsed = buyerRegisterSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form for errors." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${clientEnv.NEXT_PUBLIC_SITE_URL}/auth/confirm?next=/dashboard`,
      data: {
        company_name: parsed.data.companyName,
        business_type: parsed.data.businessType,
        country: parsed.data.country,
        phone: parsed.data.phone || null,
        website: parsed.data.website || null,
      },
    },
  });

  if (error) {
    // Supabase returns a generic-enough message for "already registered"
    // in most configurations; pass it through rather than guessing.
    return { error: error.message };
  }

  if (!data.user) {
    return { error: "Something went wrong creating your account. Please try again." };
  }

  if (data.session) {
    // Auto-confirm is on (local dev) — a session exists immediately.
    const { error: profileError } = await ensureBuyerProfile(supabase, data.user);
    if (profileError) {
      return { error: profileError };
    }
    redirect("/dashboard");
  }

  // No session yet — email confirmation is required before the buyers
  // row can be created (see /auth/confirm/route.ts).
  return { error: null, needsEmailConfirmation: true };
}

export async function signOutAction(): Promise<never> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

/**
 * Passwordless sign-in link for EXISTING accounts only. Does not
 * redirect — the user needs to check their email, so this just reports
 * success/failure back to the form.
 *
 * shouldCreateUser is explicitly false: the UI labels this "sign in",
 * and a separate registration form already exists to collect the
 * company/business details every buyer account needs. Without this
 * flag, signInWithOtp() would silently create a bare auth.users account
 * for any email address typed in, bypassing registration entirely and
 * leaving a buyer with no company profile and no path back to filling
 * it in through the normal flow.
 */
export async function sendMagicLinkAction(
  input: MagicLinkInput,
  redirectTo?: string
): Promise<ActionResult> {
  const parsed = magicLinkSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Enter a valid email address." };
  }

  const safeRedirect = getSafeRedirectPath(redirectTo);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${clientEnv.NEXT_PUBLIC_SITE_URL}/auth/confirm?next=${encodeURIComponent(safeRedirect)}`,
    },
  });

  if (error) {
    // With shouldCreateUser: false, an unrecognized email produces an
    // error here rather than silently creating an account — this is the
    // expected, intended outcome for that case, not just a generic
    // failure, so the message points the person at registration instead
    // of implying something went technically wrong.
    return {
      error:
        "We couldn't send a sign-in link for that email. If you don't have an account yet, please register instead.",
    };
  }

  return { error: null };
}

/**
 * Google OAuth sign-in. Requires the Google provider to be enabled in the
 * Supabase dashboard (Authentication → Providers) with a client ID/secret
 * configured there — that's external platform configuration, not
 * something this code can turn on by itself. Without it enabled, Supabase
 * returns an error here rather than the flow silently failing.
 */
export async function signInWithGoogleAction(redirectTo?: string): Promise<ActionResult> {
  const safeRedirect = getSafeRedirectPath(redirectTo);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${clientEnv.NEXT_PUBLIC_SITE_URL}/auth/callback?next=${encodeURIComponent(safeRedirect)}`,
    },
  });

  if (error || !data.url) {
    return { error: "Google sign-in is not available right now." };
  }

  redirect(data.url as Route);
}

/**
 * Creates or updates the caller's own buyers row (upsert on id, the
 * primary key) — handles both "edit an existing profile" and "a Google
 * OAuth signup with no buyers row yet is completing their profile for
 * the first time" in one code path. Column set matches the grants
 * migration's buyers INSERT/UPDATE grants exactly — verified and
 * created_at are not, and cannot be, part of this action.
 */
export async function updateBuyerProfileAction(
  input: BuyerProfileInput
): Promise<ActionResult & { success?: boolean }> {
  const parsed = buyerProfileSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form for errors." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Your session has expired. Please sign in again." };
  }

  const profileValues = {
  company_name: parsed.data.companyName,
  business_type: parsed.data.businessType,
  country: parsed.data.country,
  phone: parsed.data.phone || null,
  website: parsed.data.website || null,
};

const { data: updatedProfile, error: updateError } = await supabase
  .from("buyers")
  .update(profileValues)
  .eq("id", user.id)
  .select("id")
  .maybeSingle();

let error = updateError;

if (!error && !updatedProfile) {
  const { error: insertError } = await supabase.from("buyers").insert({
    id: user.id,
    ...profileValues,
  });

  error = insertError;
}
 if (error) {
  console.error("updateBuyerProfileAction failed:", {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  });

  return { error: "Could not save your changes. Please try again." };
}

return { error: null, success: true };
}
