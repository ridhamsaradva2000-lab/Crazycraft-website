"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAdminProfile } from "@/lib/auth/session";
import {
  createCategorySchema,
  updateCategorySchema,
  setCategoryActiveSchema,
  deleteCategorySchema,
  type CreateCategoryActionInput,
  type UpdateCategoryActionInput,
  type SetCategoryActiveActionInput,
  type DeleteCategoryActionInput,
} from "@/lib/catalog/validations";

export interface CategoryActionResult {
  error: string | null;
  success?: boolean;
  categoryId?: string;
}

const INVALID_INPUT_ERROR = "Please check the form and try again.";
const NOT_ADMIN_ERROR = "You must be signed in as an admin to do this.";
const NOT_FOUND_ERROR = "Category not found.";
const DUPLICATE_SLUG_ERROR = "That slug is already in use by another category.";
const PARENT_NOT_FOUND_ERROR = "The selected parent category does not exist.";
const PARENT_IS_SUBCATEGORY_ERROR =
  "A subcategory cannot be nested under another subcategory.";
const SELF_PARENT_ERROR = "A category cannot be its own parent.";
const HAS_CHILDREN_CANNOT_MOVE_ERROR =
  "This category already has its own subcategories and cannot be moved under another category.";
const HAS_SUBCATEGORIES_ERROR =
  "This category still has subcategories. Move or delete them first.";
const HAS_PRODUCTS_ERROR =
  "This category still has products assigned. Reassign or remove them first.";
const GENERIC_SAVE_ERROR =
  "Something went wrong saving this category. Please try again.";
const GENERIC_UPDATE_ERROR =
  "Something went wrong updating this category. Please try again.";
const GENERIC_DELETE_CONFLICT_ERROR =
  "This category cannot be deleted right now. Please try again.";
const GENERIC_CHECK_FAILED_ERROR =
  "Something went wrong. Please try again.";

function logCategoryActionError(
  operation: string,
  error: { code?: string } | null | undefined
) {
  console.error(`[catalog/actions] ${operation} failed`, {
    code: error?.code ?? "unknown",
  });
}

function revalidateCatalogPaths() {
  revalidatePath("/");
  revalidatePath("/products");
  revalidatePath("/categories/[slug]", "page");
  revalidatePath("/products/[slug]", "page");
  revalidatePath("/collections/[slug]", "page");
  revalidatePath("/contact");
  revalidatePath("/admin/catalog/categories");
}

export async function createCategoryAction(
  input: CreateCategoryActionInput
): Promise<CategoryActionResult> {
  const parsed = createCategorySchema.safeParse(input);
  if (!parsed.success) {
    return { error: INVALID_INPUT_ERROR };
  }

  const { name, slug, parentId, isActive } = parsed.data;

  const adminProfile = await getAdminProfile();
  if (!adminProfile) {
    return { error: NOT_ADMIN_ERROR };
  }

  const supabase = await createClient();

  if (parentId !== null) {
    const { data: parent, error: parentLookupError } = await supabase
      .from("categories")
      .select("id, parent_id")
      .eq("id", parentId)
      .maybeSingle();

    if (parentLookupError) {
      logCategoryActionError(
        "createCategoryAction.parentLookup",
        parentLookupError
      );
      return { error: GENERIC_SAVE_ERROR };
    }

    if (!parent) {
      return { error: PARENT_NOT_FOUND_ERROR };
    }

    if (parent.parent_id !== null) {
      return { error: PARENT_IS_SUBCATEGORY_ERROR };
    }
  }

  const { data: inserted, error: insertError } = await supabase
    .from("categories")
    .insert({
      name,
      slug,
      parent_id: parentId,
      is_active: isActive,
    })
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      return { error: DUPLICATE_SLUG_ERROR };
    }

    logCategoryActionError("createCategoryAction.insert", insertError);
    return { error: GENERIC_SAVE_ERROR };
  }

  if (!inserted) {
    logCategoryActionError("createCategoryAction.insert", {
      code: "no_row_returned",
    });
    return { error: GENERIC_SAVE_ERROR };
  }

  revalidateCatalogPaths();

  return {
    error: null,
    success: true,
    categoryId: inserted.id,
  };
}

export async function updateCategoryAction(
  input: UpdateCategoryActionInput
): Promise<CategoryActionResult> {
  const parsed = updateCategorySchema.safeParse(input);
  if (!parsed.success) {
    return { error: INVALID_INPUT_ERROR };
  }

  const { categoryId, name, slug, parentId } = parsed.data;

  const adminProfile = await getAdminProfile();
  if (!adminProfile) {
    return { error: NOT_ADMIN_ERROR };
  }

  const supabase = await createClient();

  if (parentId !== null) {
    if (parentId === categoryId) {
      return { error: SELF_PARENT_ERROR };
    }

    const { data: parent, error: parentLookupError } = await supabase
      .from("categories")
      .select("id, parent_id")
      .eq("id", parentId)
      .maybeSingle();

    if (parentLookupError) {
      logCategoryActionError(
        "updateCategoryAction.parentLookup",
        parentLookupError
      );
      return { error: GENERIC_SAVE_ERROR };
    }

    if (!parent) {
      return { error: PARENT_NOT_FOUND_ERROR };
    }

    if (parent.parent_id !== null) {
      return { error: PARENT_IS_SUBCATEGORY_ERROR };
    }

    const { count: childCount, error: childCountError } = await supabase
      .from("categories")
      .select("id", { count: "exact", head: true })
      .eq("parent_id", categoryId);

    if (childCountError) {
      logCategoryActionError(
        "updateCategoryAction.childCount",
        childCountError
      );
      return { error: GENERIC_SAVE_ERROR };
    }

    if ((childCount ?? 0) > 0) {
      return { error: HAS_CHILDREN_CANNOT_MOVE_ERROR };
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from("categories")
    .update({
      name,
      slug,
      parent_id: parentId,
    })
    .eq("id", categoryId)
    .select("id")
    .maybeSingle();

  if (updateError) {
    if (updateError.code === "23505") {
      return { error: DUPLICATE_SLUG_ERROR };
    }

    logCategoryActionError("updateCategoryAction.update", updateError);
    return { error: GENERIC_SAVE_ERROR };
  }

  if (!updated) {
    return { error: NOT_FOUND_ERROR };
  }

  revalidateCatalogPaths();

  return {
    error: null,
    success: true,
    categoryId: updated.id,
  };
}

export async function setCategoryActiveAction(
  input: SetCategoryActiveActionInput
): Promise<CategoryActionResult> {
  const parsed = setCategoryActiveSchema.safeParse(input);
  if (!parsed.success) {
    return { error: INVALID_INPUT_ERROR };
  }

  const { categoryId, isActive } = parsed.data;

  const adminProfile = await getAdminProfile();
  if (!adminProfile) {
    return { error: NOT_ADMIN_ERROR };
  }

  const supabase = await createClient();

  const { data: updated, error: updateError } = await supabase
    .from("categories")
    .update({
      is_active: isActive,
    })
    .eq("id", categoryId)
    .select("id")
    .maybeSingle();

  if (updateError) {
    logCategoryActionError(
      "setCategoryActiveAction.update",
      updateError
    );
    return { error: GENERIC_UPDATE_ERROR };
  }

  if (!updated) {
    return { error: NOT_FOUND_ERROR };
  }

  revalidateCatalogPaths();

  return {
    error: null,
    success: true,
    categoryId: updated.id,
  };
}

export async function deleteCategoryAction(
  input: DeleteCategoryActionInput
): Promise<CategoryActionResult> {
  const parsed = deleteCategorySchema.safeParse(input);
  if (!parsed.success) {
    return { error: INVALID_INPUT_ERROR };
  }

  const { categoryId } = parsed.data;

  const adminProfile = await getAdminProfile();
  if (!adminProfile) {
    return { error: NOT_ADMIN_ERROR };
  }

  const supabase = await createClient();

  const { count: childCount, error: childCountError } = await supabase
    .from("categories")
    .select("id", { count: "exact", head: true })
    .eq("parent_id", categoryId);

  if (childCountError) {
    logCategoryActionError(
      "deleteCategoryAction.childCountPreCheck",
      childCountError
    );
    return { error: GENERIC_CHECK_FAILED_ERROR };
  }

  const { count: productCount, error: productCountError } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("category_id", categoryId);

  if (productCountError) {
    logCategoryActionError(
      "deleteCategoryAction.productCountPreCheck",
      productCountError
    );
    return { error: GENERIC_CHECK_FAILED_ERROR };
  }

  if ((childCount ?? 0) > 0) {
    return { error: HAS_SUBCATEGORIES_ERROR };
  }

  if ((productCount ?? 0) > 0) {
    return { error: HAS_PRODUCTS_ERROR };
  }

  const { data: deleted, error: deleteError } = await supabase
    .from("categories")
    .delete()
    .eq("id", categoryId)
    .select("id")
    .maybeSingle();

  if (deleteError) {
    if (deleteError.code === "23503") {
      const {
        count: childRecheck,
        error: childRecheckError,
      } = await supabase
        .from("categories")
        .select("id", { count: "exact", head: true })
        .eq("parent_id", categoryId);

      if (childRecheckError) {
        logCategoryActionError(
          "deleteCategoryAction.childRecheck",
          childRecheckError
        );
        return { error: GENERIC_DELETE_CONFLICT_ERROR };
      }

      const {
        count: productRecheck,
        error: productRecheckError,
      } = await supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("category_id", categoryId);

      if (productRecheckError) {
        logCategoryActionError(
          "deleteCategoryAction.productRecheck",
          productRecheckError
        );
        return { error: GENERIC_DELETE_CONFLICT_ERROR };
      }

      if ((childRecheck ?? 0) > 0) {
        return { error: HAS_SUBCATEGORIES_ERROR };
      }

      if ((productRecheck ?? 0) > 0) {
        return { error: HAS_PRODUCTS_ERROR };
      }

      return { error: GENERIC_DELETE_CONFLICT_ERROR };
    }

    logCategoryActionError(
      "deleteCategoryAction.delete",
      deleteError
    );
    return { error: GENERIC_DELETE_CONFLICT_ERROR };
  }

  if (!deleted) {
    return { error: NOT_FOUND_ERROR };
  }

  revalidateCatalogPaths();

  return {
    error: null,
    success: true,
    categoryId: deleted.id,
  };
}
