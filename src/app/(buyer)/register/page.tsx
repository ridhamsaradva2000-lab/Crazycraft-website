import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { RegisterForm } from "@/components/auth/RegisterForm";

export const metadata: Metadata = {
  title: "Create a Buyer Account",
};

export default function RegisterPage() {
  return (
    <Container className="flex min-h-[70vh] items-center justify-center py-16">
      <div className="w-full max-w-lg rounded-lg border border-paper-muted bg-white p-8 shadow-sm">
        <h1 className="mb-2 font-display text-2xl text-brand-900">Create a buyer account</h1>
        <p className="mb-6 font-body text-sm text-ink-muted">
          For importers, wholesalers, retail chains, distributors, interior designers, and hotel
          buyers. Your account is reviewed before trade pricing and catalogs unlock.
        </p>
        <RegisterForm />
      </div>
    </Container>
  );
}
