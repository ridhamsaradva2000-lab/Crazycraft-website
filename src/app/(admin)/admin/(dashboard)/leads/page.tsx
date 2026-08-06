import Link from "next/link";
import type { Route } from "next";
import { createClient } from "@/lib/supabase/server";
import { LocalDateTime } from "@/components/crm/LocalDateTime";
import { Container } from "@/components/ui/Container";
import { StatusBadge } from "@/components/crm/StatusBadge";
import { LEAD_STATUS_LABELS, LEAD_STATUS_VALUES } from "@/lib/validations/crm";

const SORT_OPTIONS = {
  score: { column: "lead_score", ascending: false, label: "Lead score (high → low)" },
  follow_up: { column: "follow_up_at", ascending: true, label: "Follow-up date (soonest first)" },
  newest: { column: "created_at", ascending: false, label: "Newest first" },
} as const;

type SortKey = keyof typeof SORT_OPTIONS;

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; sort?: string; due?: string }>;
}) {
  const { status, sort, due } = await searchParams;
  const sortKey: SortKey = sort && sort in SORT_OPTIONS ? (sort as SortKey) : "newest";
  const sortConfig = SORT_OPTIONS[sortKey];
  const selectedStatus = LEAD_STATUS_VALUES.find((value) => value === status);

  const supabase = await createClient();
  let query = supabase
    .from("admin_lead_overview")
    .select("id, source_type, name, email, company_name, country, lead_score, status, assigned_to, follow_up_at, created_at")
    .order(sortConfig.column, { ascending: sortConfig.ascending, nullsFirst: false });

  if (selectedStatus) {
    query = query.eq("status", selectedStatus);
  }
  if (due === "1") {
    query = query.lte("follow_up_at", new Date().toISOString()).not("follow_up_at", "is", null);
  }

  const { data: leads, error } = await query;

  if (error) {
    console.error("load leads failed:", error.code);
  }

  return (
    <Container className="py-10">
      <h1 className="font-display text-3xl text-brand-900">Leads</h1>
      <p className="mt-2 font-body text-sm text-ink-muted">
        Inquiries and quote requests, combined — both share the same status pipeline and scoring.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <FilterLink href="/admin/leads" active={!status}>
          All statuses
        </FilterLink>
        {LEAD_STATUS_VALUES.map((value) => (
          <FilterLink key={value} href={`/admin/leads?status=${value}`} active={status === value}>
            {LEAD_STATUS_LABELS[value]}
          </FilterLink>
        ))}
        <span className="mx-2 h-4 w-px bg-paper-muted" />
        <FilterLink href={`/admin/leads?due=1${status ? `&status=${status}` : ""}`} active={due === "1"}>
          Due for follow-up
        </FilterLink>
      </div>

      <div className="mt-4 flex flex-wrap gap-3 font-body text-sm text-ink-muted">
        Sort by:
        {(Object.keys(SORT_OPTIONS) as SortKey[]).map((key) => (
          <Link
            key={key}
            href={
              `/admin/leads?sort=${key}${status ? `&status=${status}` : ""}${due ? `&due=${due}` : ""}` as Route
            }
            className={sortKey === key ? "font-medium text-brand-700 underline" : "hover:text-brand-700"}
          >
            {SORT_OPTIONS[key].label}
          </Link>
        ))}
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-paper-muted bg-white">
        {error && (
          <p className="p-6 font-body text-sm text-clay">Could not load leads. Please try again.</p>
        )}
        {!error && (!leads || leads.length === 0) && (
          <p className="p-6 font-body text-sm text-ink-muted">No leads match these filters.</p>
        )}
        {!error && leads && leads.length > 0 && (
  <div className="divide-y divide-paper-muted md:hidden">
    {leads.map((lead) => {
      const detailType =
        lead.source_type === "inquiry" ? "inquiry" : "quote-request";

      const isOverdue =
        lead.follow_up_at && new Date(lead.follow_up_at) <= new Date();

      const displayStatus = lead.status ?? "unknown";

      return (
        <article
          key={`mobile-${lead.source_type}-${lead.id}`}
          className="space-y-3 p-4"
        >
          <div>
            <Link
              href={`/admin/leads/${detailType}/${lead.id}` as Route}
              className="font-body text-sm font-medium text-brand-700 hover:underline"
            >
              {lead.name}
            </Link>

            <p className="break-all font-body text-xs text-ink-muted">
              {lead.email}
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <div>
              <dt className="font-body text-xs uppercase tracking-wide text-ink-muted">
                Source
              </dt>
              <dd className="mt-1 font-body text-sm text-ink">
                {lead.source_type === "inquiry" ? "Inquiry" : "Quote request"}
              </dd>
            </div>

            <div>
              <dt className="font-body text-xs uppercase tracking-wide text-ink-muted">
                Country
              </dt>
              <dd className="mt-1 font-body text-sm text-ink">
                {lead.country ?? "—"}
              </dd>
            </div>

            <div>
              <dt className="font-body text-xs uppercase tracking-wide text-ink-muted">
                Score
              </dt>
              <dd className="mt-1 font-body text-sm text-ink">
                {lead.lead_score}
              </dd>
            </div>

            <div>
              <dt className="font-body text-xs uppercase tracking-wide text-ink-muted">
                Status
              </dt>
              <dd className="mt-1">
                <StatusBadge
                  status={displayStatus}
                  variant="lead"
                  label={
                    LEAD_STATUS_LABELS[
                      displayStatus as keyof typeof LEAD_STATUS_LABELS
                    ] ?? "Unknown"
                  }
                />
              </dd>
            </div>
          </dl>

          <div>
            <p className="font-body text-xs uppercase tracking-wide text-ink-muted">
              Follow-up
            </p>

            <p
              className={`mt-1 font-body text-sm ${
                isOverdue ? "font-medium text-clay" : "text-ink-muted"
              }`}
            >
              {lead.follow_up_at ? (
                <LocalDateTime iso={lead.follow_up_at} mode="date" />
              ) : (
                "—"
              )}
            </p>
          </div>
        </article>
      );
    })}
  </div>
)}
        {!error && leads && leads.length > 0 && (
          <table className="hidden w-full text-left md:table">
            <thead className="border-b border-paper-muted bg-paper">
              <tr>
                <th className="px-4 py-3 font-body text-xs font-medium uppercase tracking-wide text-ink-muted">
                  Name / Company
                </th>
                <th className="px-4 py-3 font-body text-xs font-medium uppercase tracking-wide text-ink-muted">
                  Source
                </th>
                <th className="px-4 py-3 font-body text-xs font-medium uppercase tracking-wide text-ink-muted">
                  Country
                </th>
                <th className="px-4 py-3 font-body text-xs font-medium uppercase tracking-wide text-ink-muted">
                  Score
                </th>
                <th className="px-4 py-3 font-body text-xs font-medium uppercase tracking-wide text-ink-muted">
                  Status
                </th>
                <th className="px-4 py-3 font-body text-xs font-medium uppercase tracking-wide text-ink-muted">
                  Follow-up
                </th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => {
                const detailType = lead.source_type === "inquiry" ? "inquiry" : "quote-request";
                const isOverdue = lead.follow_up_at && new Date(lead.follow_up_at) <= new Date();
                const displayStatus = lead.status ?? "unknown";
                return (
                  <tr key={`${lead.source_type}-${lead.id}`} className="border-b border-paper-muted last:border-0">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/leads/${detailType}/${lead.id}` as Route}
                        className="font-body text-sm font-medium text-brand-700 hover:underline"
                      >
                        {lead.name}
                      </Link>
                      <p className="font-body text-xs text-ink-muted">{lead.email}</p>
                    </td>
                    <td className="px-4 py-3 font-body text-sm text-ink-muted">
                      {lead.source_type === "inquiry" ? "Inquiry" : "Quote request"}
                    </td>
                    <td className="px-4 py-3 font-body text-sm text-ink-muted">{lead.country ?? "—"}</td>
                    <td className="px-4 py-3 font-body text-sm text-ink">{lead.lead_score}</td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        status={displayStatus}
                        variant="lead"
                        label={
                          LEAD_STATUS_LABELS[displayStatus as keyof typeof LEAD_STATUS_LABELS] ?? "Unknown"
                        }
                      />
                    </td>
                    <td className={`px-4 py-3 font-body text-sm ${isOverdue ? "font-medium text-clay" : "text-ink-muted"}`}>
                      {lead.follow_up_at ? <LocalDateTime iso={lead.follow_up_at} mode="date" /> : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </Container>
  );
}

function FilterLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href as Route}
      className={`rounded-full px-3 py-1 font-body text-sm ${
        active ? "bg-brand-700 text-white" : "bg-paper-muted text-ink hover:bg-paper"
      }`}
    >
      {children}
    </Link>
  );
}
