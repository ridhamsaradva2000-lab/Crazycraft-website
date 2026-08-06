import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { clientEnv } from "@/lib/env.client";

export const metadata: Metadata = {
  title: "Production Visits",
  description: "Production and artisan-workshop visit coordination for Crazycraft buyers.",
  alternates: { canonical: `${clientEnv.NEXT_PUBLIC_SITE_URL}/factory-tour` },
};

export default function FactoryTourPage() {
  return (
    <Container className="py-16">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-3xl text-brand-900 md:text-4xl">Production Visits</h1>
        <p className="mt-4 font-body text-lg text-ink-muted">
          For serious buyers evaluating a larger order, we can coordinate a visit to see production
          or artisan-workshop facilities relevant to your product — subject to availability and
          confirmation with our team.
        </p>

        <div className="mt-10 space-y-8">
          <section>
            <h2 className="font-display text-xl text-brand-900">Requesting a Visit</h2>
            <p className="mt-2 font-body text-ink-muted">
              Visit availability depends on the product, location, and current production schedule.
              Let us know which product you&apos;re sourcing and your intended timeline when you request
              a quote, and we&apos;ll confirm whether a visit can be arranged.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl text-brand-900">What to Expect</h2>
            <p className="mt-2 font-body text-ink-muted">
              Where a visit is arranged, our team will coordinate scheduling and logistics with you
              directly. Details are confirmed on a case-by-case basis as part of your order
              discussion.
            </p>
          </section>
        </div>

        <div className="mt-12 rounded-lg border border-paper-muted bg-white p-8 text-center">
          <h2 className="font-display text-xl text-brand-900">Interested in a production visit?</h2>
          <p className="mt-2 font-body text-sm text-ink-muted">
            Mention it when you request a quote and we&apos;ll follow up on availability.
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
