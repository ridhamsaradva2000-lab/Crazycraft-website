import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { clientEnv } from "@/lib/env.client";

export const metadata: Metadata = {
  title: "About",
  description:
    "Crazycraft is a B2B exporter of Indian handicrafts for importers, wholesalers, distributors, and retail buyers worldwide.",
  alternates: { canonical: `${clientEnv.NEXT_PUBLIC_SITE_URL}/about` },
};

export default function AboutPage() {
  return (
    <Container className="py-16">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-3xl text-brand-900 md:text-4xl">About Crazycraft</h1>
        <p className="mt-4 font-body text-lg text-ink-muted">
          Crazycraft is a B2B exporter connecting buyers with Indian handicrafts — Blue Pottery,
          wooden handicrafts, tote bags, bedding sets, and home decor.
        </p>

        <div className="mt-10 space-y-8">
          <section>
            <h2 className="font-display text-xl text-brand-900">What We Do</h2>
            <p className="mt-2 font-body text-ink-muted">
              We work with importers, wholesalers, distributors, retail chains, interior designers,
              and hospitality buyers to source handicraft products for bulk and private-label orders.
              Our catalogue spans multiple product categories, each with its own specifications for
              minimum order quantity, lead time, and available customization.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl text-brand-900">How We Work With Buyers</h2>
            <p className="mt-2 font-body text-ink-muted">
              Every order starts with a quote request — tell us the product, quantity, and
              destination, and our team will confirm specifications, sampling options, and
              packing/documentation requirements before production begins. We aim for clear,
              direct communication throughout the order process, from initial enquiry to shipment
              coordination.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl text-brand-900">Product Range</h2>
            <p className="mt-2 font-body text-ink-muted">
              Browse our current catalogue to see available products, materials, and customization
              options. Specifications such as MOQ, lead time, dimensions, and HS code are listed on
              each product page where available.
            </p>
            <Link href={"/products" as Route} className="mt-3 inline-block font-body text-sm text-brand-700 hover:underline">
              Browse the catalogue →
            </Link>
          </section>
        </div>

        <div className="mt-12 rounded-lg border border-paper-muted bg-white p-8 text-center">
          <h2 className="font-display text-xl text-brand-900">Have a product in mind?</h2>
          <p className="mt-2 font-body text-sm text-ink-muted">
            Request a quote and our team will get back to you with next steps.
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
