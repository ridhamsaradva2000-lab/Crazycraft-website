import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Container } from "@/components/ui/Container";
import { ProductGrid } from "@/components/catalog/ProductGrid";
import { Pagination } from "@/components/catalog/Pagination";
import { getCategoryBySlug, getProducts, PAGE_SIZE } from "@/lib/catalog/data";
import { catalogSlugSchema } from "@/lib/catalog/validations";
import { clientEnv } from "@/lib/env.client";

const pageParamSchema = z.coerce.number().int().min(1).max(1000).optional().default(1);

function OperationalError() {
  return (
    <Container className="py-16">
      <p className="font-body text-sm text-clay">
        Something went wrong loading this category. Please try again.
      </p>
    </Container>
  );
}

async function loadCategory(slug: string) {
  const parsedSlug = catalogSlugSchema.safeParse(slug);
  if (!parsedSlug.success) return { category: null, error: false } as const;
  return getCategoryBySlug(parsedSlug.data);
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { category, error } = await loadCategory(slug);

  if (error) return { title: "Temporarily Unavailable" };
  if (!category) return { title: "Category Not Found" };

  const title = `${category.name} Export Catalogue`;
  const description =
    category.description ||
    `Browse ${category.name} available for bulk export orders — MOQ, lead time, and customization details on request.`;

  const rawSearchParams = await searchParams;
  const parsedPage = pageParamSchema.safeParse(rawSearchParams.page);
  const page = parsedPage.success ? parsedPage.data : 1;
  const canonical = `${clientEnv.NEXT_PUBLIC_SITE_URL}/categories/${category.slug}${page > 1 ? `?page=${page}` : ""}`;

  return {
    title,
    description,
    alternates: { canonical },
  };
}

export default async function CategoryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { slug } = await params;
  const { category, error } = await loadCategory(slug);

  if (error) return <OperationalError />;
  if (!category) notFound();

  const rawSearchParams = await searchParams;
  const parsedPage = pageParamSchema.safeParse(rawSearchParams.page);
  const page = parsedPage.success ? parsedPage.data : 1;

  const result = await getProducts({ categorySlug: category.slug, page });
  const totalPages = Math.max(1, Math.ceil(result.totalCount / PAGE_SIZE));

  return (
    <Container className="py-16">
      <h1 className="font-display text-3xl text-brand-900 md:text-4xl">{category.name}</h1>
      {category.description && (
        <p className="mt-2 max-w-2xl font-body text-ink-muted">{category.description}</p>
      )}

      <div className="mt-8">
        <ProductGrid
          products={result.products}
          error={result.error}
          emptyMessage="No published products in this category yet — check back soon."
        />
      </div>

      {!result.error && (
        <Pagination currentPage={page} totalPages={totalPages} basePath={`/categories/${category.slug}`} searchParams={{}} />
      )}
    </Container>
  );
}
