import "server-only";
import { randomUUID } from "node:crypto";

/**
 * Thrown when a value destined for a MIME header contains CR/LF, which
 * could otherwise be used to inject additional headers or content into
 * the outgoing message. Checked explicitly for every caller-influenced
 * header value -- never merely tolerated or silently stripped, since
 * silent stripping could mask a real problem upstream.
 */
export class MimeHeaderInjectionError extends Error {
  constructor(fieldName: string) {
    super(`Unsafe header value rejected for field: ${fieldName}`);
    this.name = "MimeHeaderInjectionError";
  }
}

const HEADER_INJECTION_PATTERN = /[\r\n]/;

function assertNoHeaderInjection(value: string, fieldName: string): void {
  if (HEADER_INJECTION_PATTERN.test(value)) {
    throw new MimeHeaderInjectionError(fieldName);
  }
}

const PRINTABLE_ASCII_PATTERN = /^[\x20-\x7E]*$/;

/**
 * RFC 2047 encoded-word for header values containing non-ASCII
 * characters. Printable-ASCII-only values (the common case for every
 * header this module currently produces) pass through unchanged.
 */
function encodeHeaderValue(value: string): string {
  if (PRINTABLE_ASCII_PATTERN.test(value)) {
    return value;
  }
  const base64 = Buffer.from(value, "utf-8").toString("base64");
  return `=?UTF-8?B?${base64}?=`;
}

function generateRfcMessageId(): string {
  return `<${randomUUID()}@crazycraftglobal.com>`;
}

/** Wraps base64 output at 76 characters per RFC 2045. */
function base64EncodeBody(content: string): string {
  const base64 = Buffer.from(content, "utf-8").toString("base64");
  const lines: string[] = [];
  for (let i = 0; i < base64.length; i += 76) {
    lines.push(base64.slice(i, i + 76));
  }
  return lines.join("\r\n");
}

function toBase64Url(message: string): string {
  return Buffer.from(message, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export interface MimeMessageInput {
  fromEmail: string;
  fromName: string;
  to: string;
  subject: string;
  textBody: string;
  htmlBody?: string;
  inReplyTo?: string;
  references?: string;
}

export interface BuiltMimeMessage {
  rfcMessageId: string;
  base64UrlRaw: string;
}

/**
 * Builds a CRLF-terminated RFC 5322 message (multipart/alternative when
 * htmlBody is present, plain text/plain otherwise), base64url-encodes it
 * for Gmail API's `raw` field, and generates a fresh RFC Message-ID
 * locally -- Gmail's gmail.send scope cannot read back a sent message's
 * headers, so this value is never sourced from Gmail itself.
 *
 * Throws MimeHeaderInjectionError if any header-bound value contains
 * CR/LF. Never silently strips or sanitizes such a value.
 */
export function buildMimeMessage(input: MimeMessageInput): BuiltMimeMessage {
  assertNoHeaderInjection(input.fromEmail, "fromEmail");
  assertNoHeaderInjection(input.fromName, "fromName");
  assertNoHeaderInjection(input.to, "to");
  assertNoHeaderInjection(input.subject, "subject");
  if (input.inReplyTo) assertNoHeaderInjection(input.inReplyTo, "inReplyTo");
  if (input.references) assertNoHeaderInjection(input.references, "references");

  const rfcMessageId = generateRfcMessageId();
  const boundary = `----=_Part_${randomUUID().replace(/-/g, "")}`;

  const headers: string[] = [
    `From: ${encodeHeaderValue(input.fromName)} <${input.fromEmail}>`,
    `To: ${input.to}`,
    `Subject: ${encodeHeaderValue(input.subject)}`,
    `Message-ID: ${rfcMessageId}`,
    `MIME-Version: 1.0`,
  ];

  if (input.inReplyTo) headers.push(`In-Reply-To: ${input.inReplyTo}`);
  if (input.references) headers.push(`References: ${input.references}`);

  const hasHtml = typeof input.htmlBody === "string" && input.htmlBody.length > 0;

  let bodySection: string;

  if (!hasHtml) {
    headers.push(`Content-Type: text/plain; charset="UTF-8"`);
    headers.push(`Content-Transfer-Encoding: base64`);
    bodySection = base64EncodeBody(input.textBody);
  } else {
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    const parts: string[] = [
      `--${boundary}`,
      `Content-Type: text/plain; charset="UTF-8"`,
      `Content-Transfer-Encoding: base64`,
      "",
      base64EncodeBody(input.textBody),
      `--${boundary}`,
      `Content-Type: text/html; charset="UTF-8"`,
      `Content-Transfer-Encoding: base64`,
      "",
      base64EncodeBody(input.htmlBody as string),
      `--${boundary}--`,
    ];
    bodySection = parts.join("\r\n");
  }

  const message = headers.join("\r\n") + "\r\n\r\n" + bodySection;
  return { rfcMessageId, base64UrlRaw: toBase64Url(message) };
}