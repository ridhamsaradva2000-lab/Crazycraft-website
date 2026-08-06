"use client";

import { useState, useTransition } from "react";
import { addActivityNoteAction } from "@/lib/crm/actions";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/components/ui/FormError";

export function AddNoteForm({
  inquiryId,
  quoteRequestId,
  sampleId,
}: {
  inquiryId?: string;
  quoteRequestId?: string;
  sampleId?: string;
}) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addActivityNoteAction({ inquiryId, quoteRequestId, sampleId, note });
      if (result.error) {
        setError(result.error);
        return;
      }
      setNote("");
    });
  }

  return (
    <form onSubmit={onSubmit} className="mt-4">
      <FormError message={error} />
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        placeholder="Add a note — e.g. 'Called the buyer, left a voicemail'"
        className="w-full rounded-md border border-paper-muted bg-white px-3 py-2 font-body text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
      />
      <Button type="submit" variant="outline" className="mt-2" disabled={isPending || !note.trim()}>
        {isPending ? "Saving…" : "Add note"}
      </Button>
    </form>
  );
}
