import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { getBuyerProfile, getCurrentUser } from "@/lib/auth/session";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ profile_setup_error?: string }>;
}) {
  const { profile_setup_error } = await searchParams;
  const user = await getCurrentUser();
  const profile = await getBuyerProfile();

  return (
    <Container className="py-10">
      <h1 className="font-display text-3xl text-brand-900">
        Welcome{profile ? `, ${profile.companyName}` : ""}
      </h1>
      <p className="mt-2 font-body text-ink-muted">{user?.email}</p>

      {profile_setup_error && (
        <div className="mt-6 rounded-md border border-clay/30 bg-clay/5 p-4 font-body text-sm text-ink">
          We couldn&apos;t automatically finish setting up your profile.{" "}
          <Link href="/dashboard/profile" className="text-brand-700 hover:underline">
            Complete it manually
          </Link>{" "}
          to make sure your account is ready.
        </div>
      )}

      {!profile_setup_error && !profile && (
        <div className="mt-6 rounded-md border border-accent/30 bg-accent/5 p-4 font-body text-sm text-ink">
          We don&apos;t have your company details yet.{" "}
          <Link href="/dashboard/profile" className="text-brand-700 hover:underline">
            Complete your profile
          </Link>{" "}
          to get the most out of your account.
        </div>
      )}

      {profile && !profile.verified && (
        <div className="mt-6 rounded-md border border-accent/30 bg-accent/5 p-4 font-body text-sm text-ink">
          Your account is pending verification by our export team. You can still browse the
          catalog and submit inquiries in the meantime.
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-paper-muted bg-white p-6">
          <h2 className="font-display text-lg text-brand-900">Inquiries</h2>
          <p className="mt-1 font-body text-sm text-ink-muted">
            Your product and general inquiries will appear here.
          </p>
        </div>
        <div className="rounded-lg border border-paper-muted bg-white p-6">
          <h2 className="font-display text-lg text-brand-900">Quote requests</h2>
          <p className="mt-1 font-body text-sm text-ink-muted">
            Track RFQs you&apos;ve submitted and their status.
          </p>
        </div>
        <div className="rounded-lg border border-paper-muted bg-white p-6">
          <h2 className="font-display text-lg text-brand-900">Saved products</h2>
          <p className="mt-1 font-body text-sm text-ink-muted">
            Products you&apos;ve bookmarked while browsing the catalog.
          </p>
        </div>
      </div>
    </Container>
  );
}
