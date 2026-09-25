import "server-only";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { salesEmailEnv } from "@/lib/email/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { logSafeDiagnostic } from "@/lib/diagnostics/safeLog.server";

/**
 * Signed Resend email.sent webhook (Stage 7AG-II C6).
 *
 * Ownership, strictly enforced by this file's own logic, never assumed:
 * the LOCAL SEND PATH owns status, sent_at, and provider_message_id.
 * This webhook enriches ONLY rfc_message_id, and only when doing so
 * does not conflict with what the local send path has already
 * recorded. This handler never writes status, sent_at,
 * provider_thread_id, or error_message, and never sends anything or
 * touches thread sync.
 *
 * At every classification point below, a provider_message_id mismatch
 * is checked BEFORE RFC idempotency -- an RFC value that already
 * matches must never mask an integrity conflict discovered on a later
 * redelivery.
 *
 * Uses this installed SDK's actual header names -- webhook-id,
 * webhook-timestamp, webhook-signature -- which differ from the
 * svix-prefixed names used by some other webhook providers.
 */

const correlationIdSchema = z.string().uuid();

export async function POST(request: Request): Promise<NextResponse> {
  const noStore = { "Cache-Control": "no-store" };

  // ---- 1. Read raw body exactly once -- signature verification is
  // byte-sensitive and must run against the untouched raw text. ----
  const rawBody = await request.text();

  // ---- 2. Read the exact headers this installed SDK/webhook uses. ----
  const headerId = request.headers.get("webhook-id");
  const headerTimestamp = request.headers.get("webhook-timestamp");
  const headerSignature = request.headers.get("webhook-signature");

  // ---- 3. Fail closed on missing server configuration BEFORE any DB
  // client is created or any DB access occurs. ----
  const webhookSecret = salesEmailEnv.RESEND_WEBHOOK_SECRET;
  const rootApiKey = salesEmailEnv.RESEND_ROOT_API_KEY;

  if (!webhookSecret || !rootApiKey) {
    logSafeDiagnostic("resendWebhook.configMissing", { code: "server_config_missing" });
    return NextResponse.json({ ok: false }, { status: 503, headers: noStore });
  }

  if (!headerId || !headerTimestamp || !headerSignature) {
    logSafeDiagnostic("resendWebhook.headersMissing", { code: "signature_headers_missing" });
    return NextResponse.json({ ok: false }, { status: 400, headers: noStore });
  }

  // ---- 4. Verify signature BEFORE any JSON handling beyond the
  // verify() result itself, before any Supabase client creation, and
  // before trusting any event field. Explicit root key only -- never
  // let the SDK fall back to process.env.RESEND_API_KEY, which belongs
  // to the separate newsletter integration. ----
  const resend = new Resend(rootApiKey);

  let event: ReturnType<typeof resend.webhooks.verify>;
  try {
    event = resend.webhooks.verify({
      payload: rawBody,
      headers: {
        id: headerId,
        timestamp: headerTimestamp,
        signature: headerSignature,
      },
      webhookSecret,
    });
  } catch {
    logSafeDiagnostic("resendWebhook.verifyFailed", { code: "signature_verification_failed" });
    return NextResponse.json({ ok: false }, { status: 400, headers: noStore });
  }

  // ---- 5. Ignore non-email.sent events safely. ----
  if (event.type !== "email.sent") {
    return NextResponse.json({ ok: true }, { status: 200, headers: noStore });
  }

  // ---- 6. Require usable, trimmed, non-empty metadata. Bracket access
  // for the tags Record, per the installed SDK's typing. ----
  const emailId = typeof event.data.email_id === "string" ? event.data.email_id.trim() : "";
  const messageId = typeof event.data.message_id === "string" ? event.data.message_id.trim() : "";
  const rawCorrelationId = event.data.tags?.["email_message_id"];
  const correlationId = typeof rawCorrelationId === "string" ? rawCorrelationId.trim() : "";

  if (!emailId || !messageId || !correlationId) {
    logSafeDiagnostic("resendWebhook.metadataMissing", { code: "email_sent_metadata_missing" });
    return NextResponse.json({ ok: true }, { status: 200, headers: noStore });
  }

  const correlationIdParsed = correlationIdSchema.safeParse(correlationId);
  if (!correlationIdParsed.success) {
    logSafeDiagnostic("resendWebhook.correlationIdInvalid", { code: "correlation_id_not_uuid" });
    return NextResponse.json({ ok: true }, { status: 200, headers: noStore });
  }
  const correlationRowId = correlationIdParsed.data;

  // ---- 7. DB access only now, only after full verification and
  // validation. createAdminClient() is synchronous. ----
  const admin = createAdminClient();

  const { data: row, error: selectError } = await admin
    .from("email_messages")
    .select("id, provider_message_id, rfc_message_id")
    .eq("id", correlationRowId)
    .maybeSingle();

  if (selectError) {
    logSafeDiagnostic("resendWebhook.selectFailed", { code: "db_select_failed" });
    return NextResponse.json({ ok: false }, { status: 500, headers: noStore });
  }

  if (!row) {
    logSafeDiagnostic("resendWebhook.rowMissing", { code: "row_not_found" });
    return NextResponse.json({ ok: true }, { status: 200, headers: noStore });
  }

  // ---- 8. Classify current state before attempting any write.
  // Provider conflict is checked FIRST. ----
  if (row.provider_message_id !== null && row.provider_message_id !== emailId) {
    logSafeDiagnostic("resendWebhook.providerConflict", { code: "provider_message_id_conflict" });
    return NextResponse.json({ ok: true }, { status: 200, headers: noStore });
  }

  if (row.rfc_message_id === messageId) {
    return NextResponse.json({ ok: true }, { status: 200, headers: noStore });
  }

  if (row.rfc_message_id !== null) {
    logSafeDiagnostic("resendWebhook.rfcConflict", { code: "rfc_message_id_conflict" });
    return NextResponse.json({ ok: true }, { status: 200, headers: noStore });
  }

  // ---- 9. Conditional update, proving both RFC ownership AND the
  // exact provider-ID state atomically -- never a naked WHERE id = .... ----
  async function attemptConditionalUpdate(requiredProviderMessageId: string | null) {
    let query = admin
      .from("email_messages")
      .update({ rfc_message_id: messageId })
      .eq("id", correlationRowId)
      .is("rfc_message_id", null);

    query =
      requiredProviderMessageId === null
        ? query.is("provider_message_id", null)
        : query.eq("provider_message_id", requiredProviderMessageId);

    return query.select("id").maybeSingle();
  }

  const { data: updated, error: updateError } = await attemptConditionalUpdate(row.provider_message_id);

  if (updateError) {
    logSafeDiagnostic("resendWebhook.updateFailed", { code: "db_update_failed" });
    return NextResponse.json({ ok: false }, { status: 500, headers: noStore });
  }

  if (updated) {
    return NextResponse.json({ ok: true }, { status: 200, headers: noStore });
  }

  // ---- 10. Zero rows affected -- re-read and classify, never guess.
  // Provider conflict checked FIRST again. ----
  const { data: recheckRow, error: recheckError } = await admin
    .from("email_messages")
    .select("id, provider_message_id, rfc_message_id")
    .eq("id", correlationRowId)
    .maybeSingle();

  if (recheckError) {
    logSafeDiagnostic("resendWebhook.recheckFailed", { code: "db_recheck_failed" });
    return NextResponse.json({ ok: false }, { status: 500, headers: noStore });
  }

  if (!recheckRow) {
    logSafeDiagnostic("resendWebhook.rowMissingAfterUpdate", { code: "row_not_found" });
    return NextResponse.json({ ok: true }, { status: 200, headers: noStore });
  }

  if (recheckRow.provider_message_id !== null && recheckRow.provider_message_id !== emailId) {
    logSafeDiagnostic("resendWebhook.providerConflictAfterRecheck", { code: "provider_message_id_conflict" });
    return NextResponse.json({ ok: true }, { status: 200, headers: noStore });
  }

  if (recheckRow.rfc_message_id === messageId) {
    return NextResponse.json({ ok: true }, { status: 200, headers: noStore });
  }

  if (recheckRow.rfc_message_id !== null) {
    logSafeDiagnostic("resendWebhook.rfcConflictAfterRecheck", { code: "rfc_message_id_conflict" });
    return NextResponse.json({ ok: true }, { status: 200, headers: noStore });
  }

  // rfc_message_id still null, provider_message_id state compatible --
  // ONE safe second conditional update against the freshly re-read state.
  const { data: secondUpdate, error: secondUpdateError } = await attemptConditionalUpdate(
    recheckRow.provider_message_id
  );

  if (secondUpdateError) {
    logSafeDiagnostic("resendWebhook.secondUpdateFailed", { code: "db_update_failed" });
    return NextResponse.json({ ok: false }, { status: 500, headers: noStore });
  }

  if (secondUpdate) {
    return NextResponse.json({ ok: true }, { status: 200, headers: noStore });
  }

  // ---- 11. Second update also affected zero rows -- ONE FINAL re-read
  // and classify, provider conflict FIRST again. Never another update
  // loop; a genuinely unresolved state returns a retryable 500. ----
  const { data: finalRow, error: finalReadError } = await admin
    .from("email_messages")
    .select("id, provider_message_id, rfc_message_id")
    .eq("id", correlationRowId)
    .maybeSingle();

  if (finalReadError) {
    logSafeDiagnostic("resendWebhook.finalReadFailed", { code: "db_final_read_failed" });
    return NextResponse.json({ ok: false }, { status: 500, headers: noStore });
  }

  if (!finalRow) {
    logSafeDiagnostic("resendWebhook.rowMissingAfterFinalRead", { code: "row_not_found" });
    return NextResponse.json({ ok: true }, { status: 200, headers: noStore });
  }

  if (finalRow.provider_message_id !== null && finalRow.provider_message_id !== emailId) {
    logSafeDiagnostic("resendWebhook.providerConflictFinal", { code: "provider_message_id_conflict" });
    return NextResponse.json({ ok: true }, { status: 200, headers: noStore });
  }

  if (finalRow.rfc_message_id === messageId) {
    return NextResponse.json({ ok: true }, { status: 200, headers: noStore });
  }

  if (finalRow.rfc_message_id !== null) {
    logSafeDiagnostic("resendWebhook.rfcConflictFinal", { code: "rfc_message_id_conflict" });
    return NextResponse.json({ ok: true }, { status: 200, headers: noStore });
  }

  logSafeDiagnostic("resendWebhook.unresolvedAfterRetry", { code: "state_unresolved" });
  return NextResponse.json({ ok: false }, { status: 500, headers: noStore });
}
