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
  const match = /^RFQ-\d{4}-(\d+)$/.exec(rfqReference);
  const sequenceSuffix = match?.[1] ?? (rfqReference || "unknown");
  return `We received your requirement \u00B7 ${sequenceSuffix}`;
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
  ];

  if (detailEntries.length > 0) {
    lines.push("", "Your Requirement Summary", "");
    for (const entry of detailEntries) {
      lines.push(`\u2022 ${entry.label}: ${entry.value}`);
    }
  }

  lines.push(
    "",
    "Our team is reviewing your requirement. Mr. Ridham Saradva will follow up with you shortly regarding pricing, product details, and the next steps for your quotation.",
    "",
    "Regards,",
    "CrazyCraft Sales",
    "",
    `Reference: ${rfqReference}`
  );

  return lines.join("\n");
}

function buildHtmlBody(
  rfqReference: string,
  inquiry: InquiryRow,
  detailEntries: AcknowledgementDetailEntry[]
): string {
  const detailRows = detailEntries
    .map((entry, index) => {
      const isLastRow = index === detailEntries.length - 1;
      const rowPaddingBottom = isLastRow ? "0" : "4px";
      return `<div class="rd-row" style="margin: 0;"><span class="rd-label" style="padding-bottom: ${rowPaddingBottom};">&bull; <strong>${escapeHtml(entry.label)}:</strong></span><span class="rd-gap"> </span><span class="rd-value" style="padding-bottom: ${rowPaddingBottom};">${escapeHtml(entry.value)}</span></div>`;
    })
    .join("\n");

  const detailsSection =
    detailEntries.length > 0
      ? `<p style="margin: 24px 0 12px 0; font-family: Arial, Helvetica, sans-serif; font-size: 15px; color: #1a1a1a;"><strong>Your Requirement Summary</strong></p>
<div class="rd-list" style="margin: 0 0 12px 0; font-family: Arial, Helvetica, sans-serif; font-size: 15px; color: #1a1a1a;">
${detailRows}
</div>`
      : "";

  return `<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    .rd-list { display: table !important; width: 100% !important; }
    .rd-row { display: table-row !important; }
    .rd-label {
      display: table-cell !important;
      white-space: nowrap !important;
      padding-right: 4px !important;
      vertical-align: top !important;
    }
    .rd-gap { display: none !important; }
    .rd-value {
      display: table-cell !important;
      vertical-align: top !important;
    }
  </style>
</head>
<body>
<p style="margin: 0 0 12px 0; font-family: Arial, Helvetica, sans-serif; font-size: 15px; color: #1a1a1a;">Hi <strong>${escapeHtml(inquiry.name)}</strong>,</p>
<p style="margin: 0 0 12px 0; font-family: Arial, Helvetica, sans-serif; font-size: 15px; color: #1a1a1a;">Thank you for your inquiry.<br />
<strong>We&rsquo;ve received your requirement.</strong></p>
${detailsSection}
<p style="margin: 24px 0 12px 0; font-family: Arial, Helvetica, sans-serif; font-size: 15px; color: #1a1a1a;">Our team is reviewing your requirement. <strong>Mr.&nbsp;Ridham&nbsp;Saradva</strong> will follow up with you shortly regarding pricing, product details, and the next steps for your quotation.</p>
<p style="margin: 0 0 12px 0; font-family: Arial, Helvetica, sans-serif; font-size: 15px; color: #1a1a1a;">Regards,<br />
<strong>CrazyCraft Sales</strong></p>
<p style="margin: 0; font-family: Arial, Helvetica, sans-serif; font-size: 15px; color: #1a1a1a;">Reference: <strong>${escapeHtml(rfqReference)}</strong></p>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}