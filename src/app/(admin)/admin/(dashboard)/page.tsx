import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { getAdminProfile } from "@/lib/auth/session";

export default async function AdminHomePage() {
  const profile = await getAdminProfile();

  return (
    <Container className="py-10">
      <h1 className="font-display text-3xl text-brand-900">
        Welcome, {profile?.fullName ?? "Admin"}
      </h1>
      <p className="mt-2 font-body text-sm text-ink-muted">
        Signed in as {profile?.role.replace("_", " ")}.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Link
          href="/admin/leads"
          className="rounded-lg border border-paper-muted bg-white p-6 transition-colors hover:border-brand-700"
        >
          <h2 className="font-display text-lg text-brand-900">Leads</h2>
          <p className="mt-1 font-body text-sm text-ink-muted">
            Inquiries and quote requests — status, assignment, and follow-ups.
          </p>
        </Link>
        <Link
          href="/admin/samples"
          className="rounded-lg border border-paper-muted bg-white p-6 transition-colors hover:border-brand-700"
        >
          <h2 className="font-display text-lg text-brand-900">Samples</h2>
          <p className="mt-1 font-body text-sm text-ink-muted">
            Sample requests — fulfillment status, payment, and shipping.
          </p>
        </Link>
        <div className="rounded-lg border border-paper-muted bg-white p-6">
          <h2 className="font-display text-lg text-brand-900">Catalog</h2>
          <p className="mt-1 font-body text-sm text-ink-muted">
            Products, categories, and media will be managed here.
          </p>
        </div>
        <div className="rounded-lg border border-paper-muted bg-white p-6">
          <h2 className="font-display text-lg text-brand-900">Settings</h2>
          <p className="mt-1 font-body text-sm text-ink-muted">
            Staff accounts and site configuration will be managed here.
          </p>
        </div>
      </div>
    </Container>
  );
}
