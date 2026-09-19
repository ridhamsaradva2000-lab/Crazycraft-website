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