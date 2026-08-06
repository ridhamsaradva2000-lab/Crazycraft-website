"use client";

import Link from "next/link";
import type { Route } from "next";
import { Button } from "@/components/ui/Button";
import { useConsent } from "@/lib/consent/ConsentProvider";

/**
 * Renders nothing until after the shared provider's client-side cookie
 * check completes (hasChecked is false during SSR and the first client
 * render, so both agree — no hydration mismatch), and nothing once a
 * decision already exists. This component itself never calls fbq or
 * loads any script — it only records the visitor's choice via
 * ConsentProvider. Whether marketing measurement (Meta Pixel) actually
 * activates as a result is handled entirely by MetaPixel.tsx, gated on
 * this choice plus a configured Pixel ID.
 */
export function ConsentBanner() {
  const { decision, hasChecked, setDecision } = useConsent();

  if (!hasChecked || decision !== null) return null;

  return (
    <div
      role="region"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-paper-muted bg-white px-4 py-4 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] sm:px-6"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-body text-sm text-ink-muted">
          We&apos;d like your permission for marketing measurement (Meta Pixel), used to help
          measure the effectiveness of our advertising. Marketing tracking is off by default and
          only activates if you accept and a valid Meta Pixel ID is configured for this site.
          Marketing tracking remains off while your current choice is Reject. See our{" "}
          <Link href={"/privacy" as Route} className="underline hover:text-brand-700">
            Privacy &amp; Cookies
          </Link>{" "}
          page for details or to change your choice later.
        </p>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="outline" onClick={() => setDecision(false)}>
            Reject non-essential
          </Button>
          <Button type="button" variant="outline" onClick={() => setDecision(true)}>
            Accept marketing
          </Button>
        </div>
      </div>
    </div>
  );
}