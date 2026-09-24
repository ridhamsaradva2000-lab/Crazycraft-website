import { z } from "zod";

/**
 * Manual admin reply purposes. "acknowledgement" is deliberately
 * excluded -- that value is reserved exclusively for the automatic
 * RFQ acknowledgement path (rfqAcknowledgement.ts); a manual reply must
 * never claim to be the acknowledgement.
 */
export const EMAIL_MESSAGE_PURPOSES = ["quotation", "negotiation", "follow_up", "general"] as const;
export type EmailMessagePurpose = (typeof EMAIL_MESSAGE_PURPOSES)[number];

export const EMAIL_MESSAGE_PURPOSE_LABELS: Record<EmailMessagePurpose, string> = {
  quotation: "Quotation",
  negotiation: "Negotiation",
  follow_up: "Follow-up",
  general: "General",
};

/**
 * Validates a manual admin reply submission. inquiryId is validated
 * here as part of the same composite schema rather than trusted
 * implicitly from a route param -- consistent with this project's
 * existing convention (see updateInquirySchema/addActivityNoteSchema in
 * validations/crm.ts): an id is exactly as much untrusted input as the
 * rest of the form body.
 *
 * clientDedupeKey is a genuine UUID (matching the client_dedupe_key
 * database column's uuid type exactly), generated fresh by the compose
 * UI per submission attempt so the database's partial unique index can
 * guarantee a network retry or double form-submission cannot create two
 * outbound messages.
 */
export const manualReplySchema = z.object({
  inquiryId: z.string().uuid(),
  purpose: z.enum(EMAIL_MESSAGE_PURPOSES),
  textBody: z.string().trim().min(1, "Message cannot be empty").max(20000),
  clientDedupeKey: z.string().uuid(),
});
export type ManualReplyInput = z.infer<typeof manualReplySchema>;