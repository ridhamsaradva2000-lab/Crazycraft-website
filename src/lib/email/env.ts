import "server-only";
import { z } from "zod";

/**
 * Isolated, server-only, OPTIONAL configuration for the future Gmail
 * sales-mailbox provider. Deliberately a separate module from
 * src/lib/env.server.ts (not an edit to it). All fields optional;
 * existing builds succeed with none set. No Gmail OAuth is implemented
 * in Phase 1B-ii.
 */
const gmailEnvSchema = z.object({
  GMAIL_SALES_CLIENT_ID: z.string().optional(),
  GMAIL_SALES_CLIENT_SECRET: z.string().optional(),
  GMAIL_SALES_REFRESH_TOKEN: z.string().optional(),
});

const parsed = gmailEnvSchema.safeParse({
  GMAIL_SALES_CLIENT_ID: process.env.GMAIL_SALES_CLIENT_ID,
  GMAIL_SALES_CLIENT_SECRET: process.env.GMAIL_SALES_CLIENT_SECRET,
  GMAIL_SALES_REFRESH_TOKEN: process.env.GMAIL_SALES_REFRESH_TOKEN,
});

if (!parsed.success) {
  throw new Error(`Invalid Gmail sales environment configuration: ${parsed.error.message}`);
}

export const gmailEnv = parsed.data;

export const isGmailProviderConfigured =
  !!gmailEnv.GMAIL_SALES_CLIENT_ID &&
  !!gmailEnv.GMAIL_SALES_CLIENT_SECRET &&
  !!gmailEnv.GMAIL_SALES_REFRESH_TOKEN;

/**
 * Isolated, server-only, OPTIONAL configuration for the future
 * Resend-based sales-email provider (Stage 7AG-II). Deliberately kept
 * separate from the Gmail config above and from src/lib/env.server.ts --
 * not an edit to either. All fields optional; existing builds succeed
 * with none set. This module does NOT implement provider selection,
 * does NOT construct a Resend client, and does NOT reference the
 * existing newsletter API key in any way -- that variable remains
 * fully separate and untouched by this schema.
 *
 * A blank string ("") for any of these three variables is normalized
 * to undefined before validation, matching "unset" semantics exactly --
 * an empty override should never be treated as a meaningfully different
 * state from no override at all.
 *
 * SALES_EMAIL_PROVIDER is deliberately NOT defaulted to "gmail" here --
 * provider-selection fallback behavior is a later, separate concern
 * (Stage 7AG-II C4), not something this parsing module decides.
 */
const emptyStringToUndefined = (value: unknown) => (value === "" ? undefined : value);

const salesEmailEnvSchema = z.object({
  SALES_EMAIL_PROVIDER: z.preprocess(emptyStringToUndefined, z.enum(["gmail", "resend"]).optional()),
  RESEND_ROOT_API_KEY: z.preprocess(emptyStringToUndefined, z.string().optional()),
  RESEND_WEBHOOK_SECRET: z.preprocess(emptyStringToUndefined, z.string().optional()),
});

const salesEmailParsed = salesEmailEnvSchema.safeParse({
  SALES_EMAIL_PROVIDER: process.env.SALES_EMAIL_PROVIDER,
  RESEND_ROOT_API_KEY: process.env.RESEND_ROOT_API_KEY,
  RESEND_WEBHOOK_SECRET: process.env.RESEND_WEBHOOK_SECRET,
});

if (!salesEmailParsed.success) {
  // SALES_EMAIL_PROVIDER is the only field in this schema that can ever
  // fail validation (RESEND_ROOT_API_KEY / RESEND_WEBHOOK_SECRET accept
  // any string or undefined) -- and its own values are never secret, so
  // this error message can never expose a credential.
  throw new Error(`Invalid sales-email provider environment configuration: ${salesEmailParsed.error.message}`);
}

export const salesEmailEnv = salesEmailParsed.data;