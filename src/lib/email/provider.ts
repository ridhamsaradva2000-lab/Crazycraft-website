import "server-only";

/**
 * Bounded provider-failure contract. error_message in email_messages
 * stores ONLY one of these fixed codes -- never raw exception text, HTTP
 * response bodies, tokens, or buyer content. A future real Gmail provider
 * implementation MUST map any caught exception into one of these codes
 * before returning; raw diagnostic detail goes through logSafeDiagnostic
 * only, never persisted to the database.
 */
export type SalesEmailProviderErrorCode =
  | "gmail_provider_not_configured"
  | "gmail_authentication_failed"
  | "gmail_send_failed"
  | "gmail_rate_limited"
  | "unknown_provider_error";

export interface SalesEmailSendInput {
  from: { email: string; name: string };
  to: string;
  subject: string;
  textBody: string;
  htmlBody?: string;
  inReplyTo?: string;
  references?: string;
  // Existing Gmail thread ID for a FUTURE same-conversation reply
  // (quotation/negotiation/follow-up). Establishes the provider
  // boundary correctly now; unused/omitted for the initial
  // acknowledgement call, since no thread exists yet at that point.
  providerThreadId?: string;
}

export interface SalesEmailSendSuccess {
  ok: true;
  providerMessageId: string;
  providerThreadId: string | null;
  rfcMessageId: string | null;
}

export interface SalesEmailSendFailure {
  ok: false;
  errorCode: SalesEmailProviderErrorCode;
}

export type SalesEmailSendResult = SalesEmailSendSuccess | SalesEmailSendFailure;

export interface SalesEmailProvider {
  readonly isConfigured: boolean;
  send(input: SalesEmailSendInput): Promise<SalesEmailSendResult>;
}

/**
 * Always-unconfigured provider. NEVER pretends a send succeeded. No
 * Gmail SDK dependency is used or required.
 */
export class NotConfiguredSalesEmailProvider implements SalesEmailProvider {
  readonly isConfigured = false;

  async send(): Promise<SalesEmailSendResult> {
    return { ok: false, errorCode: "gmail_provider_not_configured" };
  }
}

/**
 * Always returns NotConfiguredSalesEmailProvider in Phase 1B-ii. A real
 * Gmail-backed implementation is a deliberate future swap, not something
 * that activates implicitly from env var presence.
 */
export function getSalesEmailProvider(): SalesEmailProvider {
  return new NotConfiguredSalesEmailProvider();
}