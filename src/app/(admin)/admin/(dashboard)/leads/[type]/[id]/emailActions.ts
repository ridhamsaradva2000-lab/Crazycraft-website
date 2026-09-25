"use server";

import { hasAdminRole } from "@/lib/auth/session";
import { logSafeDiagnostic } from "@/lib/diagnostics/safeLog.server";
import {
  sendManualReply,
  type SendManualReplyResult,
  type SendManualReplyFailureReason,
} from "@/lib/email/sendManualReply";
import type { SalesEmailProviderErrorCode } from "@/lib/email/provider";
import { manualReplySchema, type ManualReplyInput } from "@/lib/validations/email";

/**
 * Bounded, UI-safe categories for a provider-level send failure. Never
 * derived from raw Gmail response text -- a fixed mapping from the
 * existing SalesEmailProviderErrorCode union only.
 */
export type EmailReplyErrorCategory =
  | "not_configured"
  | "authentication_failed"
  | "send_failed"
  | "rate_limited"
  | "unknown";

function mapProviderErrorCode(code: SalesEmailProviderErrorCode): EmailReplyErrorCategory {
  switch (code) {
    case "gmail_provider_not_configured":
      return "not_configured";
    case "gmail_authentication_failed":
      return "authentication_failed";
    case "gmail_send_failed":
      return "send_failed";
    case "gmail_rate_limited":
      return "rate_limited";
    case "unknown_provider_error":
      return "unknown";
    default:
      return "unknown";
  }
}

/**
 * Bounded, UI-safe messages for a sendManualReply()-level operational
 * failure. Never derived from raw Supabase error text -- a fixed
 * mapping from the existing SendManualReplyFailureReason union only.
 *
 * Reasons that occur AFTER the pending row may already exist, or under
 * genuine uncertainty about whether a send happened, get the safer
 * "refresh and review" wording rather than "try again" -- the latter
 * could be misread as license for an immediate blind resend, which this
 * function's caller (sendManualReplyAction) never permits automatically
 * regardless of the wording anyway (see retryable/requiresFreshDedupeKey
 * below), but the message itself must not suggest otherwise to a human
 * reading it either.
 */
function mapOperationalErrorReason(reason: SendManualReplyFailureReason): string {
  switch (reason) {
    case "invalid_input":
      return "The reply could not be validated. Please check the message and try again.";
    case "conversation_not_found":
      return "No email conversation was found for this inquiry.";
    case "conversation_lookup_failed":
      return "Refresh and review the email conversation before trying again.";
    case "thread_not_available":
      return "This conversation does not yet have an established email thread.";
    case "threading_metadata_not_available":
      return "This conversation does not yet have a prior sent message to reply to.";
    case "message_lookup_failed":
      return "Refresh and review the email conversation before trying again.";
    case "message_insert_failed":
      return "Refresh and review the email conversation before trying again.";
    case "dedupe_key_conversation_mismatch":
      return "Refresh and review the email conversation before trying again.";
    case "provider_send_outcome_uncertain":
      return "Email send outcome is uncertain. Do not resend. Refresh and review the conversation.";
    case "unexpected_error":
      return "Refresh and review the email conversation before trying again.";
    default:
      return "Refresh and review the email conversation before trying again.";
  }
}

interface EmailReplyActionResultBase {
  /**
   * REAL SENDS (sent / sent_thread_mismatch / sent_threading_metadata_missing
   * / sent_recording_failed / already_sent) are ALWAYS retryable: false --
   * the email genuinely went out (or, for already_sent, already did on a
   * prior attempt). already_in_progress is also retryable: false -- do
   * not resend while a prior attempt may still be in flight.
   *
   * operational_error is ALSO retryable: false -- several of its reasons
   * occur after the pending row may already exist, or under genuine
   * uncertainty about whether a send actually happened, so it is treated
   * with the same caution as a confirmed send rather than as an ordinary,
   * safely-auto-retryable error. A human may still choose to retry
   * manually after reviewing the conversation (see mapOperationalErrorReason),
   * but this field never signals that to the UI as safe-to-automate.
   *
   * Only previous_attempt_failed and failed -- the two outcomes where
   * sendManualReply() has CONFIRMED the send did not succeed -- are
   * retryable: true. validation_error is also retryable: true, since
   * sendManualReply() was never invoked and no message row or send side
   * effect exists in that case.
   */
  retryable: boolean;
  /**
   * true ONLY for previous_attempt_failed and failed -- the only two
   * outcomes where the submitted clientDedupeKey has been durably
   * consumed by a row that is NOT the intended send. Every other outcome
   * is false: either no row was ever created, the row already represents
   * a completed/in-flight send, or the state is uncertain enough
   * (operational_error) that minting a fresh key and resending would be
   * unsafe to suggest automatically.
   */
  requiresFreshDedupeKey: boolean;
}

export type EmailReplyActionResult = EmailReplyActionResultBase &
  (
    | { outcome: "unauthorized" }
    | { outcome: "validation_error"; message: string }
    | { outcome: "sent"; messageId: string }
    | { outcome: "sent_thread_mismatch"; messageId: string }
    | { outcome: "sent_threading_metadata_missing"; messageId: string }
    | { outcome: "sent_recording_failed"; messageId: string }
    | { outcome: "already_sent"; messageId: string }
    | { outcome: "already_in_progress"; messageId: string }
    | { outcome: "previous_attempt_failed"; messageId: string; errorCategory: EmailReplyErrorCategory }
    | { outcome: "failed"; messageId: string; errorCategory: EmailReplyErrorCategory }
    | { outcome: "operational_error"; message: string }
  );

/**
 * Exhaustiveness guard -- if SendManualReplyResult (sendManualReply.ts,
 * untouched by this stage) ever grows a new status without this mapping
 * being updated to match, TypeScript rejects the build at the call site
 * below rather than silently falling through at runtime. If somehow
 * still reached at runtime, the thrown error is caught by this file's
 * own top-level try/catch and surfaced as a bounded operational_error --
 * never propagated to the UI as an unhandled exception.
 */
function assertUnreachableSendManualReplyStatus(value: never): never {
  void value;
  throw new Error("sendManualReplyAction: unmapped SendManualReplyResult status");
}

function mapSendManualReplyResult(result: SendManualReplyResult): EmailReplyActionResult {
  switch (result.status) {
    case "sent":
      return { outcome: "sent", messageId: result.messageId, retryable: false, requiresFreshDedupeKey: false };
    case "sent_thread_mismatch":
      return {
        outcome: "sent_thread_mismatch",
        messageId: result.messageId,
        retryable: false,
        requiresFreshDedupeKey: false,
      };
    case "sent_threading_metadata_missing":
      return {
        outcome: "sent_threading_metadata_missing",
        messageId: result.messageId,
        retryable: false,
        requiresFreshDedupeKey: false,
      };
    case "sent_recording_failed":
      return {
        outcome: "sent_recording_failed",
        messageId: result.messageId,
        retryable: false,
        requiresFreshDedupeKey: false,
      };
    case "already_sent":
      return {
        outcome: "already_sent",
        messageId: result.messageId,
        retryable: false,
        requiresFreshDedupeKey: false,
      };
    case "already_in_progress":
      return {
        outcome: "already_in_progress",
        messageId: result.messageId,
        retryable: false,
        requiresFreshDedupeKey: false,
      };
    case "previous_attempt_failed":
      return {
        outcome: "previous_attempt_failed",
        messageId: result.messageId,
        errorCategory: mapProviderErrorCode(result.errorCode),
        retryable: true,
        requiresFreshDedupeKey: true,
      };
    case "failed":
      return {
        outcome: "failed",
        messageId: result.messageId,
        errorCategory: mapProviderErrorCode(result.errorCode),
        retryable: true,
        requiresFreshDedupeKey: true,
      };
    case "operational_error":
      // NOT auto-retryable -- see EmailReplyActionResultBase.retryable
      // doc comment above for the full reasoning.
      return {
        outcome: "operational_error",
        message: mapOperationalErrorReason(result.reason),
        retryable: false,
        requiresFreshDedupeKey: false,
      };
    default:
      return assertUnreachableSendManualReplyStatus(result);
  }
}

/**
 * Secure server-action boundary for a manual RFQ email reply
 * (quotation/negotiation/follow_up/general), called by the future
 * ReplyComposeForm.tsx (Stage 5).
 *
 * Authorization happens FIRST, before any input validation or database
 * access -- an unauthenticated or under-privileged caller never reaches
 * sendManualReply(), and receives only a generic "unauthorized" outcome
 * that reveals nothing about whether the underlying inquiry or email
 * conversation exists.
 *
 * Input is independently re-validated here via manualReplySchema, even
 * though sendManualReply() also validates internally -- defense in
 * depth at this boundary, not redundant trust in the caller. Only
 * parsed.data is ever used past that point.
 *
 * The sender identity is NEVER accepted as input here -- there is no
 * sender/from field anywhere in this function's signature or in
 * manualReplySchema. sendManualReply() owns the hardcoded
 * "Ridham Saradva <ridham@crazycraftglobal.com>" identity internally;
 * nothing in this file can override it.
 *
 * This function NEVER automatically retries and NEVER mints a fresh
 * clientDedupeKey itself -- every result's retryable/requiresFreshDedupeKey
 * fields describe what a FUTURE, admin-initiated retry may safely do;
 * they are never acted on within this call.
 *
 * No revalidatePath() call in this stage: the current Lead Detail page
 * (page.tsx) does not yet read email_conversations/email_messages at
 * all -- EmailConversation.tsx does not exist yet -- so there is no
 * cached render output that this data could affect yet. Revalidation
 * will be added in Stage 5 alongside the UI that actually displays this
 * data, using the exact literal path `/admin/leads/inquiry/${inquiryId}`
 * with inquiryId already validated as a UUID (never a raw route param),
 * matching the existing convention in crm/actions.ts.
 */
export async function sendManualReplyAction(input: ManualReplyInput): Promise<EmailReplyActionResult> {
  try {
    const authorized = await hasAdminRole("sales");
    if (!authorized) {
      logSafeDiagnostic("sendManualReplyAction.unauthorized", { code: "unauthorized" });
      return { outcome: "unauthorized", retryable: false, requiresFreshDedupeKey: false };
    }

    const parsed = manualReplySchema.safeParse(input);
    if (!parsed.success) {
      logSafeDiagnostic("sendManualReplyAction.invalidInput", { code: "invalid_input" });
      return {
        outcome: "validation_error",
        message: "The reply could not be validated. Please check the message and try again.",
        retryable: true,
        requiresFreshDedupeKey: false,
      };
    }

    const result = await sendManualReply(parsed.data);
    return mapSendManualReplyResult(result);
  } catch (err) {
    logSafeDiagnostic("sendManualReplyAction.unexpected", err);
    return {
      outcome: "operational_error",
      message: "Refresh and review the email conversation before trying again.",
      retryable: false,
      requiresFreshDedupeKey: false,
    };
  }
}