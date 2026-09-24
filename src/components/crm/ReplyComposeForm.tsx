"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { FormError, FormSuccess } from "@/components/ui/FormError";
import {
  EMAIL_MESSAGE_PURPOSES,
  EMAIL_MESSAGE_PURPOSE_LABELS,
  type EmailMessagePurpose,
} from "@/lib/validations/email";
import {
  sendManualReplyAction,
  type EmailReplyActionResult,
  type EmailReplyErrorCategory,
} from "@/app/(admin)/admin/(dashboard)/leads/[type]/[id]/emailActions";

export interface ReplyComposeFormProps {
  inquiryId: string;
  canReply: boolean;
  disabledReason?: string | null;
}

type ResultTone = "success" | "warning" | "error";

function mapErrorCategory(category: EmailReplyErrorCategory): string {
  switch (category) {
    case "not_configured":
      return "Email sending is not configured.";
    case "authentication_failed":
      return "Email authentication failed. Please check the email connection before retrying.";
    case "rate_limited":
      return "Email provider is temporarily rate-limiting sends. Retry manually later.";
    case "send_failed":
      return "Email provider did not confirm the send.";
    case "unknown":
      return "Email sending failed for an unknown reason.";
    default:
      return "Email sending failed for an unknown reason.";
  }
}

/**
 * Exhaustiveness guard -- if EmailReplyActionResult (emailActions.ts,
 * untouched by this stage) ever grows a new outcome without this
 * component being updated to match, TypeScript rejects the build here
 * rather than silently falling through to an unhandled case at runtime.
 */
function assertUnreachableOutcome(value: never): never {
  void value;
  throw new Error("ReplyComposeForm: unmapped EmailReplyActionResult outcome");
}

/**
 * Client component responsible for composing and submitting a manual
 * RFQ email reply via sendManualReplyAction(). Never accepts or submits
 * a sender/from field -- the sender identity is hardcoded server-side in
 * sendManualReply.ts and shown here only as static, read-only text.
 *
 * DEDUPE-KEY LIFECYCLE: attemptKeyRef holds the UUID for the CURRENT
 * submission attempt. It is generated once, lazily, on the first manual
 * submit -- never during render, never via useMemo-on-mount, never
 * regenerated merely because router.refresh() occurred. The same key is
 * reused across a double-click or network-retry of the SAME attempt so
 * the server's client_dedupe_key uniqueness guarantee makes that safe.
 * The key is reset to null (forcing a fresh UUID on the next manual
 * submit) ONLY after a confirmed non-send outcome (failed /
 * previous_attempt_failed) -- never automatically, and never as
 * permission to resubmit without further admin action.
 *
 * LOCAL LOCK: after any outcome representing a real, confirmed, or
 * uncertain-but-possible send (sent, already_sent, already_in_progress,
 * sent_thread_mismatch, sent_threading_metadata_missing,
 * sent_recording_failed, operational_error, unauthorized), this
 * component instance locks permanently and will not allow a further
 * submit -- an admin must reload the page to get a fresh compose form.
 * This is deliberately conservative: several of these outcomes cannot be
 * distinguished from "the email may have already sent," so no automatic
 * or easy-looking path back to a resend is offered.
 *
 * Form fields (purpose, message text) are NEVER programmatically cleared
 * in any outcome, so an admin can always review exactly what was
 * submitted.
 */
export function ReplyComposeForm({ inquiryId, canReply, disabledReason }: ReplyComposeFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isPermanentlyLocked, setIsPermanentlyLocked] = useState(false);
  const [purpose, setPurpose] = useState<EmailMessagePurpose>("quotation");
  const [textBody, setTextBody] = useState("");
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [resultTone, setResultTone] = useState<ResultTone | null>(null);

  // Synchronous guard against a second submit firing before React commits
  // the isPending state -- a plain ref, checked/set immediately and
  // synchronously, independent of any state update timing.
  const submitLockRef = useRef(false);
  // Holds the current attempt's dedupe key. Lazily generated on first
  // submit; reset to null only after a confirmed non-send outcome.
  const attemptKeyRef = useRef<string | null>(null);

  function applyResult(result: EmailReplyActionResult) {
    switch (result.outcome) {
      case "unauthorized": {
        setResultTone("error");
        setResultMessage("You do not have permission to send this email.");
        setIsPermanentlyLocked(true);
        break;
      }
      case "validation_error": {
        setResultTone("error");
        setResultMessage(result.message);
        // sendManualReply() was never called -- no row/side effect
        // exists, so the same key remains safe to reuse and the form
        // stays unlocked for correction.
        break;
      }
      case "sent": {
        setResultTone("success");
        setResultMessage("Email sent.");
        setIsPermanentlyLocked(true);
        router.refresh();
        break;
      }
      case "already_sent": {
        setResultTone("success");
        setResultMessage("This email was already sent.");
        setIsPermanentlyLocked(true);
        router.refresh();
        break;
      }
      case "already_in_progress": {
        setResultTone("warning");
        setResultMessage(
          "This submission is already being processed. Refresh and review before doing anything else."
        );
        setIsPermanentlyLocked(true);
        router.refresh();
        break;
      }
      case "sent_thread_mismatch": {
        setResultTone("warning");
        setResultMessage(
          "Email was sent, but Gmail reported unexpected thread metadata. Do not resend. Refresh and review."
        );
        setIsPermanentlyLocked(true);
        router.refresh();
        break;
      }
      case "sent_threading_metadata_missing": {
        setResultTone("warning");
        setResultMessage(
          "Email was sent, but reply-thread metadata is incomplete. Do not resend. Refresh and review."
        );
        setIsPermanentlyLocked(true);
        router.refresh();
        break;
      }
      case "sent_recording_failed": {
        setResultTone("warning");
        setResultMessage(
          "Email was sent, but CRM could not fully record the result. Do not resend. Refresh and review."
        );
        setIsPermanentlyLocked(true);
        router.refresh();
        break;
      }
      case "previous_attempt_failed": {
        setResultTone("error");
        setResultMessage(`${mapErrorCategory(result.errorCategory)} You may try sending again.`);
        // Confirmed non-send -- a fresh key is required for the NEXT
        // manual submit. Form remains unlocked for a manual retry.
        attemptKeyRef.current = null;
        router.refresh();
        break;
      }
      case "failed": {
        setResultTone("error");
        setResultMessage(`${mapErrorCategory(result.errorCategory)} You may try sending again.`);
        attemptKeyRef.current = null;
        router.refresh();
        break;
      }
      case "operational_error": {
        setResultTone("error");
        setResultMessage(result.message);
        // State is uncertain -- treated with the same caution as a
        // confirmed send. No automatic fresh key, no easy resubmit path.
        setIsPermanentlyLocked(true);
        router.refresh();
        break;
      }
      default:
        assertUnreachableOutcome(result);
    }
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canReply || isPending || isPermanentlyLocked || submitLockRef.current) return;
    if (textBody.trim().length === 0) return;

    submitLockRef.current = true;

    if (attemptKeyRef.current === null) {
      attemptKeyRef.current = crypto.randomUUID();
    }
    const clientDedupeKey = attemptKeyRef.current;
    const submittedPurpose = purpose;
    const submittedTextBody = textBody;

    startTransition(async () => {
      try {
        const result = await sendManualReplyAction({
          inquiryId,
          purpose: submittedPurpose,
          textBody: submittedTextBody,
          clientDedupeKey,
        });
        applyResult(result);
      } finally {
        submitLockRef.current = false;
      }
    });
  }

  if (!canReply) {
    return (
      <div className="rounded-lg border border-paper-muted bg-white p-6">
        <h2 className="font-display text-lg text-brand-900">Reply</h2>
        <p className="mt-2 font-body text-sm text-ink-muted">
          {disabledReason ?? "Replying is not available for this inquiry yet."}
        </p>
      </div>
    );
  }

  const fieldsDisabled = isPending || isPermanentlyLocked;

  return (
    <div className="rounded-lg border border-paper-muted bg-white p-6">
      <h2 className="font-display text-lg text-brand-900">Reply</h2>

      <div className="mt-3">
        <p className="font-body text-xs font-medium uppercase tracking-wide text-ink-muted">From</p>
        <p className="mt-1 font-body text-sm text-ink">
          {"Ridham Saradva <ridham@crazycraftglobal.com>"}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <Label htmlFor="reply-purpose">Purpose</Label>
          <Select
            id="reply-purpose"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value as EmailMessagePurpose)}
            disabled={fieldsDisabled}
          >
            {EMAIL_MESSAGE_PURPOSES.map((value) => (
              <option key={value} value={value}>
                {EMAIL_MESSAGE_PURPOSE_LABELS[value]}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label htmlFor="reply-text-body">Message</Label>
          <textarea
            id="reply-text-body"
            value={textBody}
            onChange={(e) => setTextBody(e.target.value)}
            disabled={fieldsDisabled}
            maxLength={20000}
            rows={8}
            className="mt-1 w-full rounded-md border border-paper-muted bg-white px-3 py-2 font-body text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
          />
          <p className="mt-1 font-body text-xs text-ink-muted">{textBody.length} / 20000 characters</p>
        </div>

        {resultTone === "error" && <FormError message={resultMessage} />}
        {resultTone === "success" && (
          <div aria-live="polite">
            <FormSuccess message={resultMessage} />
          </div>
        )}
        {resultTone === "warning" && (
          <div
            aria-live="polite"
            role="status"
            className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 font-body text-sm text-amber-900"
          >
            {resultMessage}
          </div>
        )}

        <Button type="submit" variant="primary" disabled={fieldsDisabled || textBody.trim().length === 0}>
          {isPending ? "Sending..." : "Send"}
        </Button>
      </form>
    </div>
  );
}