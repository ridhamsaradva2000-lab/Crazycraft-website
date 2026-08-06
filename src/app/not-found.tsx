import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <Container className="py-24 text-center">
      <h1 className="font-display text-3xl text-brand-900">Page not found</h1>
      <p className="mt-3 font-body text-ink-muted">
        The page you&apos;re looking for doesn&apos;t exist or has moved.
      </p>
      <Button asChild className="mt-6">
        <Link href="/">Back to homepage</Link>
      </Button>
    </Container>
  );
}
