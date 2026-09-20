import "server-only";
import type { Database } from "@/types/database.types";
import { TIMELINE_LABELS } from "@/lib/validations/inquiry";

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

interface AcknowledgementDetailEntry {
  label: string;
  value: string;
}

/**
 * Deterministic acknowledgement builder. Uses ONLY the saved inquiry row
 * and a separately-looked-up authoritative product name -- never
 * client-submitted text. Any field null/absent on the saved inquiry is
 * OMITTED entirely; nothing is ever invented. Timeline is rendered via
 * the canonical TIMELINE_LABELS map (imported, not duplicated) so the
 * buyer never sees a raw enum value.
 */
export function buildRfqAcknowledgement(
  rfqReference: string,
  inquiry: InquiryRow,
  productName: string | null
): RfqAcknowledgementContent {
  const detailEntries: AcknowledgementDetailEntry[] = [];
  if (productName) detailEntries.push({ label: "Product", value: productName });
  if (inquiry.message) detailEntries.push({ label: "Requirement", value: inquiry.message });
  if (inquiry.volume_range) detailEntries.push({ label: "Volume", value: inquiry.volume_range });
  if (inquiry.shipping_country) {
    detailEntries.push({ label: "Destination", value: inquiry.shipping_country });
  }
  // private_label_required is intentionally OMITTED here. The current
  // submit_inquiry call site sends
  // `p_private_label_required: data.privateLabelRequired ?? false`, so a
  // saved `false` does not prove the buyer explicitly selected "No" -- it
  // may also mean the field was simply absent. Per the locked rule ("use
  // only actual submitted values, never invent missing values"), this
  // field cannot be safely rendered until repository evidence proves its
  // provenance (explicit selection vs. default fallback).
  if (inquiry.timeline) {
    const timelineLabel = TIMELINE_LABELS[inquiry.timeline];
    // If the enum ever gains a value not yet present in the canonical
    // label map, omit the line entirely rather than fall back to the
    // raw enum value -- never show anything but a human-friendly label.
    if (timelineLabel) detailEntries.push({ label: "Timeline", value: timelineLabel });
  }

  const subject = canonicalRfqSubject(rfqReference);
  const textBody = buildTextBody(rfqReference, inquiry, detailEntries);
  const htmlBody = buildHtmlBody(rfqReference, inquiry, detailEntries);

  return { subject, textBody, htmlBody };
}

function buildTextBody(
  rfqReference: string,
  inquiry: InquiryRow,
  detailEntries: AcknowledgementDetailEntry[]
): string {
  const lines: string[] = [
    `Hi ${inquiry.name},`,
    "",
    "Thank you for your inquiry.",
    "We've received your requirement.",
    "",
    `Reference: ${rfqReference}`,
  ];

  if (detailEntries.length > 0) {
    lines.push("", "Requirement Details", "");
    for (const entry of detailEntries) {
      lines.push(`${entry.label}: ${entry.value}`);
    }
  }

  lines.push(
    "",
    "Our team is reviewing your requirement. Mr. Ridham Saradva will follow up with you shortly regarding pricing, product details, and the next steps for your quotation.",
    "",
    "Regards,",
    "CrazyCraft Sales"
  );

  return lines.join("\n");
}

function buildHtmlBody(
  rfqReference: string,
  inquiry: InquiryRow,
  detailEntries: AcknowledgementDetailEntry[]
): string {
  const detailLines = detailEntries
    .map((entry) => `<strong>${escapeHtml(entry.label)}:</strong> ${escapeHtml(entry.value)}`)
    .reduce((accumulated, line, index) => {
      if (index === 0) return line;
      // Insert one extra blank line specifically after the
      // "Requirement" detail (typically a longer, free-text field) so
      // it visually separates from the shorter Volume/Destination/
      // Timeline lines that follow. No other pair of details gets
      // extra spacing, and nothing is added if Requirement is last.
      const previousEntry = detailEntries[index - 1];
      const separator = previousEntry?.label === "Requirement" ? "<br /><br />\n" : "<br />\n";
      return `${accumulated}${separator}${line}`;
    }, "");

  const detailsSection =
    detailEntries.length > 0
      ? `<p style="margin: 24px 0 4px 0; font-family: Arial, Helvetica, sans-serif; font-size: 15px; color: #1a1a1a;"><strong>Requirement Details</strong></p>
<p style="margin: 0 0 12px 0; font-family: Arial, Helvetica, sans-serif; font-size: 15px; color: #1a1a1a;">
${detailLines}
</p>`
      : "";

  return `<p style="margin: 0 0 12px 0; font-family: Arial, Helvetica, sans-serif; font-size: 15px; color: #1a1a1a;">Hi <strong>${escapeHtml(inquiry.name)}</strong>,<br />
Thank you for your inquiry.<br />
<strong>We&rsquo;ve received your requirement.</strong></p>
<p style="margin: 0 0 12px 0; font-family: Arial, Helvetica, sans-serif; font-size: 15px; color: #1a1a1a;">Reference: <strong>${escapeHtml(rfqReference)}</strong></p>
${detailsSection}
<p style="margin: 24px 0 12px 0; font-family: Arial, Helvetica, sans-serif; font-size: 15px; color: #1a1a1a;">Our team is reviewing your requirement. <strong>Mr.&nbsp;Ridham&nbsp;Saradva</strong> will follow up with you shortly regarding pricing, product details, and the next steps for your quotation.</p>
<p style="margin: 0; font-family: Arial, Helvetica, sans-serif; font-size: 15px; color: #1a1a1a;">Regards,<br /><strong>CrazyCraft Sales</strong></p>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}