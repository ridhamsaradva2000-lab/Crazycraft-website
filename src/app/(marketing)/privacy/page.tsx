import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { Container } from "@/components/ui/Container";
import { ConsentPreferences } from "@/components/consent/ConsentPreferences";
import { clientEnv } from "@/lib/env.client";

export const metadata: Metadata = {
  title: "Privacy & Cookies",
  description:
    "How Crazycraft uses cookies, including the essential cookie that remembers your consent choice, and how marketing measurement (Meta Pixel) is used when accepted.",
  alternates: { canonical: `${clientEnv.NEXT_PUBLIC_SITE_URL}/privacy` },
};

export default function PrivacyPage() {
  return (
    <Container className="py-16">
      <div className="mx-auto max-w-2xl">
        <h1 className="font-display text-3xl text-brand-900 md:text-4xl">Privacy &amp; Cookies</h1>

        <section className="mt-8">
          <h2 className="font-display text-xl text-brand-900">Essential cookies</h2>
          <p className="mt-2 font-body text-ink-muted">
            This site sets one first-party essential cookie to remember whether you&apos;ve made a
            cookie choice, and if so, what it was. This is set regardless of which choice you make
            below.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="font-display text-xl text-brand-900">Marketing cookies</h2>
          <p className="mt-2 font-body text-ink-muted">
            With your permission, we use marketing measurement (Meta Pixel) to help measure the
            effectiveness of our advertising. Marketing tracking is off by default and activates
            only after you explicitly accept below, and only when a Meta Pixel is currently
            configured for this site. Marketing tracking remains off while your current choice is
            Reject. When active, a script hosted by Meta may load in your browser, and this site
            calls a PageView measurement event to Meta along with associated technical
            information. You can reject and still use every part of this site normally, and you
            can change your choice at any time below.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="font-display text-xl text-brand-900">Your current choice</h2>
          <div className="mt-2">
            <ConsentPreferences />
          </div>
        </section>

        <section className="mt-8">
          <h2 className="font-display text-xl text-brand-900">Contact</h2>
          <p className="mt-2 font-body text-ink-muted">
            Questions about this page can be sent through our{" "}
            <Link href={"/contact" as Route} className="underline hover:text-brand-700">
              contact form
            </Link>
            .
          </p>
        </section>
      </div>
    </Container>
  );
}