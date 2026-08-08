import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Every public catalog read in this file uses the ordinary Supabase server
 * client; no service-role client is used.
 *
 * Module 8 Stage 3 makes RLS authoritative for catalog visibility:
 *   - categories must be effectively active, including parent visibility
 *   - products must be published and belong to an effectively active category
 *   - product_images, product_variants, and product_collections inherit the
 *     visible-product boundary through their products-based SELECT policies
 *
 * This file shapes queries, pagination, search, and response data only. It does
 * not duplicate the database visibility rules with application-side filters.
 */

export const PAGE_SIZE = 12;
const PRODUCT_LIST_COLUMNS =
  "id, slug, name, short_description, category_id, moq, lead_time_days, base_material, is_customizable, categories(name, slug)";
const PRODUCT_DETAIL_COLUMNS =
  "id, slug, name, description, short_description, category_id, moq, lead_time_days, base_material, dimensions, weight_grams, hs_code, is_customizable, customization_notes, meta_title, meta_description, categories(id, name, slug)";

export interface CategoryOption {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
}

export interface CategoryResult {
  categories: CategoryOption[];
  error: boolean;
}

export async function getPublishedCategories(): Promise<CategoryResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, slug, name, description, image_url")
    .order("name");

  if (error) {
    console.error("getPublishedCategories failed:", error.code);
    return { categories: [], error: true };
  }

  return {
    categories: (data ?? []).map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      description: c.description,
      imageUrl: c.image_url,
    })),
    error: false,
  };
}

export interface CategoryDetailResult {
  category: CategoryOption | null;
  error: boolean;
}

export async function getCategoryBySlug(slug: string): Promise<CategoryDetailResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, slug, name, description, image_url")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error("getCategoryBySlug failed:", error.code);
    return { category: null, error: true };
  }

  if (!data) return { category: null, error: false };

  return {
    category: {
      id: data.id,
      slug: data.slug,
      name: data.name,
      description: data.description,
      imageUrl: data.image_url,
    },
    error: false,
  };
}

export interface CollectionOption {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
}

export interface CollectionResult {
  collections: CollectionOption[];
  error: boolean;
}

export async function getPublishedCollections(): Promise<CollectionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("collections")
    .select("id, slug, name, description, image_url")
    .order("name");

  if (error) {
    console.error("getPublishedCollections failed:", error.code);
    return { collections: [], error: true };
  }

  return {
    collections: (data ?? []).map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      description: c.description,
      imageUrl: c.image_url,
    })),
    error: false,
  };
}

export interface CollectionDetailResult {
  collection: CollectionOption | null;
  error: boolean;
}

export async function getCollectionBySlug(slug: string): Promise<CollectionDetailResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("collections")
    .select("id, slug, name, description, image_url")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error("getCollectionBySlug failed:", error.code);
    return { collection: null, error: true };
  }

  if (!data) return { collection: null, error: false };

  return {
    collection: {
      id: data.id,
      slug: data.slug,
      name: data.name,
      description: data.description,
      imageUrl: data.image_url,
    },
    error: false,
  };
}

export interface ProductListItem {
  id: string;
  slug: string;
  name: string;
  shortDescription: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  moq: number;
  leadTimeDays: number | null;
  baseMaterial: string | null;
  isCustomizable: boolean;
  primaryImageUrl: string | null;
  primaryImageAlt: string | null;
}

export interface ProductListResult {
  products: ProductListItem[];
  totalCount: number;
  error: boolean;
}

/**
 * Search is deliberately a single bound `.ilike()` against `name` only —
 * not a raw `.or()` expression spanning multiple columns. PostgREST's
 * `.or()` takes a filter-grammar STRING the client parses (commas
 * separate conditions, periods separate column/operator/value), so
 * interpolating user input into one risks altering which filters
 * actually apply — the same class of issue fixed in Module 5's
 * search_samples(). A single `.ilike()` call has no such risk: the term
 * is a genuine bound parameter, never parsed as filter grammar. This
 * covers the common case (searching by product name) without a new
 * migration/RPC; broader multi-column search can be added later via a
 * dedicated, tested RPC if genuinely needed — see the README.
 */
export async function getProducts(params: {
  search?: string;
  categorySlug?: string;
  collectionSlug?: string;
  page: number;
}): Promise<ProductListResult> {
  const supabase = await createClient();

  let categoryId: string | null = null;
  if (params.categorySlug) {
    const { category, error } = await getCategoryBySlug(params.categorySlug);
    if (error) return { products: [], totalCount: 0, error: true };
    if (!category) return { products: [], totalCount: 0, error: false };
    categoryId = category.id;
  }

  let collectionId: string | null = null;
  if (params.collectionSlug) {
    const { collection, error } = await getCollectionBySlug(params.collectionSlug);
    if (error) return { products: [], totalCount: 0, error: true };
    if (!collection) return { products: [], totalCount: 0, error: false };
    collectionId = collection.id;
  }

  const from = (params.page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from("products")
    .select(
      collectionId ? `${PRODUCT_LIST_COLUMNS}, product_collections!inner(collection_id)` : PRODUCT_LIST_COLUMNS,
      { count: "exact" }
    )
    .eq("status", "published")
    .order("name", { ascending: true })
    .order("id", { ascending: true })
    .range(from, to);

  if (params.search) {
    query = query.ilike("name", `%${params.search}%`);
  }
  if (categoryId) {
    query = query.eq("category_id", categoryId);
  }
  if (collectionId) {
    query = query.eq("product_collections.collection_id", collectionId);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("getProducts failed:", error.code);
    return { products: [], totalCount: 0, error: true };
  }

 type ProductRow = {
  id: string;
  slug: string;
  name: string;
  short_description: string | null;
  moq: number;
  lead_time_days: number | null;
  base_material: string | null;
  is_customizable: boolean;
  categories:
    | { name: string; slug: string }
    | { name: string; slug: string }[]
    | null;
};

const productRows = (data ?? []) as unknown as ProductRow[];

const productIds = productRows.map((p) => p.id);
const { images: primaryImages, error: imagesError } =
  await getPrimaryImages(productIds);

return {
  products: productRows.map((p) => {
      const category = Array.isArray(p.categories) ? p.categories[0] : p.categories;
      const image = primaryImages.get(p.id);
      return {
        id: p.id,
        slug: p.slug,
        name: p.name,
        shortDescription: p.short_description,
        categoryName: category?.name ?? null,
        categorySlug: category?.slug ?? null,
        moq: p.moq,
        leadTimeDays: p.lead_time_days,
        baseMaterial: p.base_material,
        isCustomizable: p.is_customizable,
        primaryImageUrl: image?.url ?? null,
        primaryImageAlt: image?.alt_text ?? null,
      };
    }),
    totalCount: count ?? 0,
    error: imagesError,
  };
}

/**
 * Fetches one representative image per product (the one marked
 * is_primary, or the lowest sort_order if none is marked) — used for
 * list views. Fetches all images for the given products in one query
 * (never N+1) and picks the right one per product in application code.
 *
 * Returns an explicit error flag rather than silently collapsing a
 * genuine database failure into an empty Map — a caller must be able to
 * tell "these products genuinely have no image yet" apart from "the
 * image lookup itself failed," since displaying the former as a plain
 * placeholder is fine, but silently doing the same for the latter would
 * hide a real operational problem behind a normal-looking empty state.
 */
async function getPrimaryImages(
  productIds: string[]
): Promise<{ images: Map<string, { url: string; alt_text: string }>; error: boolean }> {
  const images = new Map<string, { url: string; alt_text: string }>();
  if (productIds.length === 0) return { images, error: false };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_images")
    .select("product_id, url, alt_text, is_primary, sort_order")
    .in("product_id", productIds);

  if (error) {
    console.error("getPrimaryImages failed:", error.code);
    return { images, error: true };
  }

  type ImageRow = NonNullable<typeof data>[number];
  const byProduct = new Map<string, ImageRow[]>();
  for (const img of data ?? []) {
    const list = byProduct.get(img.product_id) ?? [];
    list.push(img);
    byProduct.set(img.product_id, list);
  }

  for (const [productId, productImages] of byProduct) {
    const sorted = [...productImages].sort((a, b) => {
      if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
      return a.sort_order - b.sort_order;
    });
    const chosen = sorted[0];
    if (chosen) images.set(productId, { url: chosen.url, alt_text: chosen.alt_text });
  }

  return { images, error: false };
}

export interface ProductImage {
  url: string;
  altText: string;
  isPrimary: boolean;
  sortOrder: number;
}

export interface ProductVariant {
  id: string;
  variantName: string;
}

export interface ProductDetail {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  shortDescription: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  moq: number;
  leadTimeDays: number | null;
  baseMaterial: string | null;
  dimensions: string | null;
  weightGrams: number | null;
  hsCode: string | null;
  isCustomizable: boolean;
  customizationNotes: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  images: ProductImage[];
  variants: ProductVariant[];
  collections: { slug: string; name: string }[];
  /**
   * True if the images, variants, or collections query failed
   * operationally — distinct from those genuinely being empty. The core
   * product record itself still loaded successfully in this case (that
   * failure is reported via ProductDetailResult.error instead, which
   * blocks rendering entirely), so the page can still render the
   * product with a visible notice about the affected section, rather
   * than either hiding the failure (treating it as "no images/variants/
   * collections exist") or discarding an otherwise-valid product page.
   */
  relatedDataError: boolean;
}

export interface ProductDetailResult {
  product: ProductDetail | null;
  error: boolean;
}

/**
 * Returns { product: null, error: false } when the slug is genuinely absent,
 * unpublished, or hidden because its category (or parent category) is not
 * effectively active. RLS deliberately makes those states indistinguishable
 * to a public caller, so the page can treat all of them as "not found."
 */
export async function getProductBySlug(slug: string): Promise<ProductDetailResult> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_DETAIL_COLUMNS)
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (error) {
    console.error("getProductBySlug failed:", error.code);
    return { product: null, error: true };
  }
  if (!data) return { product: null, error: false };

  const [imagesResult, variantsResult, collectionsResult] = await Promise.all([
    supabase
      .from("product_images")
      .select("url, alt_text, is_primary, sort_order")
      .eq("product_id", data.id)
      .order("sort_order", { ascending: true }),
    supabase.from("product_variants").select("id, variant_name").eq("product_id", data.id),
    supabase.from("product_collections").select("collections(slug, name)").eq("product_id", data.id),
  ]);

  if (imagesResult.error) console.error("getProductBySlug images failed:", imagesResult.error.code);
  if (variantsResult.error) console.error("getProductBySlug variants failed:", variantsResult.error.code);
  if (collectionsResult.error) console.error("getProductBySlug collections failed:", collectionsResult.error.code);

  const relatedDataError = Boolean(imagesResult.error || variantsResult.error || collectionsResult.error);

  const category = Array.isArray(data.categories) ? data.categories[0] : data.categories;

  return {
    product: {
      id: data.id,
      slug: data.slug,
      name: data.name,
      description: data.description,
      shortDescription: data.short_description,
      categoryId: category?.id ?? null,
      categoryName: category?.name ?? null,
      categorySlug: category?.slug ?? null,
      moq: data.moq,
      leadTimeDays: data.lead_time_days,
      baseMaterial: data.base_material,
      dimensions: data.dimensions,
      weightGrams: data.weight_grams,
      hsCode: data.hs_code,
      isCustomizable: data.is_customizable,
      customizationNotes: data.customization_notes,
      metaTitle: data.meta_title,
      metaDescription: data.meta_description,
      images: (imagesResult.data ?? []).map((i) => ({
        url: i.url,
        altText: i.alt_text,
        isPrimary: i.is_primary,
        sortOrder: i.sort_order,
      })),
      variants: (variantsResult.data ?? []).map((v) => ({ id: v.id, variantName: v.variant_name })),
      collections: (collectionsResult.data ?? [])
        .map((row) => (Array.isArray(row.collections) ? row.collections[0] : row.collections))
        .filter((c): c is { slug: string; name: string } => !!c),
      relatedDataError,
    },
    error: false,
  };
}

export interface RelatedProductsResult {
  products: ProductListItem[];
  error: boolean;
}

export async function getRelatedProducts(params: {
  categoryId: string | null;
  excludeProductId: string;
  limit?: number;
}): Promise<RelatedProductsResult> {
  if (!params.categoryId) return { products: [], error: false };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_LIST_COLUMNS)
    .eq("status", "published")
    .eq("category_id", params.categoryId)
    .neq("id", params.excludeProductId)
    .order("name", { ascending: true })
    .limit(params.limit ?? 4);

  if (error) {
    console.error("getRelatedProducts failed:", error.code);
    return { products: [], error: true };
  }

  const productIds = (data ?? []).map((p) => p.id);
  const { images: primaryImages, error: imagesError } = await getPrimaryImages(productIds);

  return {
    products: (data ?? []).map((p) => {
      const category = Array.isArray(p.categories) ? p.categories[0] : p.categories;
      const image = primaryImages.get(p.id);
      return {
        id: p.id,
        slug: p.slug,
        name: p.name,
        shortDescription: p.short_description,
        categoryName: category?.name ?? null,
        categorySlug: category?.slug ?? null,
        moq: p.moq,
        leadTimeDays: p.lead_time_days,
        baseMaterial: p.base_material,
        isCustomizable: p.is_customizable,
        primaryImageUrl: image?.url ?? null,
        primaryImageAlt: image?.alt_text ?? null,
      };
    }),
    error: imagesError,
  };
}

/** Homepage featured products — simply the most recent published products. */
export async function getFeaturedProducts(limit = 4): Promise<RelatedProductsResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_LIST_COLUMNS)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("getFeaturedProducts failed:", error.code);
    return { products: [], error: true };
  }

  const productIds = (data ?? []).map((p) => p.id);
  const { images: primaryImages, error: imagesError } = await getPrimaryImages(productIds);

  return {
    products: (data ?? []).map((p) => {
      const category = Array.isArray(p.categories) ? p.categories[0] : p.categories;
      const image = primaryImages.get(p.id);
      return {
        id: p.id,
        slug: p.slug,
        name: p.name,
        shortDescription: p.short_description,
        categoryName: category?.name ?? null,
        categorySlug: category?.slug ?? null,
        moq: p.moq,
        leadTimeDays: p.lead_time_days,
        baseMaterial: p.base_material,
        isCustomizable: p.is_customizable,
        primaryImageUrl: image?.url ?? null,
        primaryImageAlt: image?.alt_text ?? null,
      };
    }),
    error: imagesError,
  };
}
