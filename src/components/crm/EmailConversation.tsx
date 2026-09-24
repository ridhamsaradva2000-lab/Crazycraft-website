import { LocalDateTime } from "@/components/crm/LocalDateTime";

export interface EmailConversationMessage {
  id: string;
  direction: "outbound" | "inbound";
  purpose: "acknowledgement" | "quotation" | "negotiation" | "follow_up" | "general";
  status: "pending" | "sent" | "failed";
  senderName: string | null;
  senderEmail: string;
  recipientEmail: string;
  subject: string;
  textBody: string;
  sentAt: string | null;
  createdAt: string;
}

export interface EmailConversationProps {
  subject: string;
  buyerEmail: string;
  messages: EmailConversationMessage[];
}

const PURPOSE_LABELS: Record<EmailConversationMessage["purpose"], string> = {
  acknowledgement: "Acknowledgement",
  quotation: "Quotation",
  negotiation: "Negotiation",
  follow_up: "Follow-up",
  general: "General",
};

const STATUS_LABELS: Record<EmailConversationMessage["status"], string> = {
  pending: "Sending...",
  sent: "Sent",
  failed: "Failed",
};

const STATUS_CLASSES: Record<EmailConversationMessage["status"], string> = {
  pending: "bg-paper-muted text-ink-muted",
  sent: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
};

/**
 * Safe, read-only presentation of an RFQ email conversation. Receives
 * already-authorized, already-fetched data through props only -- no
 * database query, no service-role client, no server action call, no
 * Gmail send anywhere in this component.
 *
 * Deliberately does NOT accept or render: provider_message_id,
 * provider_thread_id, rfc_message_id, references_header, in_reply_to,
 * raw error_message, client_dedupe_key, or html_body. textBody is
 * rendered as plain, React-escaped text with whitespace-pre-wrap for
 * line-break preservation -- never dangerouslySetInnerHTML.
 *
 * Does not reuse StatusBadge (its current API is lead/sample-specific);
 * uses a small local status presentation instead.
 *
 * Messages are defensively re-sorted by createdAt ascending, independent
 * of the order the caller supplies them in.
 */
export function EmailConversation({ subject, buyerEmail, messages }: EmailConversationProps) {
  const orderedMessages = [...messages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return (
    <div className="rounded-lg border border-paper-muted bg-white p-6">
      <h2 className="font-display text-lg text-brand-900">Email Conversation</h2>
      <p className="mt-1 font-body text-sm text-ink-muted">
        {subject} - {buyerEmail}
      </p>

      {orderedMessages.length === 0 ? (
        <p className="mt-4 font-body text-sm text-ink-muted">No email messages yet.</p>
      ) : (
        <ul className="mt-4 space-y-4">
          {orderedMessages.map((message) => (
            <li key={message.id} className="rounded-md border border-paper-muted p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-paper-muted px-2 py-0.5 font-body text-xs font-medium text-ink">
                  {PURPOSE_LABELS[message.purpose]}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 font-body text-xs font-medium ${STATUS_CLASSES[message.status]}`}
                >
                  {STATUS_LABELS[message.status]}
                </span>
                <span className="font-body text-xs text-ink-muted">
                  {message.direction === "outbound" ? "Outbound" : "Inbound"}
                </span>
              </div>

              <p className="mt-2 font-body text-xs text-ink-muted">
                {`${message.senderName ?? message.senderEmail} <${message.senderEmail}> to ${message.recipientEmail}`}
              </p>

              <p className="mt-2 whitespace-pre-wrap font-body text-sm text-ink">{message.textBody}</p>

              <p className="mt-2 font-body text-xs text-ink-muted">
                {message.sentAt ? (
                  <>
                    Sent <LocalDateTime iso={message.sentAt} />
                  </>
                ) : (
                  <>
                    Created <LocalDateTime iso={message.createdAt} />
                  </>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}