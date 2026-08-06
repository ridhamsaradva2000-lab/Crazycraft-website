import { z } from "zod";

export const LEAD_STATUS_VALUES = ["new", "contacted", "quoted", "nurturing", "won", "lost"] as const;
export const LEAD_STATUS_LABELS: Record<(typeof LEAD_STATUS_VALUES)[number], string> = {
  new: "New",
  contacted: "Contacted",
  quoted: "Quoted",
  nurturing: "Nurturing",
  won: "Won",
  lost: "Lost",
};

export const SAMPLE_STATUS_VALUES = [
  "requested",
  "approved",
  "payment_pending",
  "paid",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
] as const;
export const SAMPLE_STATUS_LABELS: Record<(typeof SAMPLE_STATUS_VALUES)[number], string> = {
  requested: "Requested",
  approved: "Approved",
  payment_pending: "Payment Pending",
  paid: "Paid",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const PAYMENT_STATUS_VALUES = ["unpaid", "paid", "waived", "refunded"] as const;
export const PAYMENT_STATUS_LABELS: Record<(typeof PAYMENT_STATUS_VALUES)[number], string> = {
  unpaid: "Unpaid",
  paid: "Paid",
  waived: "Waived",
  refunded: "Refunded",
};

/**
 * Either empty (meaning "clear the follow-up reminder") or a genuine
 * ISO-8601 datetime string carrying an explicit timezone/offset marker
 * (ending in "Z" or a +HH:MM/-HH:MM offset) that Date.parse() can
 * actually parse. A bare "YYYY-MM-DDTHH:mm" string — exactly what an
 * HTML <input type="datetime-local"> produces — is deliberately
 * REJECTED here, not silently accepted: it carries no timezone
 * information at all, and interpreting it as anything (the server's own
 * timezone, UTC, whatever Date.parse() happens to assume) would silently
 * misrepresent whatever local time the admin actually selected in their
 * own browser. The client is responsible for converting the
 * datetime-local value to a proper UTC ISO string — using the browser's
 * own Date object, which correctly knows the browser's local timezone —
 * before this schema ever sees it. See LeadUpdateForm's submit handler.
 * An invalid value is a validation ERROR, never silently coerced to null
 * (which would clear an existing reminder without the admin intending
 * that).
 */
const timezoneAwareDateTimeOrEmpty = z.string().refine(
  (val) => val === "" || (/(Z|[+-]\d{2}:\d{2})$/.test(val) && !Number.isNaN(Date.parse(val))),
  { message: "Invalid date/time — please reselect the follow-up date and time" }
);

/**
 * Matches admin_update_inquiry()'s exact parameter set, PLUS the target
 * inquiry's own id — validated together as one composite schema (per
 * the project's own defense-in-depth convention: an ID is exactly as
 * much a piece of untrusted input as the rest of the form body, and
 * validating it separately/implicitly is how it gets skipped by mistake).
 */
export const updateInquirySchema = z.object({
  inquiryId: z.string().uuid(),
  status: z.enum(LEAD_STATUS_VALUES),
  leadScore: z.coerce.number().int().min(0).max(100),
  assignedTo: z.string().uuid().optional().or(z.literal("")),
  followUpAt: timezoneAwareDateTimeOrEmpty,
});
export type UpdateInquiryInput = z.infer<typeof updateInquirySchema>;

/**
 * Matches admin_update_quote_request()'s exact parameter set — the same
 * shape as above (with quoteRequestId instead of inquiryId), plus notes
 * (internal sales notes, quote_requests-only).
 */
export const updateQuoteRequestSchema = z.object({
  quoteRequestId: z.string().uuid(),
  status: z.enum(LEAD_STATUS_VALUES),
  leadScore: z.coerce.number().int().min(0).max(100),
  assignedTo: z.string().uuid().optional().or(z.literal("")),
  followUpAt: timezoneAwareDateTimeOrEmpty,
  notes: z.string().trim().max(4000).optional().or(z.literal("")),
});
export type UpdateQuoteRequestInput = z.infer<typeof updateQuoteRequestSchema>;

/**
 * Matches admin_update_sample_status()'s exact parameter set, plus the
 * target sample's own id.
 */
export const updateSampleSchema = z.object({
  sampleId: z.string().uuid(),
  sampleStatus: z.enum(SAMPLE_STATUS_VALUES),
  paymentStatus: z.enum(PAYMENT_STATUS_VALUES),
  assignedTo: z.string().uuid().optional().or(z.literal("")),
  courierName: z.string().trim().max(200).optional().or(z.literal("")),
  trackingNumber: z.string().trim().max(200).optional().or(z.literal("")),
  sampleCharge: z.coerce.number().min(0).max(999999),
  currency: z
    .string()
    .trim()
    .length(3, "Use a 3-letter currency code, e.g. USD")
    .regex(/^[A-Za-z]{3}$/, "Use a 3-letter currency code, e.g. USD"),
  shippingCountry: z.string().trim().max(100).optional().or(z.literal("")),
  shippingAddress: z.string().trim().max(2000).optional().or(z.literal("")),
  shippingPort: z.string().trim().max(200).optional().or(z.literal("")),
});
export type UpdateSampleInput = z.infer<typeof updateSampleSchema>;

/**
 * A manual timeline note — exactly one of inquiryId/quoteRequestId/sampleId
 * must be set, matching lead_activity_log's own "exactly one parent"
 * guard trigger (Module 2). Enforced here client/server-side as a
 * courtesy; the database trigger is the actual authority. Every id is a
 * genuine UUID, never accepted as a raw/unchecked string.
 */
export const addActivityNoteSchema = z
  .object({
    inquiryId: z.string().uuid().optional(),
    quoteRequestId: z.string().uuid().optional(),
    sampleId: z.string().uuid().optional(),
    note: z.string().trim().min(1, "Enter a note").max(2000),
  })
  .refine(
    (data) => [data.inquiryId, data.quoteRequestId, data.sampleId].filter(Boolean).length === 1,
    { message: "Exactly one of inquiryId/quoteRequestId/sampleId must be set" }
  );
export type AddActivityNoteInput = z.infer<typeof addActivityNoteSchema>;

/**
 * Sample search — trimmed, with a 100-character validation limit here as
 * a friendly, early UI-layer check (Zod's `.max(100)` REJECTS a value
 * over that length; it never truncates one). The actual authorization
 * and enforcement live entirely in the database: `search_samples()`
 * (Module 5 migration) takes the search term as a genuine bound SQL
 * parameter (no PostgREST filter-string interpolation involved at all),
 * requires an explicit CRM sales/super_admin session via
 * `has_admin_role('sales')`, and REJECTS (raises a validation exception,
 * `22023`) any trimmed input over 100 characters inside the function
 * itself — never silently truncating it. This Zod schema is a UX nicety,
 * not the actual boundary; a direct RPC call bypassing this schema
 * entirely still gets the same server-side length rejection and role
 * check. Buyer-facing sample access does not go through this function at
 * all, and never goes through a direct base-table query either — that
 * policy has been dropped entirely. Buyers use `public.buyer_samples`
 * instead, an explicit-column-list view with its own ownership
 * predicate.
 */
export const sampleSearchSchema = z.object({
  q: z.string().trim().max(100).optional(),
});
