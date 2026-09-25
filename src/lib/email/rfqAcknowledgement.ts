import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logSafeDiagnostic } from "@/lib/diagnostics/safeLog.server";
import { buildRfqAcknowledgement, canonicalRfqSubject } from "@/lib/email/acknowledgementBuilder";
import { getSalesEmailProvider } from "@/lib/email/provider";
import {
  loadConversationByInquiryId,
  syncConversationThreadId,
} from "@/lib/email/conversationHelpers";

const SALES_SENDER = { email: "sales@crazycraftglobal.com", name: "CrazyCraft Sales" };

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
    const result = await provider.send({ from: SALES_SENDER, to: inquiry.email, subject, textBody, htmlBody, correlationId: claimedMessageId });

    if (result.ok) {
      // CRITICAL: for an rfc_headers provider (e.g. Resend), rfc_message_id
      // is deliberately OMITTED from this patch entirely -- never set to
      // null. result.rfcMessageId is always null at this point for such a
      // provider (the real value arrives later via a signed webhook, in a
      // future stage); writing null here would silently clobber a
      // webhook-written value if the webhook happened to race ahead of
      // this update. For a provider_thread_id provider (Gmail), behavior
      // is unchanged from before this stage.
      const basePatch = {
        status: "sent" as const,
        sent_at: new Date().toISOString(),
        provider_message_id: result.providerMessageId,
        provider_thread_id: result.providerThreadId,
      };
      const updatePatch =
        provider.threadingMode === "rfc_headers"
          ? basePatch
          : { ...basePatch, rfc_message_id: result.rfcMessageId };

      const { error: markSentError } = await admin
        .from("email_messages")
        .update(updatePatch)
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