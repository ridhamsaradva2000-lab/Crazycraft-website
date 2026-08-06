import "server-only";
import { z } from "zod";

/**
 * Server-only secrets.
 *
 * - TURNSTILE_SECRET_KEY: Module 4's spam-protection requirement
 *   (Cloudflare Turnstile). Required — the inquiry form's server action
 *   verifies every submission's Turnstile token server-side before
 *   calling the privileged submit_inquiry() RPC; without this key, that
 *   verification call cannot be made at all, so the form can't function
 *   safely.
 * - SUPABASE_SECRET_KEY: now required. Module 4's security correction
 *   makes submit_inquiry() service_role-only (see
 *   supabase/migrations/20260726090100_create_submit_inquiry_rpc.sql,
 *   in that file's own GRANT/REVOKE statements)
 *   — anon/authenticated calling it directly through the Data API would
 *   bypass Turnstile verification and trusted server-side IP extraction
 *   entirely, since neither of those checks can be expressed inside the
 *   database. This is exactly the privileged client Module 1/2 deferred
 *   creating "until the module that first needs it" — see
 *   src/lib/supabase/admin.ts for the client itself, which is never
 *   imported by any Client Component and is guarded by "server-only".
 * - META_CONVERSIONS_API_TOKEN is added here in Module 7.
 * - TRUSTED_CLIENT_IP_HEADER: optional. Names the HTTP header the
 *   inquiry form's rate limiter should trust as the caller's real IP —
 *   see the extended comment in src/lib/inquiries/actions.ts for why this
 *   is deliberately NOT hardcoded to x-forwarded-for by default, and why
 *   it's opt-in rather than assumed.
 *
 * This file exists to establish the pattern: any future secret is
 * declared here, guarded by "server-only", and never in env.client.ts.
 */
const serverEnvSchema = z.object({
  TURNSTILE_SECRET_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  META_CONVERSIONS_API_TOKEN: z.string().min(1).optional(),
  // Blank ("") is normalized to undefined before validation — an
  // explicitly-blank TRUSTED_CLIENT_IP_HEADER= line (exactly what
  // .env.local.example documents, intentionally left unset) is an empty
  // string, not undefined, and .min(1).optional() alone would reject an
  // empty string rather than treating it as "not configured".
  TRUSTED_CLIENT_IP_HEADER: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional()
  ),
});

const parsed = serverEnvSchema.safeParse({
  TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY,
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  META_CONVERSIONS_API_TOKEN: process.env.META_CONVERSIONS_API_TOKEN,
  TRUSTED_CLIENT_IP_HEADER: process.env.TRUSTED_CLIENT_IP_HEADER,
});

if (!parsed.success) {
  console.error("❌ Invalid server environment variables:", z.treeifyError(parsed.error));
  throw new Error(
    "Invalid server env vars — check .env.local against .env.local.example (TURNSTILE_SECRET_KEY and SUPABASE_SECRET_KEY are required as of Module 4)"
  );
}

export const serverEnv = parsed.data;
