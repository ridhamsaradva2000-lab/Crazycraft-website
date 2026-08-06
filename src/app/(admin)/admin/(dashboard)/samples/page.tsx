import Link from "next/link";
import type { Route } from "next";
import { createClient } from "@/lib/supabase/server";
import { LocalDateTime } from "@/components/crm/LocalDateTime";
import { Container } from "@/components/ui/Container";
import { StatusBadge } from "@/components/crm/StatusBadge";
import { SAMPLE_STATUS_LABELS, SAMPLE_STATUS_VALUES, sampleSearchSchema } from "@/lib/validations/crm";

export default async function SamplesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const { status, q } = await searchParams;
  const selectedStatus = SAMPLE_STATUS_VALUES.find((value) => value === status);

  // Distinguishes three cases, not two: q not supplied at all (valid — no
  // search filter), q supplied and valid (use it), and q supplied but
  // invalid (e.g. over 100 characters) — which must show a visible error
  // and NEVER silently fall back to "no filter", since that would turn an
  // invalid search into an unfiltered all-samples query, quietly showing
  // far more than the admin asked for. An earlier revision's comment here
  // claimed silently ignoring a malformed value was "friendlier" — that
  // was wrong specifically because of this all-records side effect; it
  // has been corrected to a real, visible validation error instead.
  let searchTerm = "";
  let searchError: string | null = null;

  if (q !== undefined) {
    const parsedSearch = sampleSearchSchema.safeParse({ q });
    if (!parsedSearch.success) {
      // Never expose the raw Zod issue text — a short, generic message
      // is enough for a search box.
      searchError = "Search must be 100 characters or fewer.";
    } else {
      searchTerm = parsedSearch.data.q ?? "";
    }
  }

  const supabase = await createClient();

  // search_samples() is a SECURITY INVOKER SQL function (see the Module 5
  // migration), CRM (sales/super_admin) only — it carries its own
  // explicit private.has_admin_role('sales') check, layered on top of
  // (not replacing) samples' own RLS. Buyer-facing sample access never
  // goes through this function, nor through a direct base-table query
  // (that policy has been dropped entirely — see the migration's own
  // base-table fix section) — it is public.buyer_samples exclusively.
  // The search term is a genuine bound SQL parameter here, never
  // string-interpolated into any PostgREST filter expression, and a
  // value over 100 characters is rejected (22023) by the function
  // itself, not silently truncated — this page never sends one, since
  // searchError already short-circuits that case below, but the
  // database-level rejection stands regardless of what any
  // application-layer check does or doesn't catch.
  type SampleListRow = {
    id: string;
    name: string;
    email: string;
    company_name: string | null;
    product_id: string;
    sample_status: string;
    assigned_to: string | null;
    created_at: string;
    updated_at: string;
  };

  let samples: SampleListRow[] | null = null;
  let error: { code: string } | null = null;

  if (!searchError) {
    let query = supabase
      .rpc("search_samples", { p_search: searchTerm || undefined })
      .select("id, name, email, company_name, product_id, sample_status, assigned_to, created_at, updated_at");

    if (selectedStatus) {
      query = query.eq("sample_status", selectedStatus);
    }

    const result = await query;
    samples = result.data as SampleListRow[] | null;
    error = result.error;
  }

  if (error) {
    // Logged with safe, non-sensitive context only — never surfaced to
    // the browser. A real query/permission error is NOT the same thing
    // as "no samples match", so it must not silently collapse into an
    // empty list either.
    console.error("search samples failed:", error.code);
  }

  const productIds = [...new Set((samples ?? []).map((s) => s.product_id).filter(Boolean))];

  const [productsResult, adminsRpcResult] = await Promise.all([
    productIds.length > 0
      ? supabase.from("products").select("id, name").in("id", productIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
    // list_crm_assignment_admins() — a SECURITY DEFINER RPC (Module 5
    // migration), not admin_users or any view built on top of it. Its own
    // RETURNS clause is what genuinely limits exposure to id/full_name/role;
    // it does not rely on admin_users RLS/GRANT at all.
    supabase.rpc("list_crm_assignment_admins"),
  ]);

  if (productsResult.error) {
    console.error("Failed to load product names for samples list:", productsResult.error.code);
  }
  if (adminsRpcResult.error) {
    console.error("Failed to load assignment admin names for samples list:", adminsRpcResult.error.code);
  }

  const productNamesById = new Map((productsResult.data ?? []).map((p) => [p.id, p.name]));
  const adminNamesById = new Map((adminsRpcResult.data ?? []).map((a) => [a.id, a.full_name]));

  return (
    <Container className="py-10">
      <h1 className="font-display text-3xl text-brand-900">Sample requests</h1>
      <p className="mt-2 font-body text-sm text-ink-muted">
        Fulfillment pipeline — separate from the sales lead pipeline, since a sample’s status tracks
        shipping/payment, not deal stage.
      </p>

      {productsResult.error && (
        <p className="mt-2 font-body text-sm text-clay">Some product names could not be loaded.</p>
      )}
      {adminsRpcResult.error && (
        <p className="mt-2 font-body text-sm text-clay">Assigned staff information could not be loaded.</p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <FilterLink href="/admin/samples" active={!status}>
          All statuses
        </FilterLink>
        {SAMPLE_STATUS_VALUES.map((value) => (
          <FilterLink key={value} href={`/admin/samples?status=${value}`} active={status === value}>
            {SAMPLE_STATUS_LABELS[value]}
          </FilterLink>
        ))}
      </div>

      <form method="get" className="mt-4 flex max-w-sm gap-2">
        {status && <input type="hidden" name="status" value={status} />}
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          maxLength={100}
          placeholder="Search name, email, or company"
          className="w-full rounded-md border border-paper-muted bg-white px-3 py-2 font-body text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
        />
        <button
          type="submit"
          className="rounded-md border border-paper-muted px-3 py-2 font-body text-sm text-ink hover:bg-paper"
        >
          Search
        </button>
      </form>

      <div className="mt-6 overflow-x-auto rounded-lg border border-paper-muted bg-white">
        {searchError && (
          <p className="p-6 font-body text-sm text-clay">{searchError}</p>
        )}
        {!searchError && error && (
          <p className="p-6 font-body text-sm text-clay">Could not load samples. Please try again.</p>
        )}
        {!searchError && !error && (!samples || samples.length === 0) && (
          <p className="p-6 font-body text-sm text-ink-muted">No sample requests match these filters.</p>
        )}

        {!searchError && !error && samples && samples.length > 0 && (
          <table className="hidden w-full text-left md:table">
            <thead className="border-b border-paper-muted bg-paper">
              <tr>
                <th className="px-4 py-3 font-body text-xs font-medium uppercase tracking-wide text-ink-muted">
                  Contact
                </th>
                <th className="px-4 py-3 font-body text-xs font-medium uppercase tracking-wide text-ink-muted">
                  Product
                </th>
                <th className="px-4 py-3 font-body text-xs font-medium uppercase tracking-wide text-ink-muted">
                  Status
                </th>
                <th className="px-4 py-3 font-body text-xs font-medium uppercase tracking-wide text-ink-muted">
                  Assigned
                </th>
                <th className="px-4 py-3 font-body text-xs font-medium uppercase tracking-wide text-ink-muted">
                  Requested
                </th>
                <th className="px-4 py-3 font-body text-xs font-medium uppercase tracking-wide text-ink-muted">
                  Updated
                </th>
              </tr>
            </thead>
            <tbody>
            {samples?.map((sample) => (
                <tr key={sample.id} className="border-b border-paper-muted last:border-0">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/samples/${sample.id}` as Route}
                      className="font-body text-sm font-medium text-brand-700 hover:underline"
                    >
                      {sample.name}
                    </Link>
                    <p className="font-body text-xs text-ink-muted">
                      {sample.email}
                      {sample.company_name ? ` · ${sample.company_name}` : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3 font-body text-sm text-ink">
                    {productsResult.error ? (
                      <span className="text-clay">Product name unavailable</span>
                    ) : (
                      (productNamesById.get(sample.product_id) ?? "Unknown product")
                    )}
                    <span className="block font-body text-xs text-ink-muted">{sample.product_id}</span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      status={sample.sample_status}
                      variant="sample"
                      label={
                        SAMPLE_STATUS_LABELS[sample.sample_status as keyof typeof SAMPLE_STATUS_LABELS] ??
                        sample.sample_status
                      }
                    />
                  </td>
                  <td className="px-4 py-3 font-body text-sm text-ink-muted">
                    {!sample.assigned_to
                      ? "Unassigned"
                      : adminsRpcResult.error
                        ? <span className="text-clay">Assignment info unavailable</span>
                        : (adminNamesById.get(sample.assigned_to) ?? "Staff member")}
                  </td>
                  <td className="px-4 py-3 font-body text-sm text-ink-muted">
                    <LocalDateTime iso={sample.created_at} mode="date" />
                  </td>
                  <td className="px-4 py-3 font-body text-sm text-ink-muted">
                    <LocalDateTime iso={sample.updated_at} mode="date" />
                  </td>
                </tr>
              ))}
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
