import type { Metadata } from "next";
import { Suspense } from "react";
import { Container } from "@/components/ui/Container";
import { InquiryForm } from "@/components/inquiry/InquiryForm";
import { getProductBySlug } from "@/lib/catalog/data";
import { catalogSlugSchema } from "@/lib/catalog/validations";

export const metadata: Metadata = {
  title: "Contact Us",
  description:
    "Get in touch with Crazycraft's export team — importers, wholesalers, retail chains, distributors, interior designers, and hotel buyers welcome.",
};

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string | string[] }>;
}) {
  const { product: rawProductSlug } = await searchParams;

  // The product context is resolved server-side from a real, published
  // product record — never passed through as a raw client-supplied
  // value. The slug is validated against the same canonical format used
  // everywhere else in the catalogue BEFORE it ever reaches the
  // database: a malformed value, an oversized value, or a repeated query
  // parameter (which Next.js delivers as a string ARRAY, not a string,
  // and therefore fails this string schema outright) all safely fall
  // back to no product context — a general inquiry — without ever
  // calling getProductBySlug() at all. An unknown or unpublished slug
  // (a validly-shaped slug that simply doesn't resolve to any published
  // product) also falls back to no product context silently, same as
  // before — a bad ?product= value should never block someone from
  // reaching the contact form. A GENUINE operational database failure on
  // an otherwise validly-shaped slug is different, though: that is not
  // "this product doesn't exist," so it is not silently treated the
  // same way — see productLookupError below, which surfaces a plain,
  // non-raw notice instead. submit_inquiry() (Module 4) independently
  // re-validates the product id server-side regardless of what this page
  // passes through, and the existing secured InquiryForm/Turnstile/
  // rate-limit flow is unchanged either way — this is a UX nicety, not
  // the actual boundary.
  const parsedProductSlug = catalogSlugSchema.safeParse(rawProductSlug);
  const { product, error: productLookupError } = parsedProductSlug.success
    ? await getProductBySlug(parsedProductSlug.data)
    : { product: null, error: false };

  return (
    <Container className="py-16">
      <div className="mx-auto max-w-2xl">
        <h1 className="font-display text-3xl text-brand-900 md:text-4xl">Get in touch</h1>
        <p className="mt-3 font-body text-ink-muted">
          Tell us a little about your business and what you&apos;re looking for. You can submit
          with just the basics, or add company and shipping details now to help us prepare a
          faster, more accurate quote.
        </p>

        {productLookupError && (
          <p className="mt-4 rounded-md border border-clay/40 bg-clay/5 p-3 font-body text-sm text-clay">
            The selected product could not be loaded right now. You may still submit a general
            inquiry.
          </p>
        )}

        <div className="mt-8 rounded-lg border border-paper-muted bg-white p-8">
          <Suspense fallback={<p className="font-body text-sm text-ink-muted">Loading form…</p>}>
            <InquiryForm productId={product?.id} productName={product?.name} />
          </Suspense>
        </div>
      </div>
    </Container>
  );
}
