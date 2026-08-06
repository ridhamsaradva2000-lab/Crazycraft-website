import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { ProductGrid } from "@/components/catalog/ProductGrid";
import { ProductFilters } from "@/components/catalog/ProductFilters";
import { Pagination } from "@/components/catalog/Pagination";
import { getProducts, getPublishedCategories, getPublishedCollections, PAGE_SIZE } from "@/lib/catalog/data";
import { productsQuerySchema } from "@/lib/catalog/validations";
import { clientEnv } from "@/lib/env.client";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<Metadata> {
  const params = await searchParams;
  const parsed = productsQuerySchema.safeParse(params);
  const canonicalParams = new URLSearchParams();
  if (parsed.success) {
    if (parsed.data.q) canonicalParams.set("q", parsed.data.q);
    if (parsed.data.category) canonicalParams.set("category", parsed.data.category);
    if (parsed.data.collection) canonicalParams.set("collection", parsed.data.collection);
    if (parsed.data.page > 1) canonicalParams.set("page", String(parsed.data.page));
  }
  const query = canonicalParams.toString();
  const canonical = `${clientEnv.NEXT_PUBLIC_SITE_URL}/products${query ? `?${query}` : ""}`;

  return {
    title: "Handicraft Products for Export",
    description:
      "Browse Crazycraft's B2B handicraft export catalogue — Blue Pottery, wooden handicrafts, tote bags, bedding sets, and home decor, available for bulk and private-label orders.",
    alternates: { canonical },
  };
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const rawParams = await searchParams;
  const parsed = productsQuerySchema.safeParse(rawParams);

  const [categoriesResult, collectionsResult] = await Promise.all([
    getPublishedCategories(),
    getPublishedCollections(),
  ]);

  if (!parsed.success) {
    return (
      <Container className="py-16">
        <h1 className="font-display text-3xl text-brand-900 md:text-4xl">Products</h1>
        <div className="mt-6">
          <ProductFilters
            categories={categoriesResult.categories}
            categoriesError={categoriesResult.error}
            collections={collectionsResult.collections}
            collectionsError={collectionsResult.error}
            currentQuery={typeof rawParams.q === "string" ? rawParams.q : undefined}
            currentCategory={typeof rawParams.category === "string" ? rawParams.category : undefined}
            currentCollection={typeof rawParams.collection === "string" ? rawParams.collection : undefined}
          />
        </div>
        <p className="mt-8 rounded-lg border border-clay/40 bg-clay/5 p-6 font-body text-sm text-clay">
          {parsed.error.issues[0]?.message ?? "Invalid search parameters."} Please adjust your search or{" "}
          <Link href="/products" className="underline">
            clear filters
          </Link>
          .
        </p>
      </Container>
    );
  }

  const { q, category, collection, page } = parsed.data;

  const result = await getProducts({
    search: q,
    categorySlug: category,
    collectionSlug: collection,
    page,
  });

  const totalPages = Math.max(1, Math.ceil(result.totalCount / PAGE_SIZE));

  return (
    <Container className="py-16">
      <h1 className="font-display text-3xl text-brand-900 md:text-4xl">Products</h1>
      <p className="mt-2 max-w-2xl font-body text-ink-muted">
        Export-ready handicrafts for importers, wholesalers, retail chains, and hospitality buyers —
        request a quote for MOQ, lead time, and customization on any item.
      </p>

      <div className="mt-6">
        <ProductFilters
          categories={categoriesResult.categories}
          categoriesError={categoriesResult.error}
          collections={collectionsResult.collections}
          collectionsError={collectionsResult.error}
          currentQuery={q}
          currentCategory={category}
          currentCollection={collection}
        />
      </div>

      <div className="mt-8">
        <ProductGrid products={result.products} error={result.error} />
      </div>

      {!result.error && (
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          basePath="/products"
          searchParams={{ q, category, collection }}
        />
      )}
    </Container>
  );
}
