import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";

/**
 * Buyer registration data is stashed in Supabase Auth's user_metadata at
 * signUp() time (see signUpBuyerAction), because a session — and
 * therefore auth.uid(), which every buyers RLS policy and grant depends
 * on — may not exist until later:
 *   - Local dev / auto-confirm on: session exists immediately after
 *     signUp(), so the buyers row is created right away.
 *   - Hosted / email confirmation required: no session yet. The user
 *     clicks the confirmation link, lands on /auth/confirm, a session is
 *     established there, and THIS function runs again to create the row
 *     from the metadata that was stashed at signup time.
 *
 * Idempotent AND safe under concurrent calls: uses upsert with
 * ignoreDuplicates rather than a check-then-insert. A naive "select, then
 * insert if not found" has a race window — e.g. a confirmation link
 * opened in two tabs, or a retried request, could both pass the SELECT
 * and then conflict on INSERT. upsert(..., { ignoreDuplicates: true })
 * lets Postgres's own primary key constraint resolve the race atomically:
 * the first call creates the row, any concurrent/later call is silently
 * a no-op, with no error surfaced either way.
 *
 * Uses the ordinary server client (publishable key), not a privileged
 * one — this only ever writes the calling user's own row, which is
 * exactly what the "buyers can insert own record" RLS policy and the
 * buyers INSERT column grant already allow.
 */
export async function ensureBuyerProfile(
  supabase: SupabaseClient,
  user: User
): Promise<{ error: string | null }> {
  const metadata = user.user_metadata as Record<string, unknown> | null;

  const companyName = typeof metadata?.company_name === "string" ? metadata.company_name : null;
  const businessType = typeof metadata?.business_type === "string" ? metadata.business_type : null;
  const country = typeof metadata?.country === "string" ? metadata.country : null;
  const phone = typeof metadata?.phone === "string" ? metadata.phone : null;
  const website = typeof metadata?.website === "string" ? metadata.website : null;

  if (!companyName || !businessType || !country) {
    // No pending buyer metadata (e.g. an admin account, or a buyer who
    // somehow reached this path without registering through our form) —
    // nothing to create, and not an error.
    return { error: null };
  }

  const { error } = await supabase.from("buyers").upsert(
    {
      id: user.id,
      company_name: companyName,
      business_type: businessType,
      country,
      phone: phone || null,
      website: website || null,
    },
    { onConflict: "id", ignoreDuplicates: true }
  );

  if (error) {
    return { error: error.message };
  }

  return { error: null };
}
