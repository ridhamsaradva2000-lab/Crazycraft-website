import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import type { Route } from "next";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { ProductCard } from "@/components/catalog/ProductCard";
import { getPublishedCategories, getFeaturedProducts } from "@/lib/catalog/data";
import { safeJsonLd } from "@/lib/seo/jsonLd";
import { clientEnv } from "@/lib/env.client";
import { SITE_NAME, SITE_DESCRIPTION } from "@/lib/constants";

export const metadata: Metadata = {
  title: { absolute: "CrazyCraft Global | B2B Handicraft Exporter from India" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: "CrazyCraft Global | B2B Handicraft Exporter from India",
    description: SITE_DESCRIPTION,
    images: [{ url: "/opengraph-image.png", width: 1200, height: 630, alt: "CrazyCraft Global: Indian Handicrafts for Wholesale and Export" }],
  },
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

type CategoryCardContent = {
  image: string;
  badges: readonly string[];
  micro: string;
};

// Presentation-only imagery and copy for the homepage category cards, keyed by the existing
// category slug. Category order, names and routes always come from getPublishedCategories();
// a category with no entry here still renders (brand background, title only) and keeps its route.
const CATEGORY_CARD_CONTENT = new Map<string, CategoryCardContent>([
  [
    "bedding-home-textile",
    {
      image: "/images/categories/bedding-home-textile.webp",
      badges: ["EXPORT READY", "CUSTOM ORDERS"],
      micro: "Bedding \u2022 Home textiles \u2022 Hand block designs",
    },
  ],
  [
    "handmade-cotton-bag-patchwork-decor",
    {
      image: "/images/categories/handmade-cotton-bag-patchwork-decor.webp",
      badges: ["PRIVATE LABEL", "CUSTOM BRANDING"],
      micro: "Cotton bags \u2022 Patchwork decor \u2022 Custom orders",
    },
  ],
  [
    "jaipur-blue-pottery-ceramic",
    {
      image: "/images/categories/jaipur-blue-pottery-ceramic.webp",
      badges: ["BULK ORDERS", "CUSTOM PACKAGING"],
      micro: "Blue pottery \u2022 Ceramic decor \u2022 Bulk supply",
    },
  ],
  [
    "resin-wood-serveware",
    {
      image: "/images/categories/resin-wood-serveware.webp",
      badges: ["WHOLESALE READY", "PRIVATE LABEL"],
      micro: "Resin & wood serveware \u2022 Platters \u2022 Bulk orders",
    },
  ],
  [
    "wooden-home-accents-gifts",
    {
      image: "/images/categories/wooden-home-accents-gifts.webp",
      badges: ["BULK ORDERS", "GIFT PACKAGING"],
      micro: "Wooden decor \u2022 Gifts \u2022 Key hangers",
    },
  ],
]);

// Square cards: one column on mobile, two on tablet, three on desktop (the container caps at 1280px).
const CATEGORY_CARD_IMAGE_SIZES = "(min-width: 1280px) 389px, (min-width: 1024px) 31vw, (min-width: 768px) 48vw, 92vw";

export default async function HomePage() {
  const [{ categories, error: categoriesError }, { products: featuredProducts, error: productsError }] =
    await Promise.all([getPublishedCategories(), getFeaturedProducts(4)]);

  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    alternateName: "CrazyCraft",
    url: clientEnv.NEXT_PUBLIC_SITE_URL,
    description: SITE_DESCRIPTION,
  };

  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    alternateName: "CrazyCraft",
    url: clientEnv.NEXT_PUBLIC_SITE_URL,
  };

  return (
    <>
      {/* eslint-disable-next-line react/no-danger -- safeJsonLd() escapes characters that could break out of this script tag */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(organizationJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(websiteJsonLd) }} />

      {/* 1. Hero */}
      <section className="border-b border-paper-muted bg-white">
        <Container className="py-20 text-center md:py-28">
          <h1 className="mx-auto max-w-3xl font-display text-4xl text-brand-900 md:text-5xl">
            Indian Handicrafts, Sourced for Export
          </h1>
          <p className="mx-auto mt-5 max-w-2xl font-body text-lg text-ink-muted">
            CrazyCraft Global connects importers, wholesalers, and retail buyers with Blue Pottery, wooden
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
            <div className="mt-6 flex flex-wrap justify-center gap-5 lg:gap-6">
              {categories.slice(0, 8).map((category) => {
                const content = CATEGORY_CARD_CONTENT.get(category.slug);
                return (
                  <Link
                    key={category.id}
                    href={`/categories/${category.slug}` as Route}
                    className="group relative isolate block aspect-square w-full overflow-hidden rounded-lg bg-brand-900 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 md:w-[calc(50%_-_0.625rem)] lg:w-[calc(33.333333%_-_1rem)]"
                  >
                    {content ? (
                      <Image
                        src={content.image}
                        alt=""
                        fill
                        sizes={CATEGORY_CARD_IMAGE_SIZES}
                        className="object-cover motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out motion-safe:group-hover:scale-[1.03]"
                      />
                    ) : null}
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(18,47,69,0.92)_0%,rgba(18,47,69,0.45)_42%,rgba(18,47,69,0)_72%)]"
                    />
                    <div className="absolute inset-x-0 bottom-0 p-4 pr-[4.25rem] sm:p-5 sm:pr-[4.75rem]">
                      <h3 className="font-display text-xl leading-snug text-white xl:text-2xl">{category.name}</h3>
                      {content ? (
                        <p className="mt-1.5 font-body text-xs leading-snug text-white/85 sm:text-[0.8125rem]">
                          {content.micro}
                        </p>
                      ) : null}
                    </div>
                    {content ? (
                      <div className="absolute inset-x-0 top-0 flex flex-wrap justify-end gap-2 p-4 sm:p-5">
                        {content.badges.map((badge) => (
                          <span
                            key={badge}
                            className="rounded-full bg-brand-900/70 px-2.5 py-1 font-body text-[0.6875rem] font-medium uppercase leading-none tracking-wider text-white ring-1 ring-white/25 backdrop-blur-sm"
                          >
                            {badge}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute bottom-4 right-4 flex h-10 w-10 items-center justify-center rounded-full border border-white/40 bg-white/60 text-brand-900 shadow-lg shadow-black/25 backdrop-blur-sm motion-safe:transition-colors motion-safe:duration-300 group-hover:bg-white/80 group-focus-visible:bg-white/80 sm:bottom-5 sm:right-5 sm:h-11 sm:w-11"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-5 w-5 motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:translate-x-0.5"
                      >
                        <path d="M7 17 17 7M8 7h9v9" />
                      </svg>
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </Container>
      </section>

      {/* 4. Featured products */}
      <section className="border-t border-paper-muted bg-paper-muted py-16">
        <Container>
          <div className="flex items-end justify-between">
            <h2 className="font-display text-2xl text-brand-900 md:text-3xl">Explore Full Artisan Catalog</h2>
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
            Why Buyers Work With CrazyCraft Global
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
          <h2 className="font-display text-2xl text-white md:text-3xl">Ready to source with CrazyCraft Global?</h2>
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
