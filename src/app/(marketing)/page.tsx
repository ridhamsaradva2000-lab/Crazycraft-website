import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { ProductCard } from "@/components/catalog/ProductCard";
import { getPublishedCategories, getFeaturedProducts } from "@/lib/catalog/data";
import { safeJsonLd } from "@/lib/seo/jsonLd";
import { clientEnv } from "@/lib/env.client";
import { SITE_DESCRIPTION } from "@/lib/constants";

export const metadata: Metadata = {
  title: { absolute: "Crazycraft | B2B Handicraft Exporter from India" },
  description: SITE_DESCRIPTION,
  alternates: { canonical: clientEnv.NEXT_PUBLIC_SITE_URL },
};

const VALUE_STRIP = [
  { label: "OEM / Private Label", description: "Custom branding coordination for qualifying orders" },
  { label: "Custom Packaging", description: "Packing specifications confirmed per order" },
  { label: "Bulk Orders", description: "MOQ-based pricing for wholesale quantities" },
  { label: "Worldwide Enquiries", description: "Export documentation coordinated per destination" },
] as const;

const BUYING_PROCESS = [
  { step: "Browse", description: "Explore the catalogue by category or search for a specific product." },
  { step: "Enquire", description: "Submit a quote request with your target quantity and destination." },
  { step: "Confirm Specifications", description: "We confirm material, dimensions, and customization details with you." },
  { step: "Sampling", description: "Where applicable, samples are coordinated before a full production run." },
  { step: "Production & Packing", description: "We coordinate production and packing to your confirmed specification." },
  { step: "Shipment", description: "Export documentation and shipment are coordinated for your destination." },
] as const;

const BUYER_INDUSTRIES = [
  "Importers",
  "Wholesalers",
  "Distributors",
  "Gift & Home Decor Stores",
  "Retail Chains",
  "Interior Designers",
  "Hospitality Buyers",
  "Private-Label Buyers",
] as const;

export default async function HomePage() {
  const [{ categories, error: categoriesError }, { products: featuredProducts, error: productsError }] =
    await Promise.all([getPublishedCategories(), getFeaturedProducts(4)]);

  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Crazycraft",
    url: clientEnv.NEXT_PUBLIC_SITE_URL,
    description: SITE_DESCRIPTION,
  };

  return (
    <>
      {/* eslint-disable-next-line react/no-danger -- safeJsonLd() escapes characters that could break out of this script tag */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(organizationJsonLd) }} />

      {/* 1. Hero */}
      <section className="border-b border-paper-muted bg-white">
        <Container className="py-20 text-center md:py-28">
          <h1 className="mx-auto max-w-3xl font-display text-4xl text-brand-900 md:text-5xl">
            Indian Handicrafts, Sourced for Export
          </h1>
          <p className="mx-auto mt-5 max-w-2xl font-body text-lg text-ink-muted">
            Crazycraft connects importers, wholesalers, and retail buyers with Blue Pottery, wooden
            handicrafts, tote bags, bedding sets, and home decor — ready for bulk and private-label
            orders.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Button asChild>
              <Link href={"/products" as Route}>Explore Products</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={"/contact" as Route}>Request a Quote</Link>
            </Button>
          </div>
        </Container>
      </section>

      {/* 2. Trust/value strip */}
      <section className="border-b border-paper-muted bg-paper-muted">
        <Container className="py-10">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            {VALUE_STRIP.map((item) => (
              <div key={item.label} className="text-center">
                <p className="font-display text-base text-brand-900">{item.label}</p>
                <p className="mt-1 font-body text-xs text-ink-muted">{item.description}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* 3. Product categories */}
      <section className="py-16">
        <Container>
          <div className="flex items-end justify-between">
            <h2 className="font-display text-2xl text-brand-900 md:text-3xl">Shop by Category</h2>
            <Link href={"/products" as Route} className="font-body text-sm text-brand-700 hover:underline">
              View all →
            </Link>
          </div>

          {categoriesError ? (
            <p className="mt-6 font-body text-sm text-clay">Categories could not be loaded right now.</p>
          ) : categories.length === 0 ? (
            <p className="mt-6 font-body text-sm text-ink-muted">
              Categories are being added — in the meantime, browse the{" "}
              <Link href={"/products" as Route} className="underline hover:text-brand-700">
                full catalogue
              </Link>
              .
            </p>
          ) : (
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {categories.slice(0, 8).map((category) => (
                <Link
                  key={category.id}
                  href={`/categories/${category.slug}` as Route}
                  className="rounded-lg border border-paper-muted bg-white p-6 text-center transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
                >
                  <span className="font-display text-base text-brand-900">{category.name}</span>
                </Link>
              ))}
            </div>
          )}
        </Container>
      </section>

      {/* 4. Featured products */}
      <section className="border-t border-paper-muted bg-paper-muted py-16">
        <Container>
          <div className="flex items-end justify-between">
            <h2 className="font-display text-2xl text-brand-900 md:text-3xl">Featured Products</h2>
            <Link href={"/products" as Route} className="font-body text-sm text-brand-700 hover:underline">
              View all →
            </Link>
          </div>

          {productsError ? (
            <p className="mt-6 font-body text-sm text-clay">Products could not be loaded right now.</p>
          ) : featuredProducts.length === 0 ? (
            <p className="mt-6 font-body text-sm text-ink-muted">
              New products are being added to the catalogue — check back soon.
            </p>
          ) : (
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {featuredProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </Container>
      </section>

      {/* 5. Why buyers work with Crazycraft */}
      <section className="py-16">
        <Container>
          <h2 className="font-display text-2xl text-brand-900 md:text-3xl">
            Why Buyers Work With Crazycraft
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            <WhyItem
              title="Artisan-Focused Sourcing"
              description="Products sourced with attention to craftsmanship and material quality, order by order."
            />
            <WhyItem
              title="Customization"
              description="Many products support customization — see individual listings for what's available."
            />
            <WhyItem
              title="Export-Oriented Communication"
              description="Clear communication on specifications, timelines, and order status throughout."
            />
            <WhyItem
              title="Packing Support"
              description="Packing specifications are confirmed with you before production begins."
            />
            <WhyItem
              title="Documentation Coordination"
              description="We coordinate the documentation your order requires, confirmed per product and destination."
            />
            <WhyItem
              title="MOQ-Based Flexibility"
              description="Minimum order quantities are set per product to support a range of order sizes."
            />
          </div>
        </Container>
      </section>

      {/* 6. B2B buying process */}
      <section className="border-t border-paper-muted bg-paper-muted py-16">
        <Container>
          <h2 className="font-display text-2xl text-brand-900 md:text-3xl">How Ordering Works</h2>
          <ol className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {BUYING_PROCESS.map((item, index) => (
              <li key={item.step} className="rounded-lg border border-paper-muted bg-white p-6">
                <span className="font-mono text-xs text-ink-muted">Step {index + 1}</span>
                <p className="mt-1 font-display text-lg text-brand-900">{item.step}</p>
                <p className="mt-2 font-body text-sm text-ink-muted">{item.description}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      {/* 7. Buyer industries */}
      <section className="py-16">
        <Container>
          <h2 className="font-display text-2xl text-brand-900 md:text-3xl">Who We Work With</h2>
          <ul className="mt-6 flex flex-wrap gap-3">
            {BUYER_INDUSTRIES.map((industry) => (
              <li
                key={industry}
                className="rounded-full border border-paper-muted bg-white px-4 py-2 font-body text-sm text-ink"
              >
                {industry}
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* 8. Sustainability/artisan section */}
      <section className="border-t border-paper-muted bg-paper-muted py-16">
        <Container>
          <div className="max-w-2xl">
            <h2 className="font-display text-2xl text-brand-900 md:text-3xl">Craft & Sourcing</h2>
            <p className="mt-4 font-body text-ink-muted">
              Our catalogue includes handcrafted and artisan-made items alongside manufactured pieces.
              Material, sustainability, and production details vary by product — see each product
              listing for its specific material and customization information, or ask our team when
              requesting a quote.
            </p>
            <Link href={"/sustainability" as Route} className="mt-3 inline-block font-body text-sm text-brand-700 hover:underline">
              Learn more about our approach →
            </Link>
          </div>
        </Container>
      </section>

      {/* 9. Final quote CTA */}
      <section className="bg-brand-900 py-16">
        <Container className="text-center">
          <h2 className="font-display text-2xl text-white md:text-3xl">Ready to source with Crazycraft?</h2>
          <p className="mx-auto mt-3 max-w-xl font-body text-brand-100">
            Tell us what you&apos;re looking for and we&apos;ll get back to you with MOQ, lead time, and
            customization options.
          </p>
          <div className="mt-6">
            <Button asChild variant="secondary">
              <Link href={"/contact" as Route}>Request a Quote</Link>
            </Button>
          </div>
        </Container>
      </section>
    </>
  );
}

function WhyItem({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h3 className="font-display text-lg text-brand-900">{title}</h3>
      <p className="mt-2 font-body text-sm text-ink-muted">{description}</p>
    </div>
  );
}
