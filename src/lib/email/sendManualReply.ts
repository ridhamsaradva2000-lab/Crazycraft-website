import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logSafeDiagnostic } from "@/lib/diagnostics/safeLog.server";
import {
  loadConversationByInquiryId,
  syncConversationThreadId,
} from "@/lib/email/conversationHelpers";
import { canonicalRfqSubject } from "@/lib/email/acknowledgementBuilder";
import { getSalesEmailProvider, type SalesEmailProviderErrorCode } from "@/lib/email/provider";
import { manualReplySchema, type ManualReplyInput } from "@/lib/validations/email";

/**
 * Hardcoded, server-side-only sender for every manual admin reply. The
 * client/UI never chooses or overrides this -- it is not a parameter
 * anywhere in this function's signature. Must match one of the active
 * provider's own allowed-sender entries EXACTLY (email + name) --
 * gmailProvider.ts's ALLOWED_SENDERS for Gmail, resendProvider.ts's own
 * allowlist for Resend -- or the provider will reject the send.
 */
const MANUAL_REPLY_SENDER = { email: "ridham@crazycraftglobal.com", name: "Ridham Saradva" } as const;

export type SendManualReplyFailureReason =
  | "invalid_input"
  | "conversation_not_found"
  | "conversation_lookup_failed"
  | "thread_not_available"
  | "threading_metadata_not_available"
  | "thread_history_inconsistent"
  | "message_lookup_failed"
  | "message_insert_failed"
  | "dedupe_key_conversation_mismatch"
  | "prior_outbound_message_unresolved"
  | "provider_failure_recording_failed"
  | "provider_send_outcome_uncertain"
  | "unexpected_error";

/**
 * "sent_thread_mismatch", "sent_threading_metadata_missing", and
 * "sent_recording_failed" are all real sends (the email genuinely went
 * out) that nonetheless require distinct, non-retryable handling from a
 * plain "sent" -- a future caller must NEVER treat any of these as
 * license to resend. "failed" remains the existing recorded
 * provider-failure state produced by the existing failure-recording
 * path and follows the existing previous_attempt_failed semantics
 * (retryable with a fresh dedupe key) -- this is unchanged from before
 * this stage, including for Gmail, where a thrown exception and an
 * explicit provider rejection can still map to the same bounded error
 * code. "operational_error" covers fail-closed operational states more
 * broadly: system/database failures distinct from the provider, AND a
 * configured-provider (Resend) send outcome whose final send state
 * could not safely be determined (provider_send_outcome_uncertain) --
 * that specific case must NEVER be treated as license for an automatic
 * resend.
 */
export type SendManualReplyResult =
  | { status: "sent"; messageId: string; providerMessageId: string; providerThreadId: string | null }
  | { status: "sent_thread_mismatch"; messageId: string; providerMessageId: string; providerThreadId: string }
  | { status: "sent_threading_metadata_missing"; messageId: string; providerMessageId: string; providerThreadId: string }
  | { status: "sent_recording_failed"; messageId: string; providerMessageId: string }
  | { status: "already_sent"; messageId: string }
  | { status: "already_in_progress"; messageId: string }
  | { status: "previous_attempt_failed"; messageId: string; errorCode: SalesEmailProviderErrorCode }
  | { status: "failed"; messageId: string; errorCode: SalesEmailProviderErrorCode }
  | { status: "operational_error"; reason: SendManualReplyFailureReason };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Derives a minimal, safely-escaped HTML body directly from the admin's
 * plain-text input -- no rich text is ever accepted (manualReplySchema
 * validates textBody as a plain z.string()), and every character is
 * escaped before being placed into HTML. Wrapped as a full HTML document
 * because mime.ts embeds htmlBody verbatim with no surrounding
 * <html>/<head>/<body> of its own -- the same reason the acknowledgement
 * path's own HTML body is a full document.
 */
function buildManualReplyHtmlBody(textBody: string): string {
  const escapedWithBreaks = escapeHtml(textBody).replace(/\n/g, "<br />\n");
  return `<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body>
<p style="margin: 0; font-family: Arial, Helvetica, sans-serif; font-size: 15px; color: #1a1a1a;">${escapedWithBreaks}</p>
</body>
</html>`;
}

/**
 * Local runtime type guard for SalesEmailProviderErrorCode -- error_message
 * is a free-text database column, so a value read back from it can never
 * be trusted via a type-level cast. Exactly the 5 literals defined in
 * provider.ts; anything else (including null) maps to
 * "unknown_provider_error".
 */
function isSalesEmailProviderErrorCode(value: unknown): value is SalesEmailProviderErrorCode {
  return (
    value === "gmail_provider_not_configured" ||
    value === "gmail_authentication_failed" ||
    value === "gmail_send_failed" ||
    value === "gmail_rate_limited" ||
    value === "unknown_provider_error"
  );
}

/**
 * True only for a string that has at least one non-whitespace character
 * after trimming. Used to treat null, "", and whitespace-only values
 * uniformly as "no usable value" for RFC Message-IDs and Gmail thread
 * IDs -- never as something safe to store, chain a reply from, or send
 * to Gmail.
 */
function isUsableIdentifier(value: string | null): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Sends one manual admin reply (quotation/negotiation/follow_up/general)
 * into an EXISTING RFQ email conversation, continuing the existing email
 * thread -- never as a new effective root. Gmail (threadingMode
 * "provider_thread_id") continues the thread via its own native thread
 * ID plus RFC ancestry as a consistency check; Resend (threadingMode
 * "rfc_headers") continues it via RFC In-Reply-To/References only, with
 * no provider-native thread concept involved. Never throws for an
 * expected business-state outcome -- every known case is returned as a
 * typed SendManualReplyResult. An unexpected exception is caught,
 * logged, and returned as a bounded operational_error rather than
 * propagated.
 *
 * `input` is declared as ManualReplyInput for caller ergonomics, but its
 * TypeScript type provides no RUNTIME guarantee -- this function
 * re-validates via manualReplySchema.safeParse() itself, exactly as
 * every other server-side mutation in this codebase does (see
 * updateInquiryAction in crm/actions.ts), and uses only parsed.data
 * thereafter.
 */
export async function sendManualReply(input: ManualReplyInput): Promise<SendManualReplyResult> {
  try {
    const parsed = manualReplySchema.safeParse(input);
    if (!parsed.success) {
      logSafeDiagnostic("sendManualReply.invalidInput", { code: "invalid_input" });
      return { status: "operational_error", reason: "invalid_input" };
    }
    const data = parsed.data;

    const admin = createAdminClient();

    // ---- Existing conversation only -- never silently create one. ----
    const lookup = await loadConversationByInquiryId(admin, data.inquiryId, "sendManualReply");
    if (!lookup.ok) {
      return { status: "operational_error", reason: "conversation_lookup_failed" };
    }
    if (!lookup.conversation) {
      return { status: "operational_error", reason: "conversation_not_found" };
    }
    const conversation = lookup.conversation;

    // ---- Consult the active provider's threading capability BEFORE
    // any provider-specific ancestry validation runs. Gmail
    // (threadingMode "provider_thread_id") uses its own native thread
    // ID plus RFC ancestry as a consistency check; Resend (threadingMode
    // "rfc_headers") has no provider-native thread concept at all --
    // threading is expressed entirely via RFC In-Reply-To/References
    // headers, built from prior sent messages' own canonical
    // rfc_message_id values, never fabricated. ----
    const provider = getSalesEmailProvider();
    const messageProvider = provider.threadingMode === "rfc_headers" ? "resend" : "gmail";

    // ---- Thread-identity precondition, branched by provider mode.
    // Gmail: an existing, USABLE (non-empty after trim) Gmail thread ID
    // must already be established -- never send with providerThreadId
    // omitted and hope Gmail infers the thread. Resend: the conversation
    // must carry EXACT NULL provider_thread_id -- not merely "no usable
    // value" -- an empty or whitespace-only string is a distinct,
    // invalid state the nullable text column does not itself prevent,
    // and must be rejected just as firmly as a real Gmail thread ID
    // would be. A non-null value of any kind here means this
    // conversation's history belongs to a different transport, and
    // RFC-only threading must never proceed on top of that. ----
    let requiredThreadId: string | null = null;
    if (provider.threadingMode === "rfc_headers") {
      if (conversation.provider_thread_id !== null) {
        return { status: "operational_error", reason: "thread_history_inconsistent" };
      }
    } else {
      if (!isUsableIdentifier(conversation.provider_thread_id)) {
        return { status: "operational_error", reason: "thread_not_available" };
      }
      requiredThreadId = conversation.provider_thread_id.trim();
    }

    // ---- One shared ordered prior-message query for both threading
    // modes -- filters, ordering, and the requirement that EVERY prior
    // sent outbound message (not just the most recent) validate cleanly
    // are unchanged from the original Gmail-only design. A single gap
    // or divergence anywhere in the ancestry is a hard stop: this
    // function must never silently skip a row, chain off an older
    // message instead, or fabricate any identifier. `provider` is now
    // selected alongside the existing columns so the Resend branch
    // below can verify every prior row was actually sent through the
    // same transport. ----
    const { data: priorMessages, error: priorMessagesError } = await admin
      .from("email_messages")
      .select("id, rfc_message_id, provider_thread_id, provider, sent_at, created_at")
      .eq("conversation_id", conversation.id)
      .eq("direction", "outbound")
      .eq("status", "sent")
      .order("sent_at", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });

    if (priorMessagesError) {
      logSafeDiagnostic("sendManualReply.loadPriorMessages", priorMessagesError);
      return { status: "operational_error", reason: "message_lookup_failed" };
    }

    const priorSentOutboundMessages = priorMessages ?? [];

    if (priorSentOutboundMessages.length === 0) {
      return { status: "operational_error", reason: "threading_metadata_not_available" };
    }

    const priorRfcMessageIds: string[] = [];
    if (provider.threadingMode === "rfc_headers") {
      for (const message of priorSentOutboundMessages) {
        if (message.provider !== "resend") {
          return { status: "operational_error", reason: "thread_history_inconsistent" };
        }
        // EXACT NULL required -- not isUsableIdentifier() -- since an
        // empty or whitespace-only provider_thread_id is itself an
        // inconsistent, invalid state for an RFC-only prior message.
        if (message.provider_thread_id !== null) {
          return { status: "operational_error", reason: "thread_history_inconsistent" };
        }
        if (!isUsableIdentifier(message.rfc_message_id)) {
          return { status: "operational_error", reason: "threading_metadata_not_available" };
        }
        priorRfcMessageIds.push(message.rfc_message_id.trim());
      }
    } else {
      for (const message of priorSentOutboundMessages) {
        if (!isUsableIdentifier(message.rfc_message_id)) {
          return { status: "operational_error", reason: "threading_metadata_not_available" };
        }
        if (
          !isUsableIdentifier(message.provider_thread_id) ||
          message.provider_thread_id.trim() !== requiredThreadId
        ) {
          return { status: "operational_error", reason: "thread_history_inconsistent" };
        }
        priorRfcMessageIds.push(message.rfc_message_id.trim());
      }
    }

    const lastPriorMessage = priorRfcMessageIds[priorRfcMessageIds.length - 1];
    if (!lastPriorMessage) {
      // Unreachable given the length check above; keeps
      // noUncheckedIndexedAccess satisfied without an unchecked
      // assertion.
      return { status: "operational_error", reason: "threading_metadata_not_available" };
    }
    const inReplyTo = lastPriorMessage;
    const references = priorRfcMessageIds.join(" ");

    // ---- Same canonical subject already established by the
    // acknowledgement path -- never invented here. ----
    const subject = canonicalRfqSubject(conversation.rfq_reference);
    const recipientEmail = conversation.buyer_email;
    const htmlBody = buildManualReplyHtmlBody(data.textBody);

    // ---- Pre-INSERT pending-outbound precheck. This SELECT is only an
    // early/clear classification optimization -- the REAL concurrency
    // guarantee is the database's own partial unique index
    // (email_messages_one_pending_outbound_per_conversation, verified
    // live on staging). A pending row whose client_dedupe_key matches
    // the CURRENT submission is this same attempt re-observing itself
    // (a network retry / double-click that got past the client-side
    // lock) -- treated as already_in_progress, never a foreign blocker.
    // A pending row with a different (or null -- e.g. the automatic
    // acknowledgement's own pending row, which has no
    // client_dedupe_key) key is a genuinely different in-flight or
    // unresolved send -- this function does not proceed to INSERT or
    // provider.send() while that is true. ----
    const { data: existingPendingOutbound, error: existingPendingOutboundError } = await admin
      .from("email_messages")
      .select("id, client_dedupe_key")
      .eq("conversation_id", conversation.id)
      .eq("direction", "outbound")
      .eq("status", "pending")
      .maybeSingle();

    if (existingPendingOutboundError) {
      logSafeDiagnostic("sendManualReply.pendingOutboundPrecheckFailed", existingPendingOutboundError);
      return { status: "operational_error", reason: "message_lookup_failed" };
    }

    if (existingPendingOutbound) {
      if (existingPendingOutbound.client_dedupe_key === data.clientDedupeKey) {
        return { status: "already_in_progress", messageId: existingPendingOutbound.id };
      }
      return { status: "operational_error", reason: "prior_outbound_message_unresolved" };
    }

    // ---- Insert the pending row FIRST (optimistic insert, not
    // check-then-insert) so the database's own partial unique indexes --
    // both client_dedupe_key's (same-attempt idempotency) and the newer
    // one-pending-outbound-per-conversation index (cross-attempt
    // concurrency safety, since the precheck above is advisory only and
    // cannot itself close a race between two different, concurrent
    // submissions) -- are the actual source of truth for
    // duplicate/concurrent-send detection. Unlike the acknowledgement
    // path (which has no known thread before its first send), a manual
    // reply ALREADY knows its exact target thread and threading headers
    // before provider.send() -- persisting them now means a crash
    // between Gmail's send and the success UPDATE still leaves a
    // pending row recording what this send was targeted at, rather than
    // no threading information at all. ----
    const { data: inserted, error: insertError } = await admin
      .from("email_messages")
      .insert({
        conversation_id: conversation.id,
        direction: "outbound",
        purpose: data.purpose,
        status: "pending",
        sender_email: MANUAL_REPLY_SENDER.email,
        sender_name: MANUAL_REPLY_SENDER.name,
        recipient_email: recipientEmail,
        subject,
        text_body: data.textBody,
        html_body: htmlBody,
        client_dedupe_key: data.clientDedupeKey,
        provider: messageProvider,
        provider_thread_id: requiredThreadId,
        in_reply_to: inReplyTo,
        references_header: references,
      })
      .select("id")
      .maybeSingle();

    if (insertError) {
      if (insertError.code === "23505") {
        // ---- SEMANTIC classification of a 23505 conflict -- NEVER by
        // parsing insertError.message or any constraint name, which is
        // not a stable contract to depend on. Instead, ask the database
        // directly what state actually exists now (fail-closed against
        // the exact race where state changes between the failed INSERT
        // and this lookup):
        //
        // (A) First, look up by the submitted client_dedupe_key -- this
        //     preserves the EXISTING idempotency semantics exactly.
        //     Verify conversation ownership, then classify by status.
        //
        // (B) If NO row exists for that client_dedupe_key, the 23505
        //     was NOT a dedupe-key collision -- check whether an
        //     existing pending outbound row (from the new
        //     one-pending-outbound-per-conversation index) explains it.
        //
        // (C) If neither explains it, fall back to the existing safe
        //     generic message_insert_failed rather than guess.
        //
        // No automatic retry of the INSERT anywhere in this branch. ----
        const { data: existing, error: existingError } = await admin
          .from("email_messages")
          .select("id, conversation_id, status, error_message")
          .eq("client_dedupe_key", data.clientDedupeKey)
          .maybeSingle();

        if (existingError) {
          logSafeDiagnostic("sendManualReply.dedupeLookupFailed", existingError);
          return { status: "operational_error", reason: "message_lookup_failed" };
        }

        if (existing) {
          if (existing.conversation_id !== conversation.id) {
            logSafeDiagnostic("sendManualReply.dedupeKeyConversationMismatch", {
              code: "dedupe_key_conversation_mismatch",
              conversationId: conversation.id,
            });
            return { status: "operational_error", reason: "dedupe_key_conversation_mismatch" };
          }

          if (existing.status === "sent") {
            return { status: "already_sent", messageId: existing.id };
          }
          if (existing.status === "pending") {
            return { status: "already_in_progress", messageId: existing.id };
          }
          // existing.status === "failed"
          const priorErrorCode = isSalesEmailProviderErrorCode(existing.error_message)
            ? existing.error_message
            : "unknown_provider_error";
          return { status: "previous_attempt_failed", messageId: existing.id, errorCode: priorErrorCode };
        }

        // (B) No dedupe-key row explains the conflict -- check for an
        // existing pending outbound row for this conversation.
        const { data: conflictingPendingOutbound, error: conflictingPendingOutboundError } = await admin
          .from("email_messages")
          .select("id")
          .eq("conversation_id", conversation.id)
          .eq("direction", "outbound")
          .eq("status", "pending")
          .maybeSingle();

        if (conflictingPendingOutboundError) {
          logSafeDiagnostic("sendManualReply.conflictingPendingOutboundLookupFailed", conflictingPendingOutboundError);
          return { status: "operational_error", reason: "message_lookup_failed" };
        }

        if (conflictingPendingOutbound) {
          return { status: "operational_error", reason: "prior_outbound_message_unresolved" };
        }

        // (C) Neither known cause explains this 23505 -- fail closed to
        // the existing safe generic rather than guess.
        logSafeDiagnostic("sendManualReply.createMessage", insertError);
        return { status: "operational_error", reason: "message_insert_failed" };
      }

      logSafeDiagnostic("sendManualReply.createMessage", insertError);
      return { status: "operational_error", reason: "message_insert_failed" };
    }

    if (!inserted) {
      logSafeDiagnostic("sendManualReply.createMessageNoRow", { code: "no_row_returned" });
      return { status: "operational_error", reason: "message_insert_failed" };
    }
    const messageId = inserted.id;

    // ---- providerThreadId is supplied only for a provider_thread_id
    // (Gmail) provider, where requiredThreadId is guaranteed non-null by
    // the branch above -- never omitted there, and never fabricated for
    // the other case. For an rfc_headers (Resend) provider, the property
    // is omitted entirely rather than passed as an invented value; the
    // provider contract already treats it as optional. ----
    const result = await provider.send({
      from: MANUAL_REPLY_SENDER,
      to: recipientEmail,
      subject,
      textBody: data.textBody,
      htmlBody,
      inReplyTo,
      references,
      correlationId: messageId,
      ...(requiredThreadId !== null ? { providerThreadId: requiredThreadId } : {}),
    });

    if (!result.ok) {
      // ---- A CONFIGURED rfc_headers (Resend) provider maps BOTH a
      // provider-returned error AND a thrown network/SDK exception to
      // the same bounded unknown_provider_error code, so `!result.ok`
      // here cannot distinguish "Resend explicitly rejected this" from
      // "the response was lost after Resend may already have accepted
      // it". Marking the row failed (implicitly permitting a future
      // fresh-key retry) would risk a real duplicate send if the
      // original request actually succeeded. This case is left
      // genuinely unresolved: the row stays 'pending' (blocking any
      // further attempt via the existing one-pending-outbound
      // constraint), nothing is marked failed, and the signed C6
      // webhook may still arrive and enrich rfc_message_id if Resend
      // did in fact accept the send. ----
      if (provider.threadingMode === "rfc_headers" && provider.isConfigured) {
        logSafeDiagnostic("sendManualReply.providerSendOutcomeUncertain", { code: "provider_send_outcome_uncertain" });
        return { status: "operational_error", reason: "provider_send_outcome_uncertain" };
      }

      // ---- Provider explicitly confirmed no send occurred (Gmail, or
      // an unconfigured rfc_headers placeholder that never attempted a
      // network call at all). Prove the failed-state recording actually
      // affected the expected pending row (id match AND status='pending',
      // via select+maybeSingle) -- the same discipline already used for
      // the successful-send recording below. If recording is unproven (a
      // DB error, or zero rows matched), the row's true persisted state
      // is unknown -- it may still structurally read as 'pending' and
      // occupy the one-pending-outbound-per-conversation index slot,
      // which correctly blocks a naive retry at the INSERT level
      // regardless. But this function's RETURNED result must not claim
      // retryable:true while that state is unresolved -- a fresh-key
      // retry is only safe once 'failed' is durably, provably recorded. ----
      const { data: failedRow, error: markFailedError } = await admin
        .from("email_messages")
        .update({ status: "failed", error_message: result.errorCode })
        .eq("id", messageId)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();

      if (markFailedError || !failedRow) {
        logSafeDiagnostic("sendManualReply.providerFailureRecordingFailed", markFailedError ?? { code: "no_row_updated" });
        return { status: "operational_error", reason: "provider_failure_recording_failed" };
      }

      return { status: "failed", messageId, errorCode: result.errorCode };
    }

    // ---- Success -- the email has genuinely been sent by this point.
    // Gmail (provider_thread_id) and Resend (rfc_headers) have entirely
    // different, non-overlapping success paths below: Gmail's own
    // returned-thread mismatch detection, RFC normalization, and
    // syncConversationThreadId call all remain Gmail-specific concepts
    // that never apply to Resend, whose canonical RFC Message-ID arrives
    // later via the C6 webhook rather than in this response. ----
    if (provider.threadingMode === "rfc_headers") {
      // ---- Resend success. rfc_message_id is deliberately OMITTED from
      // this patch entirely -- never set to null -- because the signed
      // C6 webhook may already have written the real value, or may
      // still be in flight; this local update must never be able to
      // clobber it. provider_thread_id is likewise omitted, never
      // fabricated -- Resend has no such concept. ----
      const { data: updatedRow, error: markSentError } = await admin
        .from("email_messages")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          provider_message_id: result.providerMessageId,
        })
        .eq("id", messageId)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();

      if (markSentError || !updatedRow) {
        logSafeDiagnostic("sendManualReply.sentRecordingFailed", markSentError ?? { code: "no_row_updated" });
        return { status: "sent_recording_failed", messageId, providerMessageId: result.providerMessageId };
      }

      return {
        status: "sent",
        messageId,
        providerMessageId: result.providerMessageId,
        providerThreadId: null,
      };
    }

    // ---- Gmail success -- entirely unchanged from before this stage. ----
    if (requiredThreadId === null) {
      // Unreachable: this point is only reached when
      // provider.threadingMode !== "rfc_headers" (the rfc_headers
      // branch above always returns before reaching here), and
      // requiredThreadId is always assigned a trimmed, non-null string
      // in that case. Kept explicit so TypeScript's control-flow
      // analysis narrows it to string for the rest of this branch,
      // without an unchecked non-null assertion.
      logSafeDiagnostic("sendManualReply.unexpectedMissingThreadId", { code: "unexpected_missing_thread_id" });
      return { status: "operational_error", reason: "unexpected_error" };
    }

    // Never erase the known thread ID if Gmail returns nothing usable;
    // if Gmail returns a DIFFERENT non-empty (after trim) thread ID,
    // that is a mismatch -- logged (without any thread ID value) and
    // prioritized over a missing RFC Message-ID if both occur together,
    // since an explicit contradiction from Gmail is the more significant
    // anomaly. A null/empty/whitespace-only returned thread ID is
    // treated as "no usable value returned" -- NOT as a mismatch -- and
    // falls back to the already-known requiredThreadId.
    const rawGmailReturnedThreadId = result.providerThreadId;
    const gmailReturnedThreadId = isUsableIdentifier(rawGmailReturnedThreadId)
      ? rawGmailReturnedThreadId.trim()
      : null;
    const isMismatch = gmailReturnedThreadId !== null && gmailReturnedThreadId !== requiredThreadId;
    const effectiveProviderThreadId = gmailReturnedThreadId ?? requiredThreadId;

    if (isMismatch) {
      logSafeDiagnostic("sendManualReply.threadIdMismatchOnSend", {
        code: "thread_id_mismatch_on_send",
        messageId,
        conversationId: conversation.id,
      });
    }

    // A null/empty/whitespace-only RFC Message-ID from the provider is
    // never stored as if it were usable -- normalized to null before
    // writing, so a future manual reply's ancestry validation
    // unambiguously treats this row as missing threading metadata
    // rather than possibly misreading a stray whitespace value.
    const normalizedRfcMessageId = isUsableIdentifier(result.rfcMessageId) ? result.rfcMessageId.trim() : null;

    // ---- Recording is attempted UNCONDITIONALLY, regardless of
    // mismatch or a missing RFC Message-ID -- priority order for which
    // result variant is returned is decided AFTER this attempt. Prove
    // the update actually affected the expected pending row (id match
    // AND status='pending', via select+maybeSingle) rather than
    // trusting an absence-of-error. rfc_message_id is stored as the
    // NORMALIZED value (trimmed, or null) -- never the raw, possibly
    // whitespace-only value, and never fabricated. ----
    const { data: updatedRow, error: markSentError } = await admin
      .from("email_messages")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        provider_message_id: result.providerMessageId,
        provider_thread_id: effectiveProviderThreadId,
        rfc_message_id: normalizedRfcMessageId,
      })
      .eq("id", messageId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    // Metadata sync only -- best-effort, independent of the row-update
    // outcome above, and never triggers a resend on its own failure.
    if (gmailReturnedThreadId) {
      await syncConversationThreadId(admin, conversation.id, gmailReturnedThreadId, "sendManualReply");
    }

    // ---- Priority order for a confirmed send (the email already went
    // out in every branch below -- none are ever retried):
    //   1. Recording failed / no row updated -> sent_recording_failed
    //   2. Else Gmail returned a different thread -> sent_thread_mismatch
    //   3. Else RFC Message-ID missing -> sent_threading_metadata_missing
    //   4. Else -> sent
    // ----
    if (markSentError || !updatedRow) {
      logSafeDiagnostic("sendManualReply.sentRecordingFailed", markSentError ?? { code: "no_row_updated" });
      return { status: "sent_recording_failed", messageId, providerMessageId: result.providerMessageId };
    }

    if (isMismatch) {
      return {
        status: "sent_thread_mismatch",
        messageId,
        providerMessageId: result.providerMessageId,
        providerThreadId: effectiveProviderThreadId,
      };
    }

    if (normalizedRfcMessageId === null) {
      return {
        status: "sent_threading_metadata_missing",
        messageId,
        providerMessageId: result.providerMessageId,
        providerThreadId: effectiveProviderThreadId,
      };
    }

    return {
      status: "sent",
      messageId,
      providerMessageId: result.providerMessageId,
      providerThreadId: effectiveProviderThreadId,
    };
  } catch (err) {
    logSafeDiagnostic("sendManualReply.unexpected", err);
    return { status: "operational_error", reason: "unexpected_error" };
  }
}