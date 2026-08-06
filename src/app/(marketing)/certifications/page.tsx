import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { clientEnv } from "@/lib/env.client";

export const metadata: Metadata = {
  title: "Certifications & Documentation",
  description: "Compliance, product, and export documentation availability for Crazycraft orders.",
  alternates: { canonical: `${clientEnv.NEXT_PUBLIC_SITE_URL}/certifications` },
};

export default function CertificationsPage() {
  return (
    <Container className="py-16">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-3xl text-brand-900 md:text-4xl">Certifications & Documentation</h1>
        <p className="mt-4 font-body text-lg text-ink-muted">
          Available compliance, product, and export documentation depends on the specific product
          and order — it is confirmed with our team as part of the quote and order process, not
          published as a blanket claim here.
        </p>

        <div className="mt-10 space-y-8">
          <section>
            <h2 className="font-display text-xl text-brand-900">Documentation Subject to Confirmation</h2>
            <p className="mt-2 font-body text-ink-muted">
              Different products and destinations require different documentation. When you request
              a quote, let us know what documentation your order needs — we&apos;ll confirm what&apos;s
              available for that specific product before you place an order.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl text-brand-900">Export Documentation</h2>
            <p className="mt-2 font-body text-ink-muted">
              Export paperwork is coordinated per shipment based on your destination&apos;s requirements.
              Discuss your destination&apos;s specific documentation needs with our team when confirming
              an order.
            </p>
          </section>
        </div>

        <div className="mt-12 rounded-lg border border-paper-muted bg-white p-8 text-center">
          <h2 className="font-display text-xl text-brand-900">Need to confirm documentation for a product?</h2>
          <p className="mt-2 font-body text-sm text-ink-muted">
            Ask when you request a quote and we&apos;ll let you know what applies to your order.
          </p>
          <div className="mt-5">
            <Button asChild>
              <Link href={"/contact" as Route}>Request a Quote</Link>
            </Button>
          </div>
        </div>
      </div>
    </Container>
  );
}
