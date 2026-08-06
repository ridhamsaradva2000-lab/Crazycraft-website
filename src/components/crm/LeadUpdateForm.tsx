"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { updateInquiryAction, updateQuoteRequestAction } from "@/lib/crm/actions";
import { LEAD_STATUS_LABELS, LEAD_STATUS_VALUES } from "@/lib/validations/crm";
import type { AdminUserOption } from "@/lib/crm/data";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { FormError, FormSuccess } from "@/components/ui/FormError";

function toDateTimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function LeadUpdateForm({
  type,
  id,
  admins,
  initial,
}: {
  type: "inquiry" | "quote_request";
  id: string;
  admins: AdminUserOption[];
  initial: {
    status: string;
    leadScore: number;
    assignedTo: string | null;
    followUpAt: string | null;
    notes?: string | null;
  };
}) {
  const [status, setStatus] = useState(initial.status);
  const [leadScore, setLeadScore] = useState(String(initial.leadScore));
  const [assignedTo, setAssignedTo] = useState(initial.assignedTo ?? "");
  // Deliberately initialized empty, NOT via toDateTimeLocalValue(...) —
  // this component can be server-rendered, and computing a local-time
  // string at that point would use whatever timezone the SERVER process
  // runs in (typically UTC on Vercel), not the admin's actual browser
  // timezone. An empty initializer is identical on server and client, so
  // there's nothing for React to mismatch during hydration; the real
  // value is populated below, in an effect that only ever runs after
  // mount on the genuine client, using the browser's own timezone.
  const [followUpAt, setFollowUpAt] = useState("");
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Guards against the effect below re-initializing followUpAt on a
  // later re-render — e.g. if the parent Server Component re-fetches
  // fresh `initial` props after revalidatePath() runs (following any
  // save, including on a different field) while the admin might already
  // be mid-edit on this one. The effect can still fire again structurally
  // (its dependency did change), but the guard makes sure its BODY only
  // ever actually sets state the first time, never again.
  const followUpAtInitialized = useRef(false);

  useEffect(() => {
    if (followUpAtInitialized.current) return;
    followUpAtInitialized.current = true;
    setFollowUpAt(toDateTimeLocalValue(initial.followUpAt));
  }, [initial.followUpAt]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    // Convert the datetime-local value (which represents THIS BROWSER's
    // local time, with no timezone info of its own) to a proper UTC ISO
    // string at submit time, using the browser's own Date object — the
    // browser knows its own timezone, so `new Date("2026-08-01T14:30")`
    // is correctly interpreted as 2:30 PM in whatever timezone the admin
    // is actually in, not reinterpreted later by whatever timezone the
    // server happens to run in. An empty value means "clear the
    // reminder" and is sent through as "". An unparseable non-empty value
    // is a real validation error here — it is never silently treated as
    // "clear the reminder".
    let followUpAtIso = "";
    if (followUpAt) {
      const parsedDate = new Date(followUpAt);
      if (Number.isNaN(parsedDate.getTime())) {
        setError("The follow-up date/time is invalid — please reselect it.");
        return;
      }
      followUpAtIso = parsedDate.toISOString();
    }

    startTransition(async () => {
      const basePayload = {
        status: status as (typeof LEAD_STATUS_VALUES)[number],
        leadScore: Number(leadScore),
        assignedTo,
        followUpAt: followUpAtIso,
      };

      const result =
        type === "inquiry"
          ? await updateInquiryAction({ inquiryId: id, ...basePayload })
          : await updateQuoteRequestAction({ quoteRequestId: id, ...basePayload, notes });

      if (result.error) {
        setError(result.error);
        return;
      }
      setSaved(true);
    });
  }

  return (
    <form onSubmit={onSubmit}>
      <FormError message={error} />
      <FormSuccess message={saved ? "Saved." : null} />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="status">Status</Label>
          <Select id="status" value={status} onChange={(e) => setStatus(e.target.value)}>
            {LEAD_STATUS_VALUES.map((value) => (
              <option key={value} value={value}>
                {LEAD_STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="leadScore">Lead score (0–100)</Label>
          <Input
            id="leadScore"
            type="number"
            min={0}
            max={100}
            value={leadScore}
            onChange={(e) => setLeadScore(e.target.value)}
          />
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="assignedTo">Assigned to</Label>
          <Select id="assignedTo" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
            <option value="">Unassigned</option>
            {admins.map((admin) => (
              <option key={admin.id} value={admin.id}>
                {admin.fullName} ({admin.role.replace("_", " ")})
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="followUpAt">Follow-up date/time</Label>
          <Input
            id="followUpAt"
            type="datetime-local"
            value={followUpAt}
            onChange={(e) => setFollowUpAt(e.target.value)}
          />
        </div>
      </div>

      {type === "quote_request" && (
        <div className="mb-6">
          <Label htmlFor="notes">Internal sales notes</Label>
          <textarea
            id="notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-md border border-paper-muted bg-white px-3 py-2 font-body text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
          />
        </div>
      )}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
