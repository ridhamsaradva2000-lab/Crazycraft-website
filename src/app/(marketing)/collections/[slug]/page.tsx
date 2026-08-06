import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Container } from "@/components/ui/Container";
import { ProductGrid } from "@/components/catalog/ProductGrid";
import { Pagination } from "@/components/catalog/Pagination";
import { getCollectionBySlug, getProducts, PAGE_SIZE } from "@/lib/catalog/data";
import { catalogSlugSchema } from "@/lib/catalog/validations";
import { clientEnv } from "@/lib/env.client";

const pageParamSchema = z.coerce.number().int().min(1).max(1000).optional().default(1);

function OperationalError() {
  return (
    <Container className="py-16">
      <p className="font-body text-sm text-clay">
        Something went wrong loading this collection. Please try again.
      </p>
    </Container>
  );
}

async function loadCollection(slug: string) {
  const parsedSlug = catalogSlugSchema.safeParse(slug);
  if (!parsedSlug.success) return { collection: null, error: false } as const;
  return getCollectionBySlug(parsedSlug.data);
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { collection, error } = await loadCollection(slug);

  if (error) return { title: "Temporarily Unavailable" };
  if (!collection) return { title: "Collection Not Found" };

  const title = `${collection.name} Collection`;
  const description =
    collection.description ||
    `Explore the ${collection.name} collection — export-ready handicrafts available for bulk order.`;

  const rawSearchParams = await searchParams;
  const parsedPage = pageParamSchema.safeParse(rawSearchParams.page);
  const page = parsedPage.success ? parsedPage.data : 1;
  const canonical = `${clientEnv.NEXT_PUBLIC_SITE_URL}/collections/${collection.slug}${page > 1 ? `?page=${page}` : ""}`;

  return {
    title,
    description,
    alternates: { canonical },
  };
}

export default async function CollectionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { slug } = await params;
  const { collection, error } = await loadCollection(slug);

  if (error) return <OperationalError />;
  if (!collection) notFound();

  const rawSearchParams = await searchParams;
  const parsedPage = pageParamSchema.safeParse(rawSearchParams.page);
  const page = parsedPage.success ? parsedPage.data : 1;

  const result = await getProducts({ collectionSlug: collection.slug, page });
  const totalPages = Math.max(1, Math.ceil(result.totalCount / PAGE_SIZE));

  return (
    <Container className="py-16">
      <h1 className="font-display text-3xl text-brand-900 md:text-4xl">{collection.name}</h1>
      {collection.description && (
        <p className="mt-2 max-w-2xl font-body text-ink-muted">{collection.description}</p>
      )}

      <div className="mt-8">
        <ProductGrid
          products={result.products}
          error={result.error}
          emptyMessage="No published products in this collection yet — check back soon."
        />
      </div>

      {!result.error && (
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          basePath={`/collections/${collection.slug}`}
          searchParams={{}}
        />
      )}
    </Container>
  );
}
