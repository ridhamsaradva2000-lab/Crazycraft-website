import "server-only";
import { isGmailProviderConfigured, salesEmailEnv } from "@/lib/email/env";
import { GmailSalesEmailProvider } from "@/lib/email/gmailProvider";
import { ResendSalesEmailProvider } from "@/lib/email/resendProvider";

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

/**
 * Threading capability of a given SalesEmailProvider implementation.
 * "provider_thread_id" means the provider has a native, opaque
 * thread-continuation mechanism (e.g. Gmail's threadId) that callers
 * must supply on a reply. "rfc_headers" means the provider has no such
 * mechanism -- threading is expressed entirely via standard RFC 5322
 * In-Reply-To/References headers, and no provider-native thread
 * identifier should ever be required or fabricated. This is a property
 * of the PROVIDER, not something callers should infer from which
 * concrete class they happen to hold.
 */
export type SalesEmailThreadingMode = "provider_thread_id" | "rfc_headers";

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
  // Caller-supplied opaque correlation identifier. Providers may use it
  // for idempotency and/or provider-side correlation without knowing
  // its storage origin.
  correlationId: string;
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
  readonly threadingMode: SalesEmailThreadingMode;
  send(input: SalesEmailSendInput): Promise<SalesEmailSendResult>;
}

/**
 * Always-unconfigured provider. NEVER pretends a send succeeded. No
 * Gmail SDK dependency is used or required.
 *
 * Generalized in Stage 7AG-II C4 to accept an optional threadingMode
 * and errorCode, so it can also serve as the temporary explicit-Resend
 * fail-closed placeholder (see getSalesEmailProvider() below) without a
 * second class. The existing no-argument call site is unaffected: both
 * parameters default to exactly the prior hardcoded values, so that
 * behavior is byte-for-byte identical to before this change.
 */
export class NotConfiguredSalesEmailProvider implements SalesEmailProvider {
  readonly isConfigured = false;
  readonly threadingMode: SalesEmailThreadingMode;
  private readonly errorCode: SalesEmailProviderErrorCode;

  constructor(
    threadingMode: SalesEmailThreadingMode = "provider_thread_id",
    errorCode: SalesEmailProviderErrorCode = "gmail_provider_not_configured"
  ) {
    this.threadingMode = threadingMode;
    this.errorCode = errorCode;
  }

  async send(): Promise<SalesEmailSendResult> {
    return { ok: false, errorCode: this.errorCode };
  }
}

/**
 * Provider selection.
 *
 * SALES_EMAIL_PROVIDER unset or "gmail": returns the real Gmail-backed
 * provider only when all 3 Gmail env vars are present
 * (isGmailProviderConfigured) -- partial configuration is deliberately
 * treated as NOT configured, never presented as ready. Otherwise returns
 * the not-configured provider. This is exactly the pre-C4 behavior,
 * unchanged.
 *
 * SALES_EMAIL_PROVIDER="resend": returns the real Resend-backed provider
 * when salesEmailEnv.RESEND_ROOT_API_KEY is present, otherwise a
 * bounded, explicit fail-closed placeholder (threadingMode
 * "rfc_headers", errorCode "unknown_provider_error"). Gmail
 * configuration (isGmailProviderConfigured) is never consulted in this
 * branch under any circumstance -- this is a structural guarantee, not
 * a convention, that explicit Resend selection can NEVER silently fall
 * back to Gmail, whether or not the root key is present and whether or
 * not Gmail credentials are fully configured.
 */
export function getSalesEmailProvider(): SalesEmailProvider {
  if (salesEmailEnv.SALES_EMAIL_PROVIDER === "resend") {
    if (salesEmailEnv.RESEND_ROOT_API_KEY) {
      return new ResendSalesEmailProvider(salesEmailEnv.RESEND_ROOT_API_KEY);
    }
    return new NotConfiguredSalesEmailProvider("rfc_headers", "unknown_provider_error");
  }

  if (isGmailProviderConfigured) {
    return new GmailSalesEmailProvider();
  }
  return new NotConfiguredSalesEmailProvider();
}