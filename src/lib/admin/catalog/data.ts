import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

/**
 * Module 8 Stage 5: admin-facing category row shape for the Main +
 * Subcategory tree UI. Deliberately separate from the public catalog's
 * category type -- this includes parent_id and is_active, neither of
 * which the public getPublishedCategories() exposes or needs.
 */
export interface AdminCategoryRow {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  isActive: boolean;
}

export interface GetAdminCategoriesResult {
  error: string | null;
  categories: AdminCategoryRow[];
}
export type AdminProductStatus = Database["public"]["Enums"]["product_status"];
export interface AdminProductVariantRow {
  id: string;
  variantName: string;
  sku: string | null;
  priceNote: string | null;
}

export interface AdminProductImageRow {
  id: string;
  url: string;
  altText: string;
  sortOrder: number;
  isPrimary: boolean;
  createdAt: string;
}
export interface AdminProductRow {
  id: string;
  name: string;
  slug: string;
  status: AdminProductStatus;
  categoryId: string | null;
  categoryName: string | null;
  moq: number;
  leadTimeDays: number | null;
  isCustomizable: boolean;
  description: string | null;
  shortDescription: string | null;
  baseMaterial: string | null;
  dimensions: string | null;
  weightGrams: number | null;
  hsCode: string | null;
  customizationNotes: string | null;
  metaTitle: string | null;
  variants: AdminProductVariantRow[];
  images: AdminProductImageRow[];
  collectionIds: string[];
  metaDescription: string | null;
}

export interface GetAdminProductsResult {
  error: string | null;
  products: AdminProductRow[];
}

/**
 * Reads ALL products visible to admin RLS (draft, published, archived)
 * for the Admin Products screen, using the ordinary cookie-scoped
 * Supabase server client only -- no service-role, no RPC, no write.
 * Deliberately does NOT apply the public catalog's published-only /
 * active-category visibility filter; admins must see every product
 * regardless of status or category state, including products with
 * category_id = null.
 *
 * Category names are resolved via a simple, explicit second query
 * against unique non-null category IDs found in the product results,
 * rather than a nested-relation select, to keep the read/typing shape
 * simple and predictable. If no product has a category, the second
 * query is skipped entirely.
 *
 * On a database error, returns an explicit error state rather than an
 * empty list -- callers must not treat products: [] as "there are no
 * products" without first checking error.
 */
export async function getAdminProducts(): Promise<GetAdminProductsResult> {
  const supabase = await createClient();

  const { data: productRows, error: productsError } = await supabase
    .from("products")
    .select("id, name, slug, description, short_description, status, category_id, moq, lead_time_days, base_material, dimensions, weight_grams, hs_code, is_customizable, customization_notes, meta_title, meta_description")
    .order("name", { ascending: true });

  if (productsError) {
    console.error("[admin/catalog/data] getAdminProducts failed", {
      code: productsError.code ?? "unknown",
    });
    return {
      error: "Something went wrong loading products. Please try again.",
      products: [],
    };
  }

  const rows = productRows ?? [];

  const uniqueCategoryIds = Array.from(
    new Set(
      rows
        .map((row) => row.category_id)
        .filter((categoryId): categoryId is string => categoryId !== null)
    )
  );

  const categoryNameById = new Map<string, string>();

  if (uniqueCategoryIds.length > 0) {
    const { data: categoryRows, error: categoriesError } = await supabase
      .from("categories")
      .select("id, name")
      .in("id", uniqueCategoryIds);

    if (categoriesError) {
      console.error("[admin/catalog/data] getAdminProducts category lookup failed", {
        code: categoriesError.code ?? "unknown",
      });
      return {
        error: "Something went wrong loading products. Please try again.",
        products: [],
      };
    }

    for (const categoryRow of categoryRows ?? []) {
      categoryNameById.set(categoryRow.id, categoryRow.name);
    }
  }

  const productIds = rows.map((row) => row.id);

  const variantsByProductId = new Map<string, AdminProductVariantRow[]>();
  const collectionIdsByProductId = new Map<string, string[]>();

  if (productIds.length > 0) {
    const { data: variantRows, error: variantsError } = await supabase
      .from("product_variants")
      .select("id, product_id, variant_name, sku, price_note")
      .in("product_id", productIds)
      .order("product_id", { ascending: true })
      .order("variant_name", { ascending: true })
      .order("id", { ascending: true });

    if (variantsError) {
      console.error("[admin/catalog/data] getAdminProducts variant lookup failed", {
        code: variantsError.code ?? "unknown",
      });
      return {
        error: "Something went wrong loading products. Please try again.",
        products: [],
      };
    }

    for (const variantRow of variantRows ?? []) {
      const existing = variantsByProductId.get(variantRow.product_id) ?? [];
      existing.push({
        id: variantRow.id,
        variantName: variantRow.variant_name,
        sku: variantRow.sku,
        priceNote: variantRow.price_note,
      });
      variantsByProductId.set(variantRow.product_id, existing);
    }

    const { data: assignmentRows, error: assignmentsError } = await supabase
      .from("product_collections")
      .select("product_id, collection_id")
      .in("product_id", productIds);

    if (assignmentsError) {
      console.error("[admin/catalog/data] getAdminProducts collection assignment lookup failed", {
        code: assignmentsError.code ?? "unknown",
      });
      return {
        error: "Something went wrong loading products. Please try again.",
        products: [],
      };
    }

    for (const assignmentRow of assignmentRows ?? []) {
      const existing = collectionIdsByProductId.get(assignmentRow.product_id) ?? [];
      existing.push(assignmentRow.collection_id);
      collectionIdsByProductId.set(assignmentRow.product_id, existing);
    }
  }
  const imagesByProductId = new Map<string, AdminProductImageRow[]>();

  if (productIds.length > 0) {
    const { data: imageRows, error: imagesError } = await supabase
      .from("product_images")
      .select("id, product_id, url, alt_text, sort_order, is_primary, created_at")
      .in("product_id", productIds)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });

    if (imagesError) {
      console.error("[admin/catalog/data] getAdminProducts image lookup failed", {
        code: imagesError.code ?? "unknown",
      });
      return {
        error: "Something went wrong loading products. Please try again.",
        products: [],
      };
    }

    for (const imageRow of imageRows ?? []) {
      const existing = imagesByProductId.get(imageRow.product_id) ?? [];
      existing.push({
        id: imageRow.id,
        url: imageRow.url,
        altText: imageRow.alt_text,
        sortOrder: imageRow.sort_order,
        isPrimary: imageRow.is_primary,
        createdAt: imageRow.created_at,
      });
      imagesByProductId.set(imageRow.product_id, existing);
    }
  }
  return {
    error: null,
    products: rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      status: row.status,
      categoryId: row.category_id,
      categoryName: row.category_id ? (categoryNameById.get(row.category_id) ?? null) : null,
      moq: row.moq,
      leadTimeDays: row.lead_time_days,
      isCustomizable: row.is_customizable,
      description: row.description,
      shortDescription: row.short_description,
      baseMaterial: row.base_material,
      dimensions: row.dimensions,
      weightGrams: row.weight_grams,
      hsCode: row.hs_code,
      customizationNotes: row.customization_notes,
      metaTitle: row.meta_title,
      metaDescription: row.meta_description,
      variants: variantsByProductId.get(row.id) ?? [],
      collectionIds: collectionIdsByProductId.get(row.id) ?? [],
      images: imagesByProductId.get(row.id) ?? [],
    })),
  };
}

/**
 * Reads categories for the Admin Categories screen using the ordinary
 * cookie-scoped Supabase server client only -- no service-role, no RPC.
 * Access relies entirely on the existing categories RLS policies.
 * Stage 5 runtime QA will explicitly verify that an authenticated admin
 * session continues to receive inactive categories as required by this
 * UI.
 *
 * Ordering: parent_id ascending with NULLS FIRST (grouping all Main
 * Categories together ahead of any Subcategory), then name ascending.
 * This gives a stable, predictable ordering for the caller; grouping
 * each Subcategory under its specific Main Category is left to the
 * Stage 5 UI/component layer, not this data-read function.
 *
 * On a database error, returns an explicit error state rather than an
 * empty list -- callers must not treat categories: [] as "there are no
 * categories" without first checking error.
 */
export async function getAdminCategories(): Promise<GetAdminCategoriesResult> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("categories")
    .select("id, name, slug, parent_id, is_active")
    .order("parent_id", { ascending: true, nullsFirst: true })
    .order("name", { ascending: true });

  if (error) {
    console.error("[admin/catalog/data] getAdminCategories failed", {
      code: error.code ?? "unknown",
    });
    return {
      error: "Something went wrong loading categories. Please try again.",
      categories: [],
    };
  }

  return {
    error: null,
    categories: (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      parentId: row.parent_id,
      isActive: row.is_active,
    })),
  };
}

export interface AdminCollectionOption {
  id: string;
  name: string;
}

export interface GetAdminCollectionsResult {
  error: string | null;
  collections: AdminCollectionOption[];
}

/**
 * Reads all existing Collections for admin assignment UI, using the
 * ordinary cookie-scoped Supabase server client only -- no service-role,
 * no RPC, no write. Collection CRUD is explicitly out of scope; this
 * only reads existing Collections so Products can be assigned to them.
 */
export async function getAdminCollections(): Promise<GetAdminCollectionsResult> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("collections")
    .select("id, name")
    .order("name", { ascending: true });

  if (error) {
    console.error("[admin/catalog/data] getAdminCollections failed", {
      code: error.code ?? "unknown",
    });
    return {
      error: "Something went wrong loading collections. Please try again.",
      collections: [],
    };
  }

  return {
    error: null,
    collections: (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
    })),
  };
}