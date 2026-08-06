"use client";

import { Button } from "@/components/ui/Button";
import { useConsent } from "@/lib/consent/ConsentProvider";

/** Reopen/change UI — shares the same context as ConsentBanner. */
export function ConsentPreferences() {
  const { decision, hasChecked, setDecision } = useConsent();

  if (!hasChecked) {
    return <p className="font-body text-sm text-ink-muted">Loading your current preference…</p>;
  }

  return (
    <div className="rounded-lg border border-paper-muted bg-white p-6">
      <p className="font-body text-sm text-ink">
        Current choice:{" "}
        <span className="font-medium">
          {decision === null
            ? "No choice made yet"
            : decision.marketing
              ? "Marketing cookies accepted"
              : "Marketing cookies rejected"}
        </span>
      </p>
      <div className="mt-4 flex gap-2">
        <Button type="button" variant="outline" onClick={() => setDecision(false)}>
          Reject non-essential
        </Button>
        <Button type="button" variant="outline" onClick={() => setDecision(true)}>
          Accept marketing
        </Button>
      </div>
    </div>
  );
}