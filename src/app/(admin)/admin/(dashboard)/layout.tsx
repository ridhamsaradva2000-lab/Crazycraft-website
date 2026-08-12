import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { getCurrentUser, getAdminProfile } from "@/lib/auth/session";

export default async function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Belt-and-suspenders: proxy.ts already redirects unauthenticated or
  // non-admin requests away from /admin/* (except /admin/login) before
  // this layout ever renders — but a Server Component should never
  // assume that and skip its own check.
  const user = await getCurrentUser();
  if (!user) {
    redirect("/admin/login");
  }

  const profile = await getAdminProfile();
  if (!profile) {
    redirect("/");
  }

  return (
    <div className="flex min-h-screen flex-col bg-ink">
      <header className="border-b border-white/10">
        <Container className="flex h-16 items-center justify-between">
          <Link href="/admin" className="font-display text-lg text-white">
            Crazycraft Admin
          </Link>
          <nav aria-label="Admin navigation" className="hidden gap-6 md:flex">
            <Link href="/admin/leads" className="font-body text-sm text-white/80 hover:text-white">
              Leads
            </Link>
            <Link href="/admin/samples" className="font-body text-sm text-white/80 hover:text-white">
              Samples
            </Link>
            <Link
              href={"/admin/catalog/categories" as Route}
              className="font-body text-sm text-white/80 hover:text-white"
            >
              Categories
            </Link>
          </nav>
          <div className="flex items-center gap-4">
            <span className="font-body text-sm text-white/60">
              {profile.fullName} · {profile.role.replace("_", " ")}
            </span>
            <SignOutButton tone="dark-header" />
          </div>
        </Container>
      </header>
      <main className="flex-1 bg-paper">{children}</main>
    </div>
  );
}
