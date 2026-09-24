import "server-only";
import { gmailEnv } from "@/lib/email/env";
import { buildMimeMessage, MimeHeaderInjectionError } from "@/lib/email/mime";
// Type-only import: this file uses these strictly as compile-time
// types, never as runtime values. Written explicitly as `import type`
// so it is always fully erased regardless of isolatedModules settings
// -- this guarantees NO runtime dependency from gmailProvider.ts back
// to provider.ts, even though provider.ts separately has a real
// runtime dependency on THIS file. Without this, the two files would
// form a genuine runtime circular import.
import type {
  SalesEmailProvider,
  SalesEmailSendInput,
  SalesEmailSendResult,
  SalesEmailProviderErrorCode,
} from "@/lib/email/provider";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const SEND_ENDPOINT = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

const ALLOWED_SENDERS = [
  { email: "sales@crazycraftglobal.com", name: "CrazyCraft Sales" },
  { email: "ridham@crazycraftglobal.com", name: "Ridham Saradva" },
] as const;

function isAllowedSender(input: SalesEmailSendInput["from"]): boolean {
  return ALLOWED_SENDERS.some(
    (sender) => sender.email === input.email && sender.name === input.name
  );
}

/**
 * Pure, side-effect-free extraction of the "Message-ID" header from a
 * Gmail API response's payload.headers array. Case-insensitive header
 * name match (Gmail/RFC 5322 header names are not guaranteed to arrive
 * in any particular casing). Returns null for anything missing,
 * malformed, or empty/whitespace-only -- never throws, never fabricates
 * a value. This is the ONLY source of a response-derived Message-ID
 * candidate used by this provider; the locally-generated MIME candidate
 * (mimeMessage.rfcMessageId) is never returned here under any
 * circumstance, since real staging evidence proved Gmail can silently
 * replace it on delivery. NOTE: a value extracted here reflects what
 * Gmail's send response itself reports -- it is NOT yet independently
 * confirmed to match what the recipient actually received until a
 * staging E2E test compares it against the recipient's own "Show
 * Original" Message-ID.
 */
function extractMessageIdFromHeaders(
  headers: Array<{ name?: string; value?: string }> | undefined
): string | null {
  if (!Array.isArray(headers)) return null;
  const header = headers.find(
    (h) => typeof h?.name === "string" && h.name.toLowerCase() === "message-id"
  );
  if (!header || typeof header.value !== "string") return null;
  const trimmed = header.value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

type TokenRefreshResult =
  | { ok: true; accessToken: string }
  | { ok: false; errorCode: SalesEmailProviderErrorCode };

/**
 * Refreshes a Gmail access token using the configured refresh token.
 * Called once per send -- no caching in this phase, per locked decision.
 * Never logs or persists the client secret, refresh token, or access
 * token; on any failure, only a bounded error code is returned.
 *
 * Token endpoint status-code mapping (corrected):
 *   400 / 401 / 403        -> gmail_authentication_failed (bad credentials)
 *   429                    -> gmail_rate_limited
 *   500-599                -> unknown_provider_error (Google-side outage,
 *                              NOT a credentials problem -- must not be
 *                              misclassified as gmail_authentication_failed)
 *   any other non-2xx      -> gmail_authentication_failed
 *   malformed 2xx response -> gmail_authentication_failed
 *   network/runtime error  -> unknown_provider_error
 */
async function refreshAccessToken(): Promise<TokenRefreshResult> {
  if (
    !gmailEnv.GMAIL_SALES_CLIENT_ID ||
    !gmailEnv.GMAIL_SALES_CLIENT_SECRET ||
    !gmailEnv.GMAIL_SALES_REFRESH_TOKEN
  ) {
    // Defensive re-check: getSalesEmailProvider() already gates
    // construction of this class on isGmailProviderConfigured, but this
    // class never trusts that invariant blindly.
    return { ok: false, errorCode: "gmail_authentication_failed" };
  }

  try {
    const body = new URLSearchParams({
      client_id: gmailEnv.GMAIL_SALES_CLIENT_ID,
      client_secret: gmailEnv.GMAIL_SALES_CLIENT_SECRET,
      refresh_token: gmailEnv.GMAIL_SALES_REFRESH_TOKEN,
      grant_type: "refresh_token",
    });

    const response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!response.ok) {
      if (response.status === 400 || response.status === 401 || response.status === 403) {
        return { ok: false, errorCode: "gmail_authentication_failed" };
      }
      if (response.status === 429) {
        return { ok: false, errorCode: "gmail_rate_limited" };
      }
      if (response.status >= 500 && response.status <= 599) {
        return { ok: false, errorCode: "unknown_provider_error" };
      }
      return { ok: false, errorCode: "gmail_authentication_failed" };
    }

    const data: unknown = await response.json().catch(() => null);
    if (
      !data ||
      typeof data !== "object" ||
      typeof (data as Record<string, unknown>).access_token !== "string"
    ) {
      return { ok: false, errorCode: "gmail_authentication_failed" };
    }

    return { ok: true, accessToken: (data as { access_token: string }).access_token };
  } catch {
    return { ok: false, errorCode: "unknown_provider_error" };
  }
}

/**
 * Real Gmail API-backed SalesEmailProvider. Constructed ONLY by
 * getSalesEmailProvider() in provider.ts when all 3 Gmail env vars are
 * present. Enforces the exact sender identity, refreshes an access
 * token fresh for every send (no caching), builds a CRLF MIME message
 * locally, and calls Gmail's users.messages.send endpoint directly via
 * fetch() -- no googleapis/google-auth-library dependency.
 *
 * Send endpoint status-code mapping (UNCHANGED from prior round):
 *   401 / 403               -> gmail_authentication_failed
 *   429                     -> gmail_rate_limited
 *   other non-2xx           -> gmail_send_failed
 *   malformed 2xx (no id)   -> gmail_send_failed
 *   network/runtime error   -> unknown_provider_error
 */
export class GmailSalesEmailProvider implements SalesEmailProvider {
  readonly isConfigured = true;

  async send(input: SalesEmailSendInput): Promise<SalesEmailSendResult> {
    if (!isAllowedSender(input.from)) {
      // Never silently allow an unapproved From identity.
      return { ok: false, errorCode: "gmail_send_failed" };
    }

    const tokenResult = await refreshAccessToken();
    if (!tokenResult.ok) {
      return { ok: false, errorCode: tokenResult.errorCode };
    }

    let mimeMessage;
    try {
      mimeMessage = buildMimeMessage({
        fromEmail: input.from.email,
        fromName: input.from.name,
        to: input.to,
        subject: input.subject,
        textBody: input.textBody,
        htmlBody: input.htmlBody,
        inReplyTo: input.inReplyTo,
        references: input.references,
      });
    } catch (err) {
      if (err instanceof MimeHeaderInjectionError) {
        return { ok: false, errorCode: "gmail_send_failed" };
      }
      return { ok: false, errorCode: "unknown_provider_error" };
    }

    try {
      const requestBody: { raw: string; threadId?: string } = { raw: mimeMessage.base64UrlRaw };
      // threadId included ONLY for a same-conversation reply -- omitted
      // entirely for the initial acknowledgement, per locked design.
      if (input.providerThreadId) {
        requestBody.threadId = input.providerThreadId;
      }

      const response = await fetch(SEND_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenResult.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (response.status === 401 || response.status === 403) {
        return { ok: false, errorCode: "gmail_authentication_failed" };
      }
      if (response.status === 429) {
        return { ok: false, errorCode: "gmail_rate_limited" };
      }
      if (!response.ok) {
        return { ok: false, errorCode: "gmail_send_failed" };
      }

      const data: unknown = await response.json().catch(() => null);
      if (
        !data ||
        typeof data !== "object" ||
        typeof (data as Record<string, unknown>).id !== "string"
      ) {
        // A 2xx response with no usable Gmail message id is treated as
        // a send failure (not "unknown") -- it is specifically the
        // send endpoint's response that is unusable, not an unrelated/
        // unexpected runtime condition.
        return { ok: false, errorCode: "gmail_send_failed" };
      }

      const parsed = data as {
        id: string;
        threadId?: string;
        payload?: { headers?: Array<{ name?: string; value?: string }> };
      };
      return {
        ok: true,
        providerMessageId: parsed.id,
        providerThreadId: typeof parsed.threadId === "string" ? parsed.threadId : null,
        rfcMessageId: extractMessageIdFromHeaders(parsed.payload?.headers),
      };
    } catch {
      return { ok: false, errorCode: "unknown_provider_error" };
    }
  }
}