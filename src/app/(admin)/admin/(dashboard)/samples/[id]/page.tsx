import { notFound } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { listAdminUsers, getActivityLog } from "@/lib/crm/data";
import { Container } from "@/components/ui/Container";
import { StatusBadge } from "@/components/crm/StatusBadge";
import { ActivityTimelineSection } from "@/components/crm/Timeline";
import { LocalDateTime } from "@/components/crm/LocalDateTime";
import { AddNoteForm } from "@/components/crm/AddNoteForm";
import { SampleUpdateForm } from "@/components/crm/SampleUpdateForm";
import { SAMPLE_STATUS_LABELS, PAYMENT_STATUS_LABELS } from "@/lib/validations/crm";

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
 * Same authorization model as the lead detail page — the ordinary
 * cookie-scoped client only, relying on samples' own RLS (Module 2/3)
 * and admin_update_sample_status()'s own internal role check (Module 2).
 * No service-role client anywhere in this module.
 */
export default async function SampleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // A malformed id should never reach Postgres as a cast attempt — reject
  // it as a clean 404 before any query runs.
  if (!uuidSchema.safeParse(id).success) {
    notFound();
  }

  const supabase = await createClient();
  const { data: sample, error: sampleError } = await supabase
    .from("samples")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (sampleError) {
    // A genuine query/permission error is not the same as "this sample
    // doesn't exist" — log safe context only and show a generic
    // operational message rather than a misleading 404.
    console.error("load sample failed:", sampleError.code);
    return <OperationalError />;
  }
  if (!sample) notFound();

  const [adminsResult, activityResult, product, buyer, quoteRequest] = await Promise.all([
    listAdminUsers(),
    getActivityLog({ sampleId: id }),
    supabase.from("products").select("id, name, slug").eq("id", sample.product_id).maybeSingle(),
    sample.buyer_id
      ? supabase.from("buyers").select("id, company_name, verified").eq("id", sample.buyer_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    sample.quote_request_id
      ? supabase
          .from("quote_requests")
          .select("id, company_name, email")
          .eq("id", sample.quote_request_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (product.error) {
    console.error("load product for sample failed:", product.error.code);
  }
  if (buyer.error) {
    console.error("load buyer for sample failed:", buyer.error.code);
  }
  if (quoteRequest.error) {
    console.error("load linked quote request for sample failed:", quoteRequest.error.code);
  }

  return (
    <Container className="py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-brand-900">{sample.name}</h1>
          <p className="mt-1 font-body text-sm text-ink-muted">
            {sample.email} · {sample.country} · Sample request
          </p>
        </div>
        <div className="flex gap-2">
          <StatusBadge
            status={sample.sample_status}
            variant="sample"
            label={SAMPLE_STATUS_LABELS[sample.sample_status as keyof typeof SAMPLE_STATUS_LABELS] ?? sample.sample_status}
          />
          <StatusBadge
            status={sample.payment_status}
            variant="sample"
            label={PAYMENT_STATUS_LABELS[sample.payment_status as keyof typeof PAYMENT_STATUS_LABELS] ?? sample.payment_status}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="rounded-lg border border-paper-muted bg-white p-6">
            <h2 className="font-display text-lg text-brand-900">Sample details</h2>
            <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <DetailField label="Company" value={sample.company_name} />
              <DetailField label="Phone" value={sample.phone} />
              <DetailField
                label="Product"
                value={
                  product.error
                    ? "Could not load product name"
                    : product.data
                      ? `${product.data.name} (${product.data.slug})`
                      : sample.product_id
                }
              />
              <DetailField label="Requested quantity" value={String(sample.requested_quantity)} />
              <DetailField
                label="Linked buyer account"
                value={
                  buyer.error
                    ? "Could not load buyer account"
                    : buyer.data
                      ? `${buyer.data.company_name}${buyer.data.verified ? " (verified)" : ""}`
                      : "Guest"
                }
              />
              <DetailField
                label="Linked quote request"
                value={
                  quoteRequest.error
                    ? "Could not load linked quote request"
                    : quoteRequest.data
                      ? (quoteRequest.data.company_name ?? quoteRequest.data.email)
                      : null
                }
              />
              <DetailField label="Sample charge" value={`${sample.sample_charge} ${sample.currency}`} />
              <DetailField label="Tracking number" value={sample.tracking_number} />
              <DetailField label="Courier" value={sample.courier_name} />
              <DetailField label="Shipping port" value={sample.shipping_port} />
              <DetailField label="Shipping country" value={sample.shipping_country} />
            </dl>
            <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <dt className="font-body text-xs font-medium uppercase tracking-wide text-ink-muted">Requested</dt>
                <dd className="font-body text-sm text-ink"><LocalDateTime iso={sample.created_at} /></dd>
              </div>
              <div>
                <dt className="font-body text-xs font-medium uppercase tracking-wide text-ink-muted">Updated</dt>
                <dd className="font-body text-sm text-ink"><LocalDateTime iso={sample.updated_at} /></dd>
              </div>
            </dl>
            {sample.shipping_address && (
              <div className="mt-4">
                <p className="font-body text-xs font-medium uppercase tracking-wide text-ink-muted">
                  Shipping address
                </p>
                <p className="mt-1 whitespace-pre-line font-body text-sm text-ink">{sample.shipping_address}</p>
              </div>
            )}
          </div>

          <div className="mt-6 rounded-lg border border-paper-muted bg-white p-6">
            <h2 className="font-display text-lg text-brand-900">Activity timeline</h2>
            <div className="mt-4">
              <ActivityTimelineSection result={activityResult} />
            </div>
            <AddNoteForm sampleId={id} />
          </div>
        </div>

        <div className="rounded-lg border border-paper-muted bg-white p-6">
          <h2 className="font-display text-lg text-brand-900">Manage sample</h2>
          {adminsResult.error && (
            <p className="mb-2 font-body text-xs text-clay">
              Could not load the staff assignment list — assignment options below may be incomplete.
            </p>
          )}
          <div className="mt-4">
            <SampleUpdateForm
              id={id}
              admins={adminsResult.admins}
              initial={{
                sampleStatus: sample.sample_status,
                paymentStatus: sample.payment_status,
                assignedTo: sample.assigned_to,
                courierName: sample.courier_name,
                trackingNumber: sample.tracking_number,
                sampleCharge: sample.sample_charge,
                currency: sample.currency,
                shippingCountry: sample.shipping_country,
                shippingAddress: sample.shipping_address,
                shippingPort: sample.shipping_port,
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
