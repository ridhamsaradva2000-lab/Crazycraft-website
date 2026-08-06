import { Container } from "@/components/ui/Container";
import { ProfileForm } from "@/components/auth/ProfileForm";
import { getBuyerProfile } from "@/lib/auth/session";

export default async function ProfilePage() {
  const profile = await getBuyerProfile();

  return (
    <Container className="py-10">
      <h1 className="font-display text-3xl text-brand-900">Company profile</h1>
      <p className="mt-2 max-w-xl font-body text-sm text-ink-muted">
        This information is shared with our export team when reviewing your account and
        preparing quotes.
      </p>

      <div className="mt-8 max-w-2xl rounded-lg border border-paper-muted bg-white p-8">
        {!profile && (
          <p className="mb-6 font-body text-sm text-ink-muted">
            We don&apos;t have any company details on file yet — this can happen if you signed up
            with Google. Fill in your details below to get started.
          </p>
        )}
        <ProfileForm profile={profile} />
      </div>
    </Container>
  );
}
