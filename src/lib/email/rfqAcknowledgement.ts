import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logSafeDiagnostic } from "@/lib/diagnostics/safeLog.server";
import { buildRfqAcknowledgement, canonicalRfqSubject } from "@/lib/email/acknowledgementBuilder";
import { getSalesEmailProvider } from "@/lib/email/provider";
import type { Database } from "@/types/database.types";

type AdminClient = ReturnType<typeof createAdminClient>;
type ConversationRow = Database["public"]["Tables"]["email_conversations"]["Row"];

const SALES_SENDER = { email: "sales@crazycraftglobal.com", name: "CrazyCraft Sales" };

type ConversationLookupResult =
  | { ok: true; conversation: ConversationRow | null }
  | { ok: false };

/**
 * Distinguishes "genuinely no conversation exists yet" (ok: true,
 * conversation: null) from "we could not determine this" (ok: false).
 * A query/database error must abort the caller's orchestration -- it
 * must NEVER be treated as "doesn't exist" and followed by an insert.
 */
async function loadConversationByInquiryId(
  admin: AdminClient,
  inquiryId: string
): Promise<ConversationLookupResult> {
  const { data, error } = await admin
    .from("email_conversations")
    .select("*")
    .eq("inquiry_id", inquiryId)
    .maybeSingle();

  if (error) {
    logSafeDiagnostic("sendRfqAcknowledgementForInquiry.loadConversation", error);
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
async function syncConversationThreadId(
  admin: AdminClient,
  conversationId: string,
  newThreadId: string
): Promise<void> {
  const { data: claimed, error: claimError } = await admin
    .from("email_conversations")
    .update({ provider_thread_id: newThreadId })
    .eq("id", conversationId)
    .is("provider_thread_id", null)
    .select("id")
    .maybeSingle();

  if (claimError) {
    logSafeDiagnostic("sendRfqAcknowledgementForInquiry.syncThreadId", claimError);
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
    logSafeDiagnostic("sendRfqAcknowledgementForInquiry.syncThreadIdRereadFailed", rereadError);
    return;
  }

  if (!current) {
    logSafeDiagnostic("sendRfqAcknowledgementForInquiry.syncThreadIdConversationMissing", {
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
    logSafeDiagnostic("sendRfqAcknowledgementForInquiry.threadIdMismatch", {
      code: "provider_thread_id_mismatch",
      conversationId,
    });
    return;
  }

  // Still null after re-read -- unexpected/unresolved state. Do NOT
  // perform an unconditional overwrite; log safely for investigation.
  logSafeDiagnostic("sendRfqAcknowledgementForInquiry.syncThreadIdUnresolved", {
    code: "provider_thread_id_still_null_after_claim_miss",
    conversationId,
  });
}

/**
 * Loads the authoritative inquiry, gets-or-creates the ONE conversation
 * for this exact inquiry_id, and attempts to CLAIM the one acknowledgement
 * row for sending. Never throws -- every failure is logged and swallowed;
 * createAdminClient() itself is inside this try so client-construction
 * failures are caught by the same boundary.
 *
 * CONCURRENCY CONTRACT (do not weaken without re-proving all four cases):
 * The ONLY two code paths that may call provider.send() are:
 *   (1) an INSERT of a new acknowledgement row that completes without a
 *       unique-constraint violation on
 *       email_messages_one_acknowledgement_per_conversation, or
 *   (2) an UPDATE ... WHERE status = 'failed' that returns a non-null row.
 * Both are per-invocation, self-verified "did I win" checks. An invocation
 * that merely OBSERVES an existing row (sent, pending, or a failed row it
 * did not itself just claim) always returns without sending. A 'pending'
 * row is NEVER auto-resent by an observing invocation -- it represents an
 * in-flight or crashed state requiring separate future reconciliation.
 */
export async function sendRfqAcknowledgementForInquiry(inquiryId: string): Promise<void> {
  try {
    const admin = createAdminClient();

    const { data: inquiry, error: inquiryError } = await admin
      .from("inquiries")
      .select("*")
      .eq("id", inquiryId)
      .maybeSingle();

    if (inquiryError) {
      logSafeDiagnostic("sendRfqAcknowledgementForInquiry.loadInquiry", inquiryError);
      return;
    }
    if (!inquiry) {
      logSafeDiagnostic("sendRfqAcknowledgementForInquiry.inquiryNotFound", { code: "not_found" });
      return;
    }

    const lookup = await loadConversationByInquiryId(admin, inquiryId);
    if (!lookup.ok) return;

    let conversation = lookup.conversation;

    if (!conversation) {
      const { data: inserted, error: insertError } = await admin
        .from("email_conversations")
        .insert({
          inquiry_id: inquiryId,
          buyer_email: inquiry.email,
          subject: `RFQ from ${inquiry.name}`,
        })
        .select("*")
        .maybeSingle();

      if (insertError) {
        if (insertError.code === "23505") {
          const relookup = await loadConversationByInquiryId(admin, inquiryId);
          if (!relookup.ok || !relookup.conversation) {
            logSafeDiagnostic("sendRfqAcknowledgementForInquiry.conversationRaceUnresolved", insertError);
            return;
          }
          conversation = relookup.conversation;
        } else {
          logSafeDiagnostic("sendRfqAcknowledgementForInquiry.createConversation", insertError);
          return;
        }
      } else if (inserted) {
        conversation = inserted;
      }
    }

    if (!conversation) {
      logSafeDiagnostic("sendRfqAcknowledgementForInquiry.conversationUnavailable", { code: "unavailable" });
      return;
    }

    const canonicalSubject = canonicalRfqSubject(conversation.rfq_reference);
    if (conversation.subject !== canonicalSubject) {
      const { error: subjectUpdateError } = await admin
        .from("email_conversations")
        .update({ subject: canonicalSubject })
        .eq("id", conversation.id);
      if (subjectUpdateError) {
        logSafeDiagnostic("sendRfqAcknowledgementForInquiry.reconcileSubject", subjectUpdateError);
        return;
      }
      conversation = { ...conversation, subject: canonicalSubject };
    }

    let productName: string | null = null;
    if (inquiry.product_id) {
      const { data: product, error: productError } = await admin
        .from("products")
        .select("name")
        .eq("id", inquiry.product_id)
        .maybeSingle();
      if (productError) {
        logSafeDiagnostic("sendRfqAcknowledgementForInquiry.loadProduct", productError);
      } else if (product) {
        productName = product.name;
      }
    }

    const { subject, textBody, htmlBody } = buildRfqAcknowledgement(
      conversation.rfq_reference,
      inquiry,
      productName
    );

    const { data: existingMessage, error: existingMessageError } = await admin
      .from("email_messages")
      .select("id, status")
      .eq("conversation_id", conversation.id)
      .eq("purpose", "acknowledgement")
      .maybeSingle();

    if (existingMessageError) {
      logSafeDiagnostic("sendRfqAcknowledgementForInquiry.loadExistingMessage", existingMessageError);
      return;
    }

    let claimedMessageId: string | null = null;

    if (existingMessage) {
      if (existingMessage.status === "sent") {
        return;
      }
      if (existingMessage.status === "pending") {
        return;
      }
      const { data: claimed, error: claimError } = await admin
        .from("email_messages")
        .update({
          status: "pending",
          error_message: null,
          subject,
          text_body: textBody,
          html_body: htmlBody,
        })
        .eq("id", existingMessage.id)
        .eq("status", "failed")
        .select("id")
        .maybeSingle();

      if (claimError) {
        logSafeDiagnostic("sendRfqAcknowledgementForInquiry.claimFailedRow", claimError);
        return;
      }
      if (!claimed) {
        return;
      }
      claimedMessageId = claimed.id;
    } else {
      const { data: inserted, error: insertMessageError } = await admin
        .from("email_messages")
        .insert({
          conversation_id: conversation.id,
          direction: "outbound",
          purpose: "acknowledgement",
          status: "pending",
          sender_email: SALES_SENDER.email,
          sender_name: SALES_SENDER.name,
          recipient_email: inquiry.email,
          subject,
          text_body: textBody,
          html_body: htmlBody,
        })
        .select("id")
        .maybeSingle();

      if (insertMessageError) {
        if (insertMessageError.code === "23505") {
          return;
        }
        logSafeDiagnostic("sendRfqAcknowledgementForInquiry.createMessage", insertMessageError);
        return;
      }
      if (!inserted) {
        logSafeDiagnostic("sendRfqAcknowledgementForInquiry.createMessageNoRow", { code: "no_row_returned" });
        return;
      }
      claimedMessageId = inserted.id;
    }

    const provider = getSalesEmailProvider();
    const result = await provider.send({ from: SALES_SENDER, to: inquiry.email, subject, textBody, htmlBody });

    if (result.ok) {
      const { error: markSentError } = await admin
        .from("email_messages")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          provider_message_id: result.providerMessageId,
          provider_thread_id: result.providerThreadId,
          rfc_message_id: result.rfcMessageId,
        })
        .eq("id", claimedMessageId);
      if (markSentError) {
        logSafeDiagnostic("sendRfqAcknowledgementForInquiry.markSent", markSentError);
      }

      // Metadata sync only -- atomic, never affects the message status
      // above, which is already durably 'sent' regardless of outcome.
      if (result.providerThreadId) {
        await syncConversationThreadId(admin, conversation.id, result.providerThreadId);
      }
    } else {
      const { error: markFailedError } = await admin
        .from("email_messages")
        .update({ status: "failed", error_message: result.errorCode })
        .eq("id", claimedMessageId);
      if (markFailedError) {
        logSafeDiagnostic("sendRfqAcknowledgementForInquiry.markFailed", markFailedError);
      }
    }
  } catch (err) {
    logSafeDiagnostic("sendRfqAcknowledgementForInquiry.unexpected", err);
  }
}