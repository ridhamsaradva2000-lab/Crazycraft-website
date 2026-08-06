import type { ActivityLogEntry, ActivityLogResult } from "@/lib/crm/data";
import { LocalDateTime } from "@/components/crm/LocalDateTime";

const EVENT_TYPE_LABELS: Record<string, string> = {
  note: "Note",
  duplicate_detected: "Duplicate detected",
  status_change: "Status changed",
};

export function Timeline({
  entries,
  actorNamesUnavailable = false,
}: {
  entries: ActivityLogEntry[];
  /**
   * When true, actor-name resolution failed (a separate, non-fatal
   * problem from the entries themselves loading) — every entry with an
   * author falls back to a neutral "Staff member" label instead of
   * either the real name (unavailable) or nothing at all (which would
   * look like the entry simply has no author, rather than a lookup
   * failure).
   */
  actorNamesUnavailable?: boolean;
}) {
  if (entries.length === 0) {
    return <p className="font-body text-sm text-ink-muted">No activity yet.</p>;
  }

  return (
    <ol className="space-y-4">
      {entries.map((entry) => (
        <li key={entry.id} className="border-l-2 border-paper-muted pl-4">
          <div className="flex items-center gap-2">
            <span className="font-body text-xs font-medium uppercase tracking-wide text-brand-700">
              {EVENT_TYPE_LABELS[entry.eventType] ?? entry.eventType}
            </span>
            <span className="font-body text-xs text-ink-muted">
              <LocalDateTime iso={entry.createdAt} />
            </span>
          </div>
          {entry.note && <p className="mt-1 font-body text-sm text-ink">{entry.note}</p>}
          {entry.createdBy && (
            <p className="mt-1 font-body text-xs text-ink-muted">
              by {actorNamesUnavailable ? "Staff member" : (entry.createdByName ?? "Staff member")}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

/**
 * A genuine query failure is NOT the same thing as "no activity yet" —
 * showing an empty timeline in both cases would mask a real operational
 * problem behind a normal-looking empty state. This wrapper renders the
 * distinct error case explicitly rather than leaving each detail page to
 * reimplement the same check. Actor-name resolution failing is handled
 * separately and less severely: the entries themselves are still shown,
 * with a small standalone warning above them, since that's a genuinely
 * different (and lower-stakes) problem from the timeline itself failing
 * to load.
 */
export function ActivityTimelineSection({ result }: { result: ActivityLogResult }) {
  if (result.error) {
    return (
      <p className="font-body text-sm text-clay">
        Could not load the activity timeline. Please try again.
      </p>
    );
  }
  return (
    <>
      {result.actorNamesError && (
        <p className="mb-2 font-body text-xs text-clay">
          Staff names could not be loaded for this timeline — entries below are still accurate.
        </p>
      )}
      <Timeline entries={result.entries} actorNamesUnavailable={result.actorNamesError} />
    </>
  );
}
