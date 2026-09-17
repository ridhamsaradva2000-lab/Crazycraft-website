import "server-only";
import { z } from "zod";

export const newsletterSignupResultSchema = z
  .object({
    outcome: z.enum(["rate_limited", "created", "resent", "already_confirmed", "resubscribed", "pending_cooldown"]),
    subscriber_id: z.string().uuid().nullable(),
    unsubscribe_lifecycle_nonce: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
    should_send: z.boolean(),
  })
  .strict();

export type NewsletterSignupResult = z.infer<typeof newsletterSignupResultSchema>;