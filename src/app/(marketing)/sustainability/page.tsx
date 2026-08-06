import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { clientEnv } from "@/lib/env.client";

export const metadata: Metadata = {
  title: "Sustainability",
  description: "Crazycraft's approach to material sourcing and production across our handicraft catalogue.",
  alternates: { canonical: `${clientEnv.NEXT_PUBLIC_SITE_URL}/sustainability` },
};

export default function SustainabilityPage() {
  return (
    <Container className="py-16">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-3xl text-brand-900 md:text-4xl">Sustainability</h1>
        <p className="mt-4 font-body text-lg text-ink-muted">
          Our catalogue spans a range of materials and production methods — some products are
          handcrafted using traditional techniques, others are manufactured. Sustainability
          characteristics vary by product.
        </p>

        <div className="mt-10 space-y-8">
          <section>
            <h2 className="font-display text-xl text-brand-900">Product-by-Product Detail</h2>
            <p className="mt-2 font-body text-ink-muted">
              We don&apos;t apply a single sustainability claim across the whole catalogue, because it
              wouldn&apos;t be accurate for every item. Where a product page lists material or
              craftsmanship details, that information reflects that specific product. If a
              sustainability detail isn&apos;t listed and matters to your order, ask our team when you
              request a quote — we&apos;ll confirm what we can for that specific product.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl text-brand-900">Artisan-Made Items</h2>
            <p className="mt-2 font-body text-ink-muted">
              Part of our catalogue includes handcrafted items made using traditional techniques.
              These products are identified as such on their individual product pages, along with
              their listed material.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl text-brand-900">Packaging</h2>
            <p className="mt-2 font-body text-ink-muted">
              Packing specifications are confirmed per order based on your requirements and
              destination — let us know if packaging materials are a factor in your decision when
              you request a quote.
            </p>
          </section>
        </div>

        <div className="mt-12 rounded-lg border border-paper-muted bg-white p-8 text-center">
          <h2 className="font-display text-xl text-brand-900">Questions about a specific product?</h2>
          <p className="mt-2 font-body text-sm text-ink-muted">
            Ask us directly when you request a quote.
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
