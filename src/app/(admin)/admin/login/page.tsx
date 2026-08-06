import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { AdminLoginForm } from "@/components/auth/AdminLoginForm";

export const metadata: Metadata = {
  title: "Admin Sign In",
};

export default function AdminLoginPage() {
  return (
    <Container className="flex min-h-screen items-center justify-center py-16">
      <div className="w-full max-w-md rounded-lg border border-paper-muted bg-white p-8 shadow-sm">
        <h1 className="mb-2 font-display text-2xl text-ink">Crazycraft Admin</h1>
        <p className="mb-6 font-body text-sm text-ink-muted">
          Staff sign-in only. Contact a super admin if you need access.
        </p>
        <AdminLoginForm />
      </div>
    </Container>
  );
}
