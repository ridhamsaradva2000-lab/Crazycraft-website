import "server-only";
import { createClient } from "@/lib/supabase/server";

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