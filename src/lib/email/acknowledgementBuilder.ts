import "server-only";
import type { Database } from "@/types/database.types";

type InquiryRow = Database["public"]["Tables"]["inquiries"]["Row"];

export interface RfqAcknowledgementContent {
  subject: string;
  textBody: string;
  htmlBody: string;
}

/**
 * Single source of truth for the canonical subject line -- used both for
 * the outbound acknowledgement message and to reconcile
 * email_conversations.subject, so the two can never drift.
 */
export function canonicalRfqSubject(rfqReference: string): string {
  return `[${rfqReference}] We received your requirement`;
}

/**
 * Deterministic acknowledgement builder. Uses ONLY the saved inquiry row
 * and a separately-looked-up authoritative product name -- never
 * client-submitted text. Any field null/absent on the saved inquiry is
 * OMITTED entirely; nothing is ever invented.
 */
export function buildRfqAcknowledgement(
  rfqReference: string,
  inquiry: InquiryRow,
  productName: string | null
): RfqAcknowledgementContent {
  const detailLines: string[] = [];
  if (productName) detailLines.push(`Product: ${productName}`);
  if (inquiry.volume_range) detailLines.push(`Volume: ${inquiry.volume_range}`);
  if (inquiry.shipping_country) detailLines.push(`Destination: ${inquiry.shipping_country}`);
  // private_label_required is intentionally OMITTED here. The current
  // submit_inquiry call site sends
  // `p_private_label_required: data.privateLabelRequired ?? false`, so a
  // saved `false` does not prove the buyer explicitly selected "No" -- it
  // may also mean the field was simply absent. Per the locked rule ("use
  // only actual submitted values, never invent missing values"), this
  // field cannot be safely rendered until repository evidence proves its
  // provenance (explicit selection vs. default fallback).
  if (inquiry.timeline) detailLines.push(`Timeline: ${inquiry.timeline}`);

  const subject = canonicalRfqSubject(rfqReference);

  const textLines = [
    `Hi ${inquiry.name},`,
    "",
    "Thank you for contacting CrazyCraft.",
    "",
    "We have received your requirement.",
    "",
    `Reference: ${rfqReference}`,
  ];
  if (detailLines.length > 0) {
    textLines.push("");
    textLines.push(...detailLines);
  }
  textLines.push(
    "",
    "Our export team will review the details and follow up with you.",
    "",
    "Regards,",
    "CrazyCraft Sales"
  );
  const textBody = textLines.join("\n");

  const detailHtml =
    detailLines.length > 0 ? `<p>${detailLines.map(escapeHtml).join("<br />")}</p>` : "";

  const htmlBody = `<p>Hi ${escapeHtml(inquiry.name)},</p>
<p>Thank you for contacting CrazyCraft.</p>
<p>We have received your requirement.</p>
<p>Reference: ${escapeHtml(rfqReference)}</p>
${detailHtml}
<p>Our export team will review the details and follow up with you.</p>
<p>Regards,<br />CrazyCraft Sales</p>`;

  return { subject, textBody, htmlBody };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}