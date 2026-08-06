"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  updateInquirySchema,
  updateQuoteRequestSchema,
  updateSampleSchema,
  addActivityNoteSchema,
  type UpdateInquiryInput,
  type UpdateQuoteRequestInput,
  type UpdateSampleInput,
  type AddActivityNoteInput,
} from "@/lib/validations/crm";

export interface CrmActionResult {
  error: string | null;
  success?: boolean;
}

/**
 * Every action below uses the ORDINARY cookie-scoped server client — the
 * admin's own session, not a privileged secret-key client. This is
 * deliberate and safe: admin_update_inquiry()/admin_update_quote_request()/
 * admin_update_sample_status() are SECURITY DEFINER but each independently
 * checks private.has_admin_role('sales') against the CALLING session
 * before doing anything (Module 2) — a non-admin session gets rejected by
 * the RPC itself regardless of which client called it. lead_activity_log's
 * direct INSERT is similarly RLS-gated to has_admin_role('sales')
 * directly (Module 2), so no RPC is needed for that one at all. Unlike
 * Module 4's public inquiry form, there is no anon/guest path here to
 * defend against — every caller already has an authenticated admin
 * session by the time any of these functions run (enforced by proxy.ts
 * and each page's own layout, per Module 3).
 *
 * Every function below takes ONE composite object (id + body), validated
 * as a single Zod schema — an id is exactly as much untrusted input as
 * the rest of the form, and passing it as a separate, unvalidated
 * parameter is how it would end up skipped by mistake.
 */

function normalizeUuidOrNull(value: string | undefined): string | null {
  return value && value.length > 0 ? value : null;
}

/**
 * Supabase's generated RPC argument types describe the PostgreSQL base
 * type, but do not encode that these function parameters accept SQL NULL.
 * Keep the runtime value unchanged while narrowing only the TypeScript
 * view of the value. Do not use this for validation; every caller below
 * has already passed its Zod schema.
 */
function nullableRpcString(value: string | null): string {
  return value as string;
}

/**
 * followUpAt has ALREADY been validated by updateInquirySchema/
 * updateQuoteRequestSchema (timezoneAwareDateTimeOrEmpty) by the time
 * this runs — either "" or a genuine timezone-bearing ISO string. No
 * re-parsing, no Date construction, no silent fallback to null on an
 * unparseable value: an invalid value is rejected at the Zod boundary
 * before this function is ever called, so this is a plain, infallible
 * pass-through.
 */
function followUpAtToDbValue(value: string): string | null {
  return value === "" ? null : value;
}

export async function updateInquiryAction(input: UpdateInquiryInput): Promise<CrmActionResult> {
  const parsed = updateInquirySchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Please check the form for errors." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_inquiry", {
    p_inquiry_id: parsed.data.inquiryId,
    p_status: parsed.data.status,
    p_lead_score: parsed.data.leadScore,
    p_assigned_to: nullableRpcString(normalizeUuidOrNull(parsed.data.assignedTo)),
    p_follow_up_at: nullableRpcString(followUpAtToDbValue(parsed.data.followUpAt)),
  });

  if (error) {
    // admin_update_inquiry() raises a plain exception if the caller isn't
    // an admin — this is an internal RPC only ever reachable from an
    // already-authenticated admin session (see this file's own top
    // comment), so any error here is unexpected rather than a normal,
    // anticipated outcome. Logged with safe, non-sensitive context only
    // (operation name + error code, never the target id or any error
    // internals); error.message itself is never surfaced to the caller —
    // it can contain schema internals.
    console.error("admin_update_inquiry failed:", error.code);
    return { error: "Could not save changes. Please try again." };
  }

  revalidatePath(`/admin/leads/inquiry/${parsed.data.inquiryId}`);
  revalidatePath("/admin/leads");
  return { error: null, success: true };
}

export async function updateQuoteRequestAction(
  input: UpdateQuoteRequestInput
): Promise<CrmActionResult> {
  const parsed = updateQuoteRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Please check the form for errors." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_quote_request", {
    p_quote_request_id: parsed.data.quoteRequestId,
    p_status: parsed.data.status,
    p_lead_score: parsed.data.leadScore,
    p_assigned_to: nullableRpcString(normalizeUuidOrNull(parsed.data.assignedTo)),
    p_follow_up_at: nullableRpcString(followUpAtToDbValue(parsed.data.followUpAt)),
    p_notes: nullableRpcString(parsed.data.notes || null),
  });

  if (error) {
    console.error("admin_update_quote_request failed:", error.code);
    return { error: "Could not save changes. Please try again." };
  }

  revalidatePath(`/admin/leads/quote-request/${parsed.data.quoteRequestId}`);
  revalidatePath("/admin/leads");
  return { error: null, success: true };
}

export async function updateSampleAction(input: UpdateSampleInput): Promise<CrmActionResult> {
  const parsed = updateSampleSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Please check the form for errors." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_sample_status", {
    p_sample_id: parsed.data.sampleId,
    p_sample_status: parsed.data.sampleStatus,
    p_payment_status: parsed.data.paymentStatus,
    p_assigned_to: nullableRpcString(normalizeUuidOrNull(parsed.data.assignedTo)),
    p_courier_name: nullableRpcString(parsed.data.courierName || null),
    p_tracking_number: nullableRpcString(parsed.data.trackingNumber || null),
    p_sample_charge: parsed.data.sampleCharge,
    p_currency: parsed.data.currency.toUpperCase(),
    p_shipping_country: nullableRpcString(parsed.data.shippingCountry || null),
    p_shipping_address: nullableRpcString(parsed.data.shippingAddress || null),
    p_shipping_port: nullableRpcString(parsed.data.shippingPort || null),
  });

  if (error) {
    console.error("admin_update_sample_status failed:", error.code);
    return { error: "Could not save changes. Please try again." };
  }

  revalidatePath(`/admin/samples/${parsed.data.sampleId}`);
  revalidatePath("/admin/samples");
  return { error: null, success: true };
}

/**
 * Adds a manual timeline entry (e.g. "Called the buyer, left a
 * voicemail"). No RPC needed — lead_activity_log's own RLS policy
 * ("sales can insert lead_activity_log", Module 2) already gates this to
 * has_admin_role('sales') directly, and the guard-insert trigger
 * unconditionally forces created_by := auth.uid() and created_at := now()
 * regardless of what's passed here — this action doesn't (and couldn't)
 * set either of those itself.
 */
export async function addActivityNoteAction(input: AddActivityNoteInput): Promise<CrmActionResult> {
  const parsed = addActivityNoteSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Enter a note before saving." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("lead_activity_log").insert({
    inquiry_id: parsed.data.inquiryId ?? null,
    quote_request_id: parsed.data.quoteRequestId ?? null,
    sample_id: parsed.data.sampleId ?? null,
    event_type: "note",
    note: parsed.data.note,
  });

  if (error) {
    console.error("addActivityNoteAction failed:", error.code);
    return { error: "Could not save your note. Please try again." };
  }

  if (parsed.data.inquiryId) {
    revalidatePath(`/admin/leads/inquiry/${parsed.data.inquiryId}`);
  }
  if (parsed.data.quoteRequestId) {
    revalidatePath(`/admin/leads/quote-request/${parsed.data.quoteRequestId}`);
  }
  if (parsed.data.sampleId) {
    revalidatePath(`/admin/samples/${parsed.data.sampleId}`);
  }

  return { error: null, success: true };
}
