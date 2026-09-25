import "server-only";
import { Resend } from "resend";
import type {
  SalesEmailProvider,
  SalesEmailSendInput,
  SalesEmailSendResult,
  SalesEmailThreadingMode,
} from "@/lib/email/provider";

/**
 * Exact allowed visible senders for the sales mailbox, mirrored from
 * gmailProvider.ts's own ALLOWED_SENDERS list. Kept as a separate,
 * independent constant here (not imported from gmailProvider.ts) so
 * this provider has zero Gmail SDK/module dependency at all.
 */
const ALLOWED_SENDERS: ReadonlyArray<{ email: string; name: string }> = [
  { email: "sales@crazycraftglobal.com", name: "CrazyCraft Sales" },
  { email: "ridham@crazycraftglobal.com", name: "Ridham Saradva" },
];

function isAllowedSender(input: SalesEmailSendInput["from"]): boolean {
  return ALLOWED_SENDERS.some(
    (sender) => sender.email === input.email && sender.name === input.name
  );
}

/**
 * Resend-backed SalesEmailProvider (Stage 7AG-II C5).
 *
 * threadingMode is "rfc_headers": this provider has no native,
 * provider-opaque thread-continuation mechanism. providerThreadId is
 * NEVER fabricated, read, or returned as anything other than null --
 * threading is expressed entirely via standard In-Reply-To/References
 * headers, supplied by the caller and passed through unchanged.
 *
 * rfcMessageId is ALWAYS null on a successful send from this provider.
 * The canonical, Resend-delivered RFC Message-ID is deliberately NOT
 * fetched here -- Resend's Sending-access API keys cannot call any GET
 * endpoint, and even with a broader key, fetching immediately after
 * send would be racing against Resend's own async delivery pipeline.
 * The real value is obtained later, out of band, via a signed
 * email.sent webhook (a separate, future stage) -- this provider's job
 * ends the moment Resend accepts the send request.
 *
 * Uses ONLY the root API key passed in explicitly by the caller
 * (provider.ts's getSalesEmailProvider(), sourced from
 * salesEmailEnv.RESEND_ROOT_API_KEY). Never reads the existing
 * newsletter RESEND_API_KEY, and has no import of or dependency on
 * env.server.ts or the newsletter module in any way.
 */
export class ResendSalesEmailProvider implements SalesEmailProvider {
  readonly isConfigured = true;
  readonly threadingMode: SalesEmailThreadingMode = "rfc_headers";

  private readonly resend: Resend;

  constructor(apiKey: string) {
    this.resend = new Resend(apiKey);
  }

  async send(input: SalesEmailSendInput): Promise<SalesEmailSendResult> {
    if (!isAllowedSender(input.from)) {
      return { ok: false, errorCode: "unknown_provider_error" };
    }

    const headers: Record<string, string> = {};
    if (input.inReplyTo) {
      headers["In-Reply-To"] = input.inReplyTo;
    }
    if (input.references) {
      headers["References"] = input.references;
    }

    try {
      const response = await this.resend.emails.send(
        {
          from: `${input.from.name} <${input.from.email}>`,
          to: input.to,
          subject: input.subject,
          text: input.textBody,
          ...(input.htmlBody ? { html: input.htmlBody } : {}),
          ...(Object.keys(headers).length > 0 ? { headers } : {}),
          tags: [{ name: "email_message_id", value: input.correlationId }],
        },
        { idempotencyKey: input.correlationId }
      );

      if (response.error || !response.data) {
        // Bounded failure only -- the raw response.error object is
        // deliberately never logged, persisted, or returned. C5 maps
        // every Resend-side failure to the existing bounded code; no
        // new Resend-specific error code is introduced in this stage.
        return { ok: false, errorCode: "unknown_provider_error" };
      }

      return {
        ok: true,
        providerMessageId: response.data.id,
        providerThreadId: null,
        rfcMessageId: null,
      };
    } catch {
      // Any thrown exception (network error, SDK-internal error, etc.)
      // -- same bounded mapping, same never-log-raw-detail discipline.
      return { ok: false, errorCode: "unknown_provider_error" };
    }
  }
}
