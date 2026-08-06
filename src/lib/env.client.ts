import { z } from "zod";

/**
 * Public environment variables — safe to bundle into client-side JS.
 *
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY added in Module 4 — required for the
 * inquiry form's Turnstile widget to render at all.
 *
 * NEXT_PUBLIC_TURNSTILE_ACTION — the `action` value passed to Turnstile's
 * render() call AND the value the server's verifyTurnstileToken() checks
 * the siteverify response against (see src/lib/inquiries/actions.ts).
 * This is env-driven rather than hardcoded specifically because
 * Cloudflare's published dummy/testing sitekey+secret pair (used for
 * local dev — see .env.local.example) verifies against a fixed test
 * backend that echoes back a fixed action value regardless of what the
 * widget actually requested. A hardcoded "submit_inquiry" action check
 * would make every local-dev Turnstile verification fail against the
 * dummy keys, since the real widget would request "submit_inquiry" but
 * the dummy backend's response wouldn't reflect it back. Local dev sets
 * this to "test" (matching the dummy backend); production must set it to
 * "submit_inquiry" once real Turnstile keys are configured.
 */
const clientEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.string().url(),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1),
  NEXT_PUBLIC_TURNSTILE_ACTION: z.string().min(1),
  NEXT_PUBLIC_META_PIXEL_ID: z
    .string()
    .optional()
    .transform((val) => {
      const trimmed = val?.trim();
      return trimmed && trimmed.length > 0 ? trimmed : undefined;
    }),
});

const parsed = clientEnvSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  NEXT_PUBLIC_TURNSTILE_ACTION: process.env.NEXT_PUBLIC_TURNSTILE_ACTION,
  NEXT_PUBLIC_META_PIXEL_ID: process.env.NEXT_PUBLIC_META_PIXEL_ID,
});

if (!parsed.success) {
  console.error("❌ Invalid public environment variables:", z.treeifyError(parsed.error));
  throw new Error("Invalid public env vars — check .env.local against .env.local.example");
}

export const clientEnv = parsed.data;
