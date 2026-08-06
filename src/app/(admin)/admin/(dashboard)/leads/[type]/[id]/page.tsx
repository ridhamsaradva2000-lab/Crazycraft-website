import { notFound } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { listAdminUsers, getActivityLog } from "@/lib/crm/data";
import { Container } from "@/components/ui/Container";
import { StatusBadge } from "@/components/crm/StatusBadge";
import { ActivityTimelineSection } from "@/components/crm/Timeline";
import { LocalDateTime } from "@/components/crm/LocalDateTime";
import { AddNoteForm } from "@/components/crm/AddNoteForm";
import { LeadUpdateForm } from "@/components/crm/LeadUpdateForm";
import { LEAD_STATUS_LABELS } from "@/lib/validations/crm";

const uuidSchema = z.string().uuid();

function OperationalError() {
  return (
    <Container className="py-10">
      <p className="font-body text-sm text-clay">
        Something went wrong loading this record. Please try again.
      </p>
    </Container>
  );
}

/**
 * Reads and mutations on this page both rely entirely on the requesting
 * admin's own authenticated session — createClient() (the ordinary
 * cookie-scoped client), never a privileged/service-role client. Access
 * is enforced by:
 *   - proxy.ts + this route's parent layout (Module 3): must be signed in
 *     with an admin_users row to reach /admin/* at all.
 *   - RLS on inquiries/quote_requests (Module 3's correction): SELECT is
 *     scoped to has_admin_role('sales') — an editor session reaching this
 *     page would simply see no row and hit notFound() below, not any
 *     kind of bypass.
 *   - admin_update_inquiry()/admin_update_quote_request() (Module 2):
 *     SECURITY DEFINER but independently re-check has_admin_role('sales')
 *     against the calling session before writing anything.
 * There is no service-role usage anywhere in this module — every CRM
 * operation goes through the admin's own permitted session.
 */
export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ type: string; id: string }>;
}) {
  const { type, id } = await params;

  if (type !== "inquiry" && type !== "quote-request") {
    notFound();
  }

  // A malformed id (not a genuine UUID) should never reach Postgres as a
  // cast attempt — that would surface as a raw database error rather
  // than a clean 404. Reject it here, before any query runs.
  if (!uuidSchema.safeParse(id).success) {
    notFound();
  }

  const supabase = await createClient();

  if (type === "inquiry") {
    const { data: inquiry, error: inquiryError } = await supabase
      .from("inquiries")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (inquiryError) {
      // A genuine query/permission error is NOT the same thing as "this
      // inquiry doesn't exist" — notFound() would be misleading here
      // (an admin might reasonably conclude the record was deleted, when
      // actually something else went wrong). Log safe context only
      // (never the raw error to the browser) and show a generic
      // operational message instead.
      console.error("load inquiry failed:", inquiryError.code);
      return <OperationalError />;
    }
    if (!inquiry) notFound();

    const [adminsResult, activityResult] = await Promise.all([
      listAdminUsers(),
      getActivityLog({ inquiryId: id }),
    ]);

    return (
      <Container className="py-10">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl text-brand-900">{inquiry.name}</h1>
            <p className="mt-1 font-body text-sm text-ink-muted">
              {inquiry.email} · {inquiry.country} · Inquiry
            </p>
          </div>
          <StatusBadge
            status={inquiry.status}
            variant="lead"
            label={LEAD_STATUS_LABELS[inquiry.status as keyof typeof LEAD_STATUS_LABELS] ?? inquiry.status}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="rounded-lg border border-paper-muted bg-white p-6">
              <h2 className="font-display text-lg text-brand-900">Inquiry details</h2>
              <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <DetailField label="Business type" value={inquiry.business_type} />
                <DetailField label="Qualification stage" value={`Stage ${inquiry.qualification_stage}`} />
                <DetailField label="Company" value={inquiry.company_name} />
                <DetailField label="Company website" value={inquiry.company_website} />
                <DetailField label="LinkedIn" value={inquiry.linkedin_url} />
                <DetailField label="Volume range" value={inquiry.volume_range} />
                <DetailField label="Importing experience" value={inquiry.moq_familiarity} />
                <DetailField label="Timeline" value={inquiry.timeline} />
                <DetailField label="Shipping country" value={inquiry.shipping_country} />
                <DetailField label="Incoterm" value={inquiry.incoterm_preference} />
                <DetailField
                  label="Private label interest"
                  value={inquiry.private_label_required === null ? null : inquiry.private_label_required ? "Yes" : "No"}
                />
                <DetailField label="Lead score" value={String(inquiry.lead_score)} />
              </dl>
              <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <dt className="font-body text-xs font-medium uppercase tracking-wide text-ink-muted">Created</dt>
                  <dd className="font-body text-sm text-ink"><LocalDateTime iso={inquiry.created_at} /></dd>
                </div>
                <div>
                  <dt className="font-body text-xs font-medium uppercase tracking-wide text-ink-muted">Updated</dt>
                  <dd className="font-body text-sm text-ink"><LocalDateTime iso={inquiry.updated_at} /></dd>
                </div>
                <div>
                  <dt className="font-body text-xs font-medium uppercase tracking-wide text-ink-muted">Follow-up due</dt>
                  <dd className="font-body text-sm text-ink">
                    {inquiry.follow_up_at ? <LocalDateTime iso={inquiry.follow_up_at} /> : "Not set"}
                  </dd>
                </div>
              </dl>
              {inquiry.message && (
                <div className="mt-4">
                  <p className="font-body text-xs font-medium uppercase tracking-wide text-ink-muted">
                    Product interest / requirement
                  </p>
                  <p className="mt-1 font-body text-sm text-ink">{inquiry.message}</p>
                </div>
              )}
            </div>

            <div className="mt-6 rounded-lg border border-paper-muted bg-white p-6">
              <h2 className="font-display text-lg text-brand-900">Activity timeline</h2>
              <div className="mt-4">
                <ActivityTimelineSection result={activityResult} />
              </div>
              <AddNoteForm inquiryId={id} />
            </div>
          </div>

          <div className="rounded-lg border border-paper-muted bg-white p-6">
            <h2 className="font-display text-lg text-brand-900">Manage lead</h2>
            {adminsResult.error && (
              <p className="mb-2 font-body text-xs text-clay">
                Could not load the staff assignment list — assignment options below may be incomplete.
              </p>
            )}
            <div className="mt-4">
              <LeadUpdateForm
                type="inquiry"
                id={id}
                admins={adminsResult.admins}
                initial={{
                  status: inquiry.status,
                  leadScore: inquiry.lead_score,
                  assignedTo: inquiry.assigned_to,
                  followUpAt: inquiry.follow_up_at,
                }}
              />
            </div>
          </div>
        </div>
      </Container>
    );
  }

  // type === "quote-request"
  const { data: quoteRequest, error: quoteRequestError } = await supabase
    .from("quote_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (quoteRequestError) {
    console.error("load quote request failed:", quoteRequestError.code);
    return <OperationalError />;
  }
  if (!quoteRequest) notFound();

  const { data: items, error: itemsError } = await supabase
    .from("quote_request_items")
    .select("id, product_id, quantity, customization_notes, products(name, slug)")
    .eq("quote_request_id", id);

  if (itemsError) {
    console.error("load quote request items failed:", itemsError.code);
  }

  const [adminsResult, activityResult] = await Promise.all([
    listAdminUsers(),
    getActivityLog({ quoteRequestId: id }),
  ]);

  return (
    <Container className="py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-brand-900">
            {quoteRequest.company_name ?? quoteRequest.email}
          </h1>
          <p className="mt-1 font-body text-sm text-ink-muted">
            {quoteRequest.email} · {quoteRequest.country ?? "—"} · Quote request
          </p>
        </div>
        <StatusBadge
          status={quoteRequest.status}
          variant="lead"
          label={LEAD_STATUS_LABELS[quoteRequest.status as keyof typeof LEAD_STATUS_LABELS] ?? quoteRequest.status}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="rounded-lg border border-paper-muted bg-white p-6">
            <h2 className="font-display text-lg text-brand-900">Requested items</h2>
            {itemsError ? (
              <p className="mt-2 font-body text-sm text-clay">Could not load requested items. Please try again.</p>
            ) : !items || items.length === 0 ? (
              <p className="mt-2 font-body text-sm text-ink-muted">No items on file.</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {items.map((item) => {
                  const product = item.products as { name: string; slug: string } | null;
                  return (
                    <li key={item.id} className="font-body text-sm text-ink">
                      {product ? product.name : "Unknown product"}
                      <span className="text-ink-muted"> (qty {item.quantity})</span>
                      {item.customization_notes && (
                        <span className="text-ink-muted"> — {item.customization_notes}</span>
                      )}
                      <span className="block font-body text-xs text-ink-muted">{item.product_id}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <DetailField label="Phone" value={quoteRequest.phone} />
              <DetailField label="Lead score" value={String(quoteRequest.lead_score)} />
              <DetailField
                label="Linked buyer account"
                value={quoteRequest.buyer_id ? "Registered buyer" : "Guest"}
              />
            </dl>
            <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <dt className="font-body text-xs font-medium uppercase tracking-wide text-ink-muted">Created</dt>
                <dd className="font-body text-sm text-ink"><LocalDateTime iso={quoteRequest.created_at} /></dd>
              </div>
              <div>
                <dt className="font-body text-xs font-medium uppercase tracking-wide text-ink-muted">Updated</dt>
                <dd className="font-body text-sm text-ink"><LocalDateTime iso={quoteRequest.updated_at} /></dd>
              </div>
              <div>
                <dt className="font-body text-xs font-medium uppercase tracking-wide text-ink-muted">Follow-up due</dt>
                <dd className="font-body text-sm text-ink">
                  {quoteRequest.follow_up_at ? <LocalDateTime iso={quoteRequest.follow_up_at} /> : "Not set"}
                </dd>
              </div>
            </dl>
            {quoteRequest.notes && (
              <div className="mt-4">
                <p className="font-body text-xs font-medium uppercase tracking-wide text-ink-muted">
                  Internal sales notes
                </p>
                <p className="mt-1 font-body text-sm text-ink">{quoteRequest.notes}</p>
              </div>
            )}
          </div>

          <div className="mt-6 rounded-lg border border-paper-muted bg-white p-6">
            <h2 className="font-display text-lg text-brand-900">Activity timeline</h2>
            <div className="mt-4">
              <ActivityTimelineSection result={activityResult} />
            </div>
            <AddNoteForm quoteRequestId={id} />
          </div>
        </div>

        <div className="rounded-lg border border-paper-muted bg-white p-6">
          <h2 className="font-display text-lg text-brand-900">Manage lead</h2>
          {adminsResult.error && (
            <p className="mb-2 font-body text-xs text-clay">
              Could not load the staff assignment list — assignment options below may be incomplete.
            </p>
          )}
          <div className="mt-4">
            <LeadUpdateForm
              type="quote_request"
              id={id}
              admins={adminsResult.admins}
              initial={{
                status: quoteRequest.status,
                leadScore: quoteRequest.lead_score,
                assignedTo: quoteRequest.assigned_to,
                followUpAt: quoteRequest.follow_up_at,
                notes: quoteRequest.notes,
              }}
            />
          </div>
        </div>
      </div>
    </Container>
  );
}

function DetailField({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt className="font-body text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="font-body text-sm text-ink">{value}</dd>
    </div>
  );
}
