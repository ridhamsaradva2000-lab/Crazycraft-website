import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { clientEnv } from "@/lib/env.client";

export const metadata: Metadata = {
  title: "Why Us",
  description: "Why B2B buyers choose Crazycraft for sourcing Indian handicrafts.",
  alternates: { canonical: `${clientEnv.NEXT_PUBLIC_SITE_URL}/why-us` },
};

const REASONS = [
  {
    title: "MOQ-Based Ordering",
    description:
      "Minimum order quantities are set per product, so you can plan orders around what actually works for your business.",
  },
  {
    title: "Customization Options",
    description:
      "Many products in our catalogue support customization — check individual product pages or ask when requesting a quote.",
  },
  {
    title: "Clear Specifications",
    description:
      "Product pages list material, dimensions, weight, and HS code where available, so you know what you're ordering.",
  },
  {
    title: "Direct Communication",
    description:
      "Every quote request goes to our export team directly — no automated pricing, no guesswork on specifications.",
  },
  {
    title: "Packing Coordination",
    description:
      "We confirm packing requirements with you before production, rather than defaulting to a single standard.",
  },
  {
    title: "Documentation Support",
    description:
      "Available compliance, product, and export documentation depends on the product and destination — confirmed per order.",
  },
] as const;

export default function WhyUsPage() {
  return (
    <Container className="py-16">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-3xl text-brand-900 md:text-4xl">Why Buyers Choose Crazycraft</h1>
        <p className="mt-4 font-body text-lg text-ink-muted">
          A straightforward sourcing process, built around what B2B buyers actually need to plan an
          order.
        </p>

        <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-2">
          {REASONS.map((reason) => (
            <div key={reason.title}>
              <h2 className="font-display text-lg text-brand-900">{reason.title}</h2>
              <p className="mt-2 font-body text-sm text-ink-muted">{reason.description}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-lg border border-paper-muted bg-white p-8 text-center">
          <h2 className="font-display text-xl text-brand-900">Ready to get a quote?</h2>
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
