import { z } from "zod";

export const NEWSLETTER_SOURCES = ["footer", "newsletter_page"] as const;
export type NewsletterSource = (typeof NEWSLETTER_SOURCES)[number];

export const honeypotProbeSchema = z.object({ honeypot: z.unknown() }).passthrough();

export const newsletterSignupSchema = z
  .object({
    email: z.string().trim().min(3).max(320).email(),
    source: z.enum(NEWSLETTER_SOURCES),
    turnstileToken: z.string().min(1).max(2048),
    honeypot: z.string().max(80),
  })
  .strict();

export type NewsletterSignupInput = z.infer<typeof newsletterSignupSchema>;