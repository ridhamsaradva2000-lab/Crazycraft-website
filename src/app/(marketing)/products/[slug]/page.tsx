import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { ProductGrid } from "@/components/catalog/ProductGrid";
import { getProductBySlug, getRelatedProducts } from "@/lib/catalog/data";
import { catalogSlugSchema } from "@/lib/catalog/validations";
import { safeJsonLd } from "@/lib/seo/jsonLd";
import { clientEnv } from "@/lib/env.client";

function OperationalError() {
  return (
    <Container className="py-16">
      <p className="font-body text-sm text-clay">
        Something went wrong loading this product. Please try again.
      </p>
    </Container>
  );
}

async function loadProduct(slug: string) {
  const parsedSlug = catalogSlugSchema.safeParse(slug);
  // A malformed slug can never match a real product (the canonical slug
  // format is enforced at the database level too) — treat it as a clean
  // 404 rather than letting an unusual value reach the database at all.
  if (!parsedSlug.success) return { product: null, error: false } as const;
  return getProductBySlug(parsedSlug.data);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { product, error } = await loadProduct(slug);

  if (error) {
    return { title: "Temporarily Unavailable" };
  }

  if (!product) {
    return { title: "Product Not Found" };
  }

  // product.metaTitle (when present) is a database-managed field intended
  // as the COMPLETE title — using the root layout's template on it would
  // double-brand it ("Product Name | Crazycraft | Crazycraft" if the
  // stored value already includes the brand, or an unwanted suffix if it
  // doesn't). `{ absolute }` bypasses the template entirely for that
  // case. The name-only fallback is deliberately template-compatible
  // (unbranded) instead, letting the root template append "| Crazycraft"
  // exactly once.
  const title = product.metaTitle ? { absolute: product.metaTitle } : product.name;
  // Open Graph's own title field is never subject to the root template
  // at all (Next.js only templates the page <title>), so it needs its
  // own complete, standalone string regardless of which branch above was
  // used.
  const ogTitle = product.metaTitle || `${product.name} | Crazycraft`;
  const description =
    product.metaDescription ||
    product.shortDescription ||
    `${product.name} — export-ready, MOQ ${product.moq}, available for bulk and private-label orders from Crazycraft.`;
  const canonical = `${clientEnv.NEXT_PUBLIC_SITE_URL}/products/${product.slug}`;
  const primaryImage = product.images.find((i) => i.isPrimary) ?? product.images[0];

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title: ogTitle,
      description,
      url: canonical,
      images: primaryImage ? [{ url: primaryImage.url, alt: primaryImage.altText }] : undefined,
    },
  };
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { product, error } = await loadProduct(slug);

  if (error) return <OperationalError />;
  if (!product) notFound();

  const relatedResult = await getRelatedProducts({
    categoryId: product.categoryId,
    excludeProductId: product.id,
    limit: 4,
  });

  const primaryImage = product.images.find((i) => i.isPrimary) ?? product.images[0];
  const requestQuoteHref = `/contact?product=${encodeURIComponent(product.slug)}` as Route;

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: clientEnv.NEXT_PUBLIC_SITE_URL },
      { "@type": "ListItem", position: 2, name: "Products", item: `${clientEnv.NEXT_PUBLIC_SITE_URL}/products` },
      ...(product.categoryName && product.categorySlug
        ? [
            {
              "@type": "ListItem",
              position: 3,
              name: product.categoryName,
              item: `${clientEnv.NEXT_PUBLIC_SITE_URL}/categories/${product.categorySlug}`,
            },
          ]
        : []),
      {
        "@type": "ListItem",
        position: product.categoryName ? 4 : 3,
        name: product.name,
        item: `${clientEnv.NEXT_PUBLIC_SITE_URL}/products/${product.slug}`,
      },
    ],
  };

  // No Offer — deliberately. There is no genuine public price for this
  // product (B2B pricing is MOQ/negotiation-based), and including an
  // Offer schema with a fabricated or omitted price would be misleading
  // structured data.
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.shortDescription || product.description || undefined,
    image: product.images.map((i) => i.url),
    category: product.categoryName || undefined,
    material: product.baseMaterial || undefined,
  };

  return (
    <Container className="py-12">
      {/* eslint-disable-next-line react/no-danger -- safeJsonLd() escapes characters that could break out of this script tag; this DOES contain database-managed category/product names, not static content */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }} />
      {/* eslint-disable-next-line react/no-danger -- safeJsonLd() escapes characters that could break out of this script tag; this DOES contain database-managed product name/description/material, not static content */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(productJsonLd) }} />

      <nav aria-label="Breadcrumb" className="font-body text-sm text-ink-muted">
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link href={"/" as Route} className="hover:text-brand-700">
              Home
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href={"/products" as Route} className="hover:text-brand-700">
              Products
            </Link>
          </li>
          {product.categoryName && product.categorySlug && (
            <>
              <li aria-hidden="true">/</li>
              <li>
                <Link href={`/categories/${product.categorySlug}` as Route} className="hover:text-brand-700">
                  {product.categoryName}
                </Link>
              </li>
            </>
          )}
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-ink">
            {product.name}
          </li>
        </ol>
      </nav>

      {product.relatedDataError && (
        <p className="mt-4 rounded-md border border-clay/40 bg-clay/5 p-3 font-body text-sm text-clay">
          Some product details (images, variants, or collections) could not be loaded right now.
          Core product information below is still accurate.
        </p>
      )}

      <div className="mt-6 grid grid-cols-1 gap-10 lg:grid-cols-2">
        <div>
          <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-paper-muted">
            {primaryImage ? (
              <Image
                src={primaryImage.url}
                alt={primaryImage.altText}
                fill
                priority
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="object-cover"
              />
            ) : (
              <div
                aria-hidden="true"
                className="flex h-full w-full items-center justify-center font-body text-sm text-ink-muted"
              >
                Image coming soon
              </div>
            )}
          </div>
          {product.images.length > 1 && (
            <ul className="mt-3 grid grid-cols-5 gap-2">
              {product.images.map((image) => (
                <li key={image.url} className="relative aspect-square overflow-hidden rounded-md bg-paper-muted">
                  <Image src={image.url} alt={image.altText} fill sizes="20vw" className="object-cover" />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          {product.categoryName && (
            <span className="font-body text-xs uppercase tracking-wide text-ink-muted">
              {product.categoryName}
            </span>
          )}
          <h1 className="mt-1 font-display text-3xl text-brand-900 md:text-4xl">{product.name}</h1>

          {product.shortDescription && (
            <p className="mt-3 font-body text-ink-muted">{product.shortDescription}</p>
          )}

          <dl className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 border-y border-paper-muted py-6 font-mono text-sm">
            <SpecField label="MOQ" value={String(product.moq)} />
           <SpecField
  label="Lead time"
  value="Depends on order quantity, design complexity, and customization requirements."
/>
            {product.baseMaterial && <SpecField label="Material" value={product.baseMaterial} />}
            {product.dimensions && <SpecField label="Dimensions" value={product.dimensions} />}
            {product.weightGrams !== null && (
              <SpecField label="Weight" value={`${product.weightGrams} g`} />
            )}
            {product.hsCode && <SpecField label="HS Code" value={product.hsCode} />}
          </dl>

          {product.isCustomizable && (
            <div className="mt-4 rounded-md bg-accent/10 p-4">
              <p className="font-body text-sm font-medium text-accent-dark">Customization available</p>
              {product.customizationNotes && (
                <p className="mt-1 font-body text-sm text-ink-muted">{product.customizationNotes}</p>
              )}
            </div>
          )}

          {product.variants.length > 0 && (
            <div className="mt-6">
              <h2 className="font-display text-lg text-brand-900">Available variants</h2>
              <ul className="mt-2 flex flex-wrap gap-2">
                {product.variants.map((variant) => (
                  <li
                    key={variant.id}
                    className="rounded-full border border-paper-muted px-3 py-1 font-body text-sm text-ink"
                  >
                    {variant.variantName}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {product.collections.length > 0 && (
            <div className="mt-6">
              <h2 className="font-display text-lg text-brand-900">Part of</h2>
              <ul className="mt-2 flex flex-wrap gap-2">
                {product.collections.map((collection) => (
                  <li key={collection.slug}>
                    <Link
                      href={`/collections/${collection.slug}` as Route}
                      className="rounded-full border border-brand-700 px-3 py-1 font-body text-sm text-brand-700 hover:bg-brand-50"
                    >
                      {collection.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-8">
            <Button asChild>
              <Link href={requestQuoteHref}>Request a Quote</Link>
            </Button>
            <p className="mt-2 font-body text-xs text-ink-muted">
              Pricing is quoted per order based on MOQ, customization, and destination — no fixed
              retail price is published for export orders.
            </p>
          </div>
        </div>
      </div>

      {product.description && (
        <div className="mt-12 max-w-3xl border-t border-paper-muted pt-8">
          <h2 className="font-display text-xl text-brand-900">Product details</h2>
          <p className="mt-3 whitespace-pre-line font-body text-ink-muted">{product.description}</p>
        </div>
      )}

      <div className="mt-12 max-w-3xl rounded-lg border border-paper-muted bg-paper-muted/40 p-6">
        <h2 className="font-display text-lg text-brand-900">Export & ordering guidance</h2>
        <p className="mt-2 font-body text-sm text-ink-muted">
          Submit a quote request with your target quantity and destination — our team will confirm
          specifications, sampling options, and packing/documentation requirements before production.
          Sample and full-order timelines depend on customization and current production capacity.
        </p>
      </div>

      {(relatedResult.products.length > 0 || relatedResult.error) && (
        <div className="mt-16">
          <h2 className="font-display text-2xl text-brand-900">Related products</h2>
          <div className="mt-4">
            <ProductGrid products={relatedResult.products} error={relatedResult.error} emptyMessage="" />
          </div>
        </div>
      )}
    </Container>
  );
}

function SpecField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-body text-xs uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="mt-1 font-body text-sm font-medium leading-6 text-brand-900">
  {value}
</dd>
    </div>
  );
}
