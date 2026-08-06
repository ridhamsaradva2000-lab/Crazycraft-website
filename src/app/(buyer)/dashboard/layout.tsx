import Link from "next/link";
import { redirect } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { getCurrentUser, getBuyerProfile } from "@/lib/auth/session";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Belt-and-suspenders: proxy.ts already redirects unauthenticated
  // requests away from /dashboard/* before this layout ever renders, but
  // a Server Component should never assume that and skip its own check —
  // middleware can be bypassed by future refactors in a way a component
  // boundary check cannot.
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?next=/dashboard");
  }

  const profile = await getBuyerProfile();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-paper-muted bg-white">
        <Container className="flex h-16 items-center justify-between">
          <Link href="/dashboard" className="font-display text-lg text-brand-900">
            Crazycraft
          </Link>
         <nav
  aria-label="Dashboard navigation"
  className="flex items-center gap-3 sm:gap-6"
>
  <Link
    href="/dashboard"
    className="font-body text-xs text-ink hover:text-brand-700 sm:text-sm"
  >
    Overview
  </Link>

  <Link
    href="/dashboard/profile"
    className="font-body text-xs text-ink hover:text-brand-700 sm:text-sm"
  >
    Profile
  </Link>
</nav>
          <div className="flex items-center gap-4">
            {profile && !profile.verified && (
              <span className="hidden rounded-full bg-accent/10 px-3 py-1 font-body text-xs text-accent-dark sm:inline-block">
                Pending verification
              </span>
            )}
            <SignOutButton tone="light-header" />
          </div>
        </Container>
      </header>
      <main className="flex-1 bg-paper">{children}</main>
    </div>
  );
}
