import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { logSafeDiagnostic } from "@/lib/diagnostics/safeLog.server";
import type { Database } from "@/types/database.types";

export type AdminClient = ReturnType<typeof createAdminClient>;
export type ConversationRow = Database["public"]["Tables"]["email_conversations"]["Row"];

export type ConversationLookupResult =
  | { ok: true; conversation: ConversationRow | null }
  | { ok: false };

/**
 * Bounded set of diagnostic operation-name prefixes. TypeScript rejects
 * any other string at every call site -- an arbitrary/free-form or
 * runtime-constructed value can never become part of a
 * logSafeDiagnostic() operation name here, consistent with this
 * project's existing bounded-diagnostic-name discipline elsewhere
 * (e.g. SalesEmailProviderErrorCode).
 */
type ConversationDiagnosticScope = "sendRfqAcknowledgementForInquiry" | "sendManualReply";

/**
 * Default diagnostic scope -- preserves the EXACT existing acknowledgement
 * diagnostic labels (e.g. "sendRfqAcknowledgementForInquiry.loadConversation")
 * for every call site that does not explicitly pass a scope. Stage 3's
 * sendManualReply passes "sendManualReply" explicitly so a manual-reply
 * failure is never logged under the acknowledgement operation name.
 */
const DEFAULT_DIAGNOSTIC_SCOPE: ConversationDiagnosticScope = "sendRfqAcknowledgementForInquiry";

/**
 * Distinguishes "genuinely no conversation exists yet" (ok: true,
 * conversation: null) from "we could not determine this" (ok: false).
 * A query/database error must abort the caller's orchestration -- it
 * must NEVER be treated as "doesn't exist" and followed by an insert.
 */
export async function loadConversationByInquiryId(
  admin: AdminClient,
  inquiryId: string,
  scope: ConversationDiagnosticScope = DEFAULT_DIAGNOSTIC_SCOPE
): Promise<ConversationLookupResult> {
  const { data, error } = await admin
    .from("email_conversations")
    .select("*")
    .eq("inquiry_id", inquiryId)
    .maybeSingle();

  if (error) {
    logSafeDiagnostic(`${scope}.loadConversation`, error);
    return { ok: false };
  }
  return { ok: true, conversation: data };
}

/**
 * Synchronizes the conversation's own provider_thread_id after a
 * CONFIRMED successful provider send. ATOMIC at the database level --
 * see the conditional UPDATE below -- specifically to eliminate a
 * check-then-update race between two concurrent invocations that both
 * observed provider_thread_id as null in memory.
 *
 * The UPDATE's own WHERE clause (id match AND provider_thread_id IS
 * NULL) is the single source of truth for "is this still safe to
 * write" -- not any in-memory value read earlier. Exactly one
 * concurrent caller's UPDATE can affect a row when the column is
 * transitioning from null to a value; every other concurrent caller's
 * UPDATE affects zero rows for that same transition, because Postgres
 * re-evaluates the WHERE clause against the now-committed state.
 *
 * This step running, racing, or failing has NO bearing on the
 * already-sent message's status -- it is a best-effort metadata sync,
 * never a trigger for changing message status or resending. No thread
 * ID values are ever logged.
 */
export async function syncConversationThreadId(
  admin: AdminClient,
  conversationId: string,
  newThreadId: string,
  scope: ConversationDiagnosticScope = DEFAULT_DIAGNOSTIC_SCOPE
): Promise<void> {
  const { data: claimed, error: claimError } = await admin
    .from("email_conversations")
    .update({ provider_thread_id: newThreadId })
    .eq("id", conversationId)
    .is("provider_thread_id", null)
    .select("id")
    .maybeSingle();

  if (claimError) {
    logSafeDiagnostic(`${scope}.syncThreadId`, claimError);
    return;
  }

  if (claimed) {
    // This invocation's atomic claim succeeded -- the column
    // transitioned from null to newThreadId. Done.
    return;
  }

  // Affected zero rows: either the column was already non-null before
  // this call, or a concurrent caller won the same atomic claim first.
  // Re-read ONLY the current value to classify -- never overwrite
  // unconditionally from here.
  const { data: current, error: rereadError } = await admin
    .from("email_conversations")
    .select("provider_thread_id")
    .eq("id", conversationId)
    .maybeSingle();

  if (rereadError) {
    logSafeDiagnostic(`${scope}.syncThreadIdRereadFailed`, rereadError);
    return;
  }

  if (!current) {
    logSafeDiagnostic(`${scope}.syncThreadIdConversationMissing`, {
      code: "conversation_missing_on_reread",
    });
    return;
  }

  if (current.provider_thread_id === newThreadId) {
    // Benign: a concurrent caller already wrote the exact same value.
    return;
  }

  if (current.provider_thread_id !== null) {
    // A DIFFERENT non-null value already exists. Never overwrite --
    // log a bounded diagnostic (no thread ID values) for manual review.
    logSafeDiagnostic(`${scope}.threadIdMismatch`, {
      code: "provider_thread_id_mismatch",
      conversationId,
    });
    return;
  }

  // Still null after re-read -- unexpected/unresolved state. Do NOT
  // perform an unconditional overwrite; log safely for investigation.
  logSafeDiagnostic(`${scope}.syncThreadIdUnresolved`, {
    code: "provider_thread_id_still_null_after_claim_miss",
    conversationId,
  });
}