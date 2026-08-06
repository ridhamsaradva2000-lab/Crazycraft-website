import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { BuyerLoginForm } from "@/components/auth/BuyerLoginForm";

export const metadata: Metadata = {
  title: "Sign In",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  return (
    <Container className="flex min-h-[70vh] items-center justify-center py-16">
      <div className="w-full max-w-md rounded-lg border border-paper-muted bg-white p-8 shadow-sm">
        <h1 className="mb-2 font-display text-2xl text-brand-900">Sign in</h1>
        <p className="mb-6 font-body text-sm text-ink-muted">
          {next
            ? "Sign in to continue."
            : "Access your buyer dashboard, saved products, and quote history."}
        </p>
        {error && (
          <p className="mb-4 font-body text-sm text-clay">
            That link is no longer valid. Please sign in again.
          </p>
        )}
        <BuyerLoginForm redirectTo={next} />
      </div>
    </Container>
  );
}
