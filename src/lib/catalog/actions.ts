"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
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
  createProductSchema,
  type CreateProductActionInput,
  updateProductSchema,
  type UpdateProductActionInput,
  createProductVariantSchema,
  type CreateProductVariantActionInput,
  updateProductVariantSchema,
  type UpdateProductVariantActionInput,
  deleteProductVariantSchema,
  type DeleteProductVariantActionInput,
  assignProductCollectionSchema,
  type AssignProductCollectionActionInput,
  unassignProductCollectionSchema,
  type UnassignProductCollectionActionInput,
  prepareProductImageUploadSchema,
  type PrepareProductImageUploadActionInput,
  finalizeProductImageUploadSchema,
  type FinalizeProductImageUploadActionInput,
  updateProductImageAltTextSchema,
  type UpdateProductImageAltTextActionInput,
  setProductImagePrimarySchema,
  type SetProductImagePrimaryActionInput,
  moveProductImageSchema,
  type MoveProductImageActionInput,
  removeProductImageSchema,
  type RemoveProductImageActionInput,
  deleteProductSchema,
  type DeleteProductActionInput,
} from "@/lib/catalog/validations";

export interface CategoryActionResult {
  error: string | null;
  success?: boolean;
  categoryId?: string;
}

export interface ProductActionResult {
  error: string | null;
  success?: boolean;
  productId?: string;
  warning?: string;
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

const DUPLICATE_PRODUCT_SLUG_ERROR = "That slug is already in use by another product.";
const PRODUCT_CATEGORY_NOT_FOUND_ERROR = "The selected category no longer exists. Please choose another category.";
const GENERIC_PRODUCT_SAVE_ERROR = "Something went wrong creating this product. Please try again.";
const PRODUCT_NOT_FOUND_ERROR = "Product not found.";
const GENERIC_PRODUCT_UPDATE_ERROR = "Something went wrong updating this product. Please try again.";
const DUPLICATE_VARIANT_SKU_ERROR = "That SKU is already in use by another variant.";
const VARIANT_PRODUCT_NOT_FOUND_ERROR = "Product not found.";
const GENERIC_VARIANT_SAVE_ERROR = "Something went wrong creating this variant. Please try again.";
const VARIANT_NOT_FOUND_ERROR = "Variant not found.";
const GENERIC_VARIANT_UPDATE_ERROR = "Something went wrong updating this variant. Please try again.";
const VARIANT_RFQ_REFERENCED_ERROR = "This variant is already used in an RFQ and cannot be deleted.";
const GENERIC_VARIANT_DELETE_ERROR = "Something went wrong deleting this variant. Please try again.";
const COLLECTION_ASSIGNMENT_NOT_FOUND_ERROR = "The product or collection no longer exists. Please refresh and try again.";
const GENERIC_COLLECTION_ASSIGN_ERROR = "Something went wrong assigning this collection. Please try again.";
const GENERIC_COLLECTION_UNASSIGN_ERROR = "Something went wrong removing this collection. Please try again.";
const PRODUCT_IMAGE_PRODUCT_NOT_FOUND_ERROR = "Product not found.";
const PRODUCT_IMAGE_TOO_LARGE_ERROR = "Image must be 10 MiB or smaller.";
const PRODUCT_IMAGE_INVALID_ERROR = "That file could not be read as a valid image. Please try a different file.";
const PRODUCT_IMAGE_TYPE_MISMATCH_ERROR = "The uploaded file's content does not match its declared image type.";
const PRODUCT_IMAGE_TOO_SMALL_ERROR = "Please use a sharp product image at least 1600 x 1600 px.";
const GENERIC_PRODUCT_IMAGE_ERROR = "Something went wrong uploading this image. Please try again.";
const IMAGE_NOT_FOUND_ERROR = "Image not found.";
const GENERIC_IMAGE_ALT_UPDATE_ERROR = "Something went wrong updating this image. Please try again.";
const GENERIC_IMAGE_PRIMARY_ERROR = "Something went wrong updating the primary image. Please try again.";
const GENERIC_IMAGE_REORDER_ERROR = "Something went wrong reordering the images. Please try again.";
const GENERIC_IMAGE_REMOVE_ERROR = "Something went wrong removing this image. Please try again.";
const PRIMARY_IMAGE_REMOVE_BLOCKED_ERROR = "Choose another primary image before removing this image.";
const GENERIC_PRODUCT_DELETE_ERROR = "Something went wrong deleting this product. Please try again.";
const PRODUCT_RFQ_REFERENCED_DELETE_ERROR = "This product is already used in an RFQ and cannot be deleted.";

function logCategoryActionError(
  operation: string,
  error: { code?: string } | null | undefined
) {
  console.error(`[catalog/actions] ${operation} failed`, {
    code: error?.code ?? "unknown",
  });
}

function logProductActionError(
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
  revalidatePath("/admin/catalog/products");
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

export async function createProductAction(
  input: CreateProductActionInput
): Promise<ProductActionResult> {
  const parsed = createProductSchema.safeParse(input);

  if (!parsed.success) {
    return { error: INVALID_INPUT_ERROR };
  }

  const {
    name,
    slug,
    description,
    shortDescription,
    categoryId,
    moq,
    leadTimeDays,
    baseMaterial,
    dimensions,
    weightGrams,
    hsCode,
    isCustomizable,
    customizationNotes,
    metaTitle,
    metaDescription,
    status,
  } = parsed.data;

  const adminProfile = await getAdminProfile();

  if (!adminProfile) {
    return { error: NOT_ADMIN_ERROR };
  }

  const supabase = await createClient();

  const { data: inserted, error: insertError } = await supabase
    .from("products")
    .insert({
      name,
      slug,
      description: description ?? null,
      short_description: shortDescription ?? null,
      category_id: categoryId,
      moq,
      lead_time_days: leadTimeDays ?? null,
      base_material: baseMaterial ?? null,
      dimensions: dimensions ?? null,
      weight_grams: weightGrams ?? null,
      hs_code: hsCode ?? null,
      is_customizable: isCustomizable,
      customization_notes: customizationNotes ?? null,
      meta_title: metaTitle ?? null,
      meta_description: metaDescription ?? null,
      status,
    })
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      return { error: DUPLICATE_PRODUCT_SLUG_ERROR };
    }

    if (insertError.code === "23503") {
      return { error: PRODUCT_CATEGORY_NOT_FOUND_ERROR };
    }

    logProductActionError("createProductAction.insert", insertError);
    return { error: GENERIC_PRODUCT_SAVE_ERROR };
  }

  if (!inserted) {
    logProductActionError("createProductAction.insert", {
      code: "no_row_returned",
    });
    return { error: GENERIC_PRODUCT_SAVE_ERROR };
  }

  revalidateCatalogPaths();

  return {
    error: null,
    success: true,
    productId: inserted.id,
  };
}

export async function updateProductAction(
  input: UpdateProductActionInput
): Promise<ProductActionResult> {
  const parsed = updateProductSchema.safeParse(input);

  if (!parsed.success) {
    return { error: INVALID_INPUT_ERROR };
  }

  const {
    productId,
    name,
    slug,
    description,
    shortDescription,
    categoryId,
    moq,
    leadTimeDays,
    baseMaterial,
    dimensions,
    weightGrams,
    hsCode,
    isCustomizable,
    customizationNotes,
    metaTitle,
    metaDescription,
    status,
  } = parsed.data;

  const adminProfile = await getAdminProfile();

  if (!adminProfile) {
    return { error: NOT_ADMIN_ERROR };
  }

  const supabase = await createClient();

  const { data: updated, error: updateError } = await supabase
    .from("products")
    .update({
      name,
      slug,
      description: description ?? null,
      short_description: shortDescription ?? null,
      category_id: categoryId,
      moq,
      lead_time_days: leadTimeDays ?? null,
      base_material: baseMaterial ?? null,
      dimensions: dimensions ?? null,
      weight_grams: weightGrams ?? null,
      hs_code: hsCode ?? null,
      is_customizable: isCustomizable,
      customization_notes: customizationNotes ?? null,
      meta_title: metaTitle ?? null,
      meta_description: metaDescription ?? null,
      status,
    })
    .eq("id", productId)
    .select("id")
    .maybeSingle();

  if (updateError) {
    if (updateError.code === "23505") {
      return { error: DUPLICATE_PRODUCT_SLUG_ERROR };
    }

    if (updateError.code === "23503") {
      return { error: PRODUCT_CATEGORY_NOT_FOUND_ERROR };
    }

    logProductActionError("updateProductAction.update", updateError);
    return { error: GENERIC_PRODUCT_UPDATE_ERROR };
  }

  if (!updated) {
    return { error: PRODUCT_NOT_FOUND_ERROR };
  }

  revalidateCatalogPaths();

  return {
    error: null,
    success: true,
    productId: updated.id,
  };
}

export interface ProductVariantActionResult {
  error: string | null;
  success?: boolean;
  productId?: string;
  variant?: {
    id: string;
    variantName: string;
    sku: string | null;
    priceNote: string | null;
  };
}

export async function createProductVariantAction(
  input: CreateProductVariantActionInput
): Promise<ProductVariantActionResult> {
  const parsed = createProductVariantSchema.safeParse(input);

  if (!parsed.success) {
    return { error: INVALID_INPUT_ERROR };
  }

  const { productId, variantName, sku, priceNote } = parsed.data;

  const adminProfile = await getAdminProfile();

  if (!adminProfile) {
    return { error: NOT_ADMIN_ERROR };
  }

  const supabase = await createClient();

  const { data: inserted, error: insertError } = await supabase
    .from("product_variants")
    .insert({
      product_id: productId,
      variant_name: variantName,
      sku: sku ?? null,
      price_note: priceNote ?? null,
    })
    .select("id, variant_name, sku, price_note")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      return { error: DUPLICATE_VARIANT_SKU_ERROR };
    }

    if (insertError.code === "23503") {
      return { error: VARIANT_PRODUCT_NOT_FOUND_ERROR };
    }

    logProductActionError("createProductVariantAction.insert", insertError);
    return { error: GENERIC_VARIANT_SAVE_ERROR };
  }

  if (!inserted) {
    logProductActionError("createProductVariantAction.insert", {
      code: "no_row_returned",
    });
    return { error: GENERIC_VARIANT_SAVE_ERROR };
  }

  revalidateCatalogPaths();

  return {
    error: null,
    success: true,
    productId,
    variant: {
      id: inserted.id,
      variantName: inserted.variant_name,
      sku: inserted.sku,
      priceNote: inserted.price_note,
    },
  };
}

export async function updateProductVariantAction(
  input: UpdateProductVariantActionInput
): Promise<ProductVariantActionResult> {
  const parsed = updateProductVariantSchema.safeParse(input);

  if (!parsed.success) {
    return { error: INVALID_INPUT_ERROR };
  }

  const { productId, variantId, variantName, sku, priceNote } = parsed.data;

  const adminProfile = await getAdminProfile();

  if (!adminProfile) {
    return { error: NOT_ADMIN_ERROR };
  }

  const supabase = await createClient();

  const { data: updated, error: updateError } = await supabase
    .from("product_variants")
    .update({
      variant_name: variantName,
      sku: sku ?? null,
      price_note: priceNote ?? null,
    })
    .eq("id", variantId)
    .eq("product_id", productId)
    .select("id, variant_name, sku, price_note")
    .maybeSingle();

  if (updateError) {
    if (updateError.code === "23505") {
      return { error: DUPLICATE_VARIANT_SKU_ERROR };
    }

    logProductActionError("updateProductVariantAction.update", updateError);
    return { error: GENERIC_VARIANT_UPDATE_ERROR };
  }

  if (!updated) {
    return { error: VARIANT_NOT_FOUND_ERROR };
  }

  revalidateCatalogPaths();

  return {
    error: null,
    success: true,
    productId,
    variant: {
      id: updated.id,
      variantName: updated.variant_name,
      sku: updated.sku,
      priceNote: updated.price_note,
    },
  };
}

export async function deleteProductVariantAction(
  input: DeleteProductVariantActionInput
): Promise<ProductActionResult> {
  const parsed = deleteProductVariantSchema.safeParse(input);

  if (!parsed.success) {
    return { error: INVALID_INPUT_ERROR };
  }

  const { productId, variantId } = parsed.data;

  const adminProfile = await getAdminProfile();

  if (!adminProfile) {
    return { error: NOT_ADMIN_ERROR };
  }

  const supabase = await createClient();

  const { data: deleted, error: deleteError } = await supabase
    .from("product_variants")
    .delete()
    .eq("id", variantId)
    .eq("product_id", productId)
    .select("id")
    .maybeSingle();

  if (deleteError) {
    if (deleteError.code === "23503") {
      return { error: VARIANT_RFQ_REFERENCED_ERROR };
    }

    logProductActionError("deleteProductVariantAction.delete", deleteError);
    return { error: GENERIC_VARIANT_DELETE_ERROR };
  }

  if (!deleted) {
    return { error: VARIANT_NOT_FOUND_ERROR };
  }

  revalidateCatalogPaths();

  return {
    error: null,
    success: true,
    productId,
  };
}

export async function assignProductCollectionAction(
  input: AssignProductCollectionActionInput
): Promise<ProductActionResult> {
  const parsed = assignProductCollectionSchema.safeParse(input);

  if (!parsed.success) {
    return { error: INVALID_INPUT_ERROR };
  }

  const { productId, collectionId } = parsed.data;

  const adminProfile = await getAdminProfile();

  if (!adminProfile) {
    return { error: NOT_ADMIN_ERROR };
  }

  const supabase = await createClient();

  const { error: insertError } = await supabase
    .from("product_collections")
    .insert({
      product_id: productId,
      collection_id: collectionId,
    });

  if (insertError) {
    if (insertError.code === "23505") {
      revalidateCatalogPaths();
      return {
        error: null,
        success: true,
        productId,
      };
    }

    if (insertError.code === "23503") {
      return { error: COLLECTION_ASSIGNMENT_NOT_FOUND_ERROR };
    }

    logProductActionError("assignProductCollectionAction.insert", insertError);
    return { error: GENERIC_COLLECTION_ASSIGN_ERROR };
  }

  revalidateCatalogPaths();

  return {
    error: null,
    success: true,
    productId,
  };
}

export async function unassignProductCollectionAction(
  input: UnassignProductCollectionActionInput
): Promise<ProductActionResult> {
  const parsed = unassignProductCollectionSchema.safeParse(input);

  if (!parsed.success) {
    return { error: INVALID_INPUT_ERROR };
  }

  const { productId, collectionId } = parsed.data;

  const adminProfile = await getAdminProfile();

  if (!adminProfile) {
    return { error: NOT_ADMIN_ERROR };
  }

  const supabase = await createClient();

  const { error: deleteError } = await supabase
    .from("product_collections")
    .delete()
    .eq("product_id", productId)
    .eq("collection_id", collectionId);

  if (deleteError) {
    logProductActionError("unassignProductCollectionAction.delete", deleteError);
    return { error: GENERIC_COLLECTION_UNASSIGN_ERROR };
  }

  revalidateCatalogPaths();

  return {
    error: null,
    success: true,
    productId,
  };
}

export interface PrepareProductImageUploadActionResult {
  error: string | null;
  success?: boolean;
  upload?: {
    productId: string;
    objectPath: string;
    token: string;
    declaredMimeType: string;
  };
}

export interface ProductImageActionResult {
  error: string | null;
  success?: boolean;
  productId?: string;
  image?: {
    id: string;
    productId: string;
    url: string;
    altText: string;
    sortOrder: number;
    isPrimary: boolean;
  };
}

const PRODUCT_IMAGES_BUCKET = "product-images";
const MAX_PRODUCT_IMAGE_BYTES = 10 * 1024 * 1024;
const MIN_PRODUCT_IMAGE_DIMENSION = 1600;

function safeExtensionForProductImageMime(mimeType: "image/jpeg" | "image/png" | "image/webp"): string {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
  }
}

function expectedSharpFormatForProductImageMime(mimeType: "image/jpeg" | "image/png" | "image/webp"): string {
  switch (mimeType) {
    case "image/jpeg":
      return "jpeg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
  }
}

/**
 * Strict, exact structural validation of the frozen object-path contract:
 * <productId>/<random_uuid>.<expectedExtension> -- exactly one slash, the
 * folder segment must equal productId exactly, the filename stem must be a
 * genuine UUID shape, and the extension must exactly match what the
 * declared MIME maps to. Rejects nested directories, path traversal, extra
 * suffixes, and any path not addressed to the given productId.
 */
function isValidPreparedProductImageObjectPath(
  objectPath: string,
  productId: string,
  expectedExtension: string
): boolean {
  const uuidPattern = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
  const escapedProductId = productId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedExtension = expectedExtension.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escapedProductId}/${uuidPattern}\\.${escapedExtension}$`);
  return pattern.test(objectPath);
}

export async function prepareProductImageUploadAction(
  input: PrepareProductImageUploadActionInput
): Promise<PrepareProductImageUploadActionResult> {
  const parsed = prepareProductImageUploadSchema.safeParse(input);

  if (!parsed.success) {
    return { error: INVALID_INPUT_ERROR };
  }

  const { productId, declaredMimeType, declaredFileSize } = parsed.data;

  const adminProfile = await getAdminProfile();

  if (!adminProfile) {
    return { error: NOT_ADMIN_ERROR };
  }

  if (declaredFileSize > MAX_PRODUCT_IMAGE_BYTES) {
    return { error: PRODUCT_IMAGE_TOO_LARGE_ERROR };
  }

  const supabase = await createClient();

  const { data: product, error: productLookupError } = await supabase
    .from("products")
    .select("id")
    .eq("id", productId)
    .maybeSingle();

  if (productLookupError) {
    logProductActionError("prepareProductImageUploadAction.productLookup", productLookupError);
    return { error: GENERIC_PRODUCT_IMAGE_ERROR };
  }

  if (!product) {
    return { error: PRODUCT_IMAGE_PRODUCT_NOT_FOUND_ERROR };
  }

  const safeExtension = safeExtensionForProductImageMime(declaredMimeType);
  const objectId = randomUUID();
  const objectPath = `${productId}/${objectId}.${safeExtension}`;

  const { data: signedUploadData, error: signedUploadError } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .createSignedUploadUrl(objectPath, { upsert: false });

  if (signedUploadError || !signedUploadData) {
    logProductActionError("prepareProductImageUploadAction.createSignedUploadUrl", { code: "signed_upload_url_failed" });
    return { error: GENERIC_PRODUCT_IMAGE_ERROR };
  }

  return {
    error: null,
    success: true,
    upload: {
      productId,
      objectPath,
      token: signedUploadData.token,
      declaredMimeType,
    },
  };
}

/**
 * SAFETY-FIRST DESIGN NOTE (Step 7): this action deliberately performs NO
 * Storage deletion in any branch. A fresh DB lookup performed immediately
 * before a Storage deletion cannot be made truly race-safe here, because
 * the DB read and the Storage deletion are two separate non-atomic
 * operations -- another finalize request's insert can land in the gap
 * between them. Under the frozen no-migration Step-7 constraint (no
 * UNIQUE(product_id, url) constraint, no DB-transactional RPC), the only
 * response that cannot destroy a legitimately finalized image is to never
 * delete at all. An orphaned, never-finalized UUID object left in
 * Storage is an acceptable and intentional tradeoff; its cleanup is
 * explicitly deferred to a later maintenance/image-management step with
 * its own safety design. Idempotent success on retry is still fully
 * supported via DB lookup alone, which requires no Storage interaction.
 */
export async function finalizeProductImageUploadAction(
  input: FinalizeProductImageUploadActionInput
): Promise<ProductImageActionResult> {
  const parsed = finalizeProductImageUploadSchema.safeParse(input);

  if (!parsed.success) {
    return { error: INVALID_INPUT_ERROR };
  }

  const { productId, objectPath, declaredMimeType, altText } = parsed.data;

  const adminProfile = await getAdminProfile();

  if (!adminProfile) {
    return { error: NOT_ADMIN_ERROR };
  }

  const safeExtension = safeExtensionForProductImageMime(declaredMimeType);
  const expectedSharpFormat = expectedSharpFormatForProductImageMime(declaredMimeType);

  if (!isValidPreparedProductImageObjectPath(objectPath, productId, safeExtension)) {
    return { error: INVALID_INPUT_ERROR };
  }

  const supabase = await createClient();

  const { data: publicUrlData } = supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .getPublicUrl(objectPath);

  const fullPublicUrl = publicUrlData?.publicUrl ?? "";

  if (!fullPublicUrl) {
    logProductActionError("finalizeProductImageUploadAction.missingPublicUrl", { code: "missing_public_url" });
    return { error: GENERIC_PRODUCT_IMAGE_ERROR };
  }

  // Fast-path idempotency: if this exact URL is already a confirmed DB
  // row for this product, treat finalize as already complete (sequential
  // retry safety). No Storage deletion is ever attempted in this action.
  const { data: initialExistingRow, error: initialExistingLookupError } = await supabase
    .from("product_images")
    .select("id, product_id, url, alt_text, sort_order, is_primary")
    .eq("url", fullPublicUrl)
    .maybeSingle();

  if (initialExistingLookupError) {
    logProductActionError("finalizeProductImageUploadAction.initialExistingLookup", initialExistingLookupError);
    return { error: GENERIC_PRODUCT_IMAGE_ERROR };
  }

  if (initialExistingRow) {
    if (initialExistingRow.product_id !== productId) {
      return { error: GENERIC_PRODUCT_IMAGE_ERROR };
    }

    return {
      error: null,
      success: true,
      productId,
      image: {
        id: initialExistingRow.id,
        productId: initialExistingRow.product_id,
        url: initialExistingRow.url,
        altText: initialExistingRow.alt_text,
        sortOrder: initialExistingRow.sort_order,
        isPrimary: initialExistingRow.is_primary,
      },
    };
  }

  const { data: product, error: productLookupError } = await supabase
    .from("products")
    .select("id, name")
    .eq("id", productId)
    .maybeSingle();

  if (productLookupError) {
    logProductActionError("finalizeProductImageUploadAction.productLookup", productLookupError);
    return { error: GENERIC_PRODUCT_IMAGE_ERROR };
  }

  if (!product) {
    // No cleanup attempted: the object may remain orphaned intentionally.
    return { error: PRODUCT_IMAGE_PRODUCT_NOT_FOUND_ERROR };
  }

  const { data: downloadedBlob, error: downloadError } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .download(objectPath);

  if (downloadError || !downloadedBlob) {
    logProductActionError("finalizeProductImageUploadAction.download", { code: "storage_download_failed" });
    return { error: PRODUCT_IMAGE_INVALID_ERROR };
  }

  const downloadedArrayBuffer = await downloadedBlob.arrayBuffer();
  const downloadedBytes = Buffer.from(downloadedArrayBuffer);

  if (downloadedBytes.length <= 0 || downloadedBytes.length > MAX_PRODUCT_IMAGE_BYTES) {
    return { error: PRODUCT_IMAGE_TOO_LARGE_ERROR };
  }

  const { default: sharp } = await import("sharp");

  let metadata;
  try {
    metadata = await sharp(downloadedBytes).metadata();
  } catch {
    logProductActionError("finalizeProductImageUploadAction.sharpMetadata", { code: "sharp_metadata_failed" });
    return { error: PRODUCT_IMAGE_INVALID_ERROR };
  }

  if (!metadata.format || metadata.format !== expectedSharpFormat) {
    return { error: PRODUCT_IMAGE_TYPE_MISMATCH_ERROR };
  }

  if (!metadata.width || !metadata.height || metadata.width < MIN_PRODUCT_IMAGE_DIMENSION || metadata.height < MIN_PRODUCT_IMAGE_DIMENSION) {
    return { error: PRODUCT_IMAGE_TOO_SMALL_ERROR };
  }

  const { data: lastImageRow, error: lastImageError } = await supabase
    .from("product_images")
    .select("sort_order")
    .eq("product_id", productId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastImageError) {
    logProductActionError("finalizeProductImageUploadAction.sortOrderLookup", lastImageError);
    return { error: GENERIC_PRODUCT_IMAGE_ERROR };
  }

  const nextSortOrder = lastImageRow ? lastImageRow.sort_order + 1 : 0;

  const resolvedAltText = altText.length > 0 ? altText : product.name;

  const { data: insertedImage, error: insertError } = await supabase
    .from("product_images")
    .insert({
      product_id: productId,
      url: fullPublicUrl,
      alt_text: resolvedAltText,
      sort_order: nextSortOrder,
      is_primary: false,
    })
    .select("id, product_id, url, alt_text, sort_order, is_primary")
    .single();

  if (insertError || !insertedImage) {
    // Ambiguous/committed-but-lost-response handling: re-check by URL
    // alone (no Storage interaction). If a row now exists for this
    // product, the insert actually succeeded (or another finalize
    // request completed it first) -- return idempotent success rather
    // than a false failure. No Storage deletion is attempted in any
    // outcome of this handling.
    const { data: retryExistingRow, error: retryExistingLookupError } = await supabase
      .from("product_images")
      .select("id, product_id, url, alt_text, sort_order, is_primary")
      .eq("url", fullPublicUrl)
      .maybeSingle();

    if (retryExistingLookupError) {
      logProductActionError("finalizeProductImageUploadAction.retryExistingLookup", retryExistingLookupError);
      logProductActionError("finalizeProductImageUploadAction.insert", insertError ?? { code: "no_row_returned" });
      return { error: GENERIC_PRODUCT_IMAGE_ERROR };
    }

    if (retryExistingRow) {
      if (retryExistingRow.product_id !== productId) {
        return { error: GENERIC_PRODUCT_IMAGE_ERROR };
      }

      return {
        error: null,
        success: true,
        productId,
        image: {
          id: retryExistingRow.id,
          productId: retryExistingRow.product_id,
          url: retryExistingRow.url,
          altText: retryExistingRow.alt_text,
          sortOrder: retryExistingRow.sort_order,
          isPrimary: retryExistingRow.is_primary,
        },
      };
    }

    logProductActionError("finalizeProductImageUploadAction.insert", insertError ?? { code: "no_row_returned" });
    return { error: GENERIC_PRODUCT_IMAGE_ERROR };
  }

  revalidateCatalogPaths();

  return {
    error: null,
    success: true,
    productId,
    image: {
      id: insertedImage.id,
      productId: insertedImage.product_id,
      url: insertedImage.url,
      altText: insertedImage.alt_text,
      sortOrder: insertedImage.sort_order,
      isPrimary: insertedImage.is_primary,
    },
  };
}

interface AdminSafeProductImage {
  id: string;
  url: string;
  altText: string;
  sortOrder: number;
  isPrimary: boolean;
}

export interface ProductImageMutationActionResult {
  error: string | null;
  success?: boolean;
  productId?: string;
  image?: AdminSafeProductImage;
  images?: AdminSafeProductImage[];
  removedImageId?: string;
}

export async function updateProductImageAltTextAction(
  input: UpdateProductImageAltTextActionInput
): Promise<ProductImageMutationActionResult> {
  const parsed = updateProductImageAltTextSchema.safeParse(input);

  if (!parsed.success) {
    return { error: INVALID_INPUT_ERROR };
  }

  const { productId, imageId, altText } = parsed.data;

  const adminProfile = await getAdminProfile();

  if (!adminProfile) {
    return { error: NOT_ADMIN_ERROR };
  }

  const supabase = await createClient();

  const { data: product, error: productLookupError } = await supabase
    .from("products")
    .select("id, name")
    .eq("id", productId)
    .maybeSingle();

  if (productLookupError) {
    logProductActionError("updateProductImageAltTextAction.productLookup", productLookupError);
    return { error: GENERIC_IMAGE_ALT_UPDATE_ERROR };
  }

  if (!product) {
    return { error: PRODUCT_IMAGE_PRODUCT_NOT_FOUND_ERROR };
  }

  const resolvedAltText = altText.length > 0 ? altText : product.name;

  const { data: updatedImage, error: updateError } = await supabase
    .from("product_images")
    .update({
      alt_text: resolvedAltText,
    })
    .eq("id", imageId)
    .eq("product_id", productId)
    .select("id, url, alt_text, sort_order, is_primary")
    .maybeSingle();

  if (updateError) {
    logProductActionError("updateProductImageAltTextAction.update", updateError);
    return { error: GENERIC_IMAGE_ALT_UPDATE_ERROR };
  }

  if (!updatedImage) {
    return { error: IMAGE_NOT_FOUND_ERROR };
  }

  revalidateCatalogPaths();

  return {
    error: null,
    success: true,
    productId,
    image: {
      id: updatedImage.id,
      url: updatedImage.url,
      altText: updatedImage.alt_text,
      sortOrder: updatedImage.sort_order,
      isPrimary: updatedImage.is_primary,
    },
  };
}

/**
 * Best-effort, non-atomic primary swap: this performs three separate
 * ordinary updates (read previous primary, clear it, set the new one)
 * rather than a single database-transactional operation, because Step 8
 * deliberately adds no migration/RPC. If setting the new primary fails
 * after the previous one was cleared, a best-effort restoration of the
 * previous primary is attempted; if that restoration itself fails, the
 * failure is logged safely and a controlled error is returned. This is
 * not presented as transactionally atomic.
 */
export async function setProductImagePrimaryAction(
  input: SetProductImagePrimaryActionInput
): Promise<ProductImageMutationActionResult> {
  const parsed = setProductImagePrimarySchema.safeParse(input);

  if (!parsed.success) {
    return { error: INVALID_INPUT_ERROR };
  }

  const { productId, imageId } = parsed.data;

  const adminProfile = await getAdminProfile();

  if (!adminProfile) {
    return { error: NOT_ADMIN_ERROR };
  }

  const supabase = await createClient();

  const { data: targetImage, error: targetLookupError } = await supabase
    .from("product_images")
    .select("id, url, alt_text, sort_order, is_primary")
    .eq("id", imageId)
    .eq("product_id", productId)
    .maybeSingle();

  if (targetLookupError) {
    logProductActionError("setProductImagePrimaryAction.targetLookup", targetLookupError);
    return { error: GENERIC_IMAGE_PRIMARY_ERROR };
  }

  if (!targetImage) {
    return { error: IMAGE_NOT_FOUND_ERROR };
  }

  if (targetImage.is_primary) {
    return {
      error: null,
      success: true,
      productId,
      image: {
        id: targetImage.id,
        url: targetImage.url,
        altText: targetImage.alt_text,
        sortOrder: targetImage.sort_order,
        isPrimary: targetImage.is_primary,
      },
    };
  }

  const { data: previousPrimary, error: previousPrimaryLookupError } = await supabase
    .from("product_images")
    .select("id")
    .eq("product_id", productId)
    .eq("is_primary", true)
    .maybeSingle();

  if (previousPrimaryLookupError) {
    logProductActionError("setProductImagePrimaryAction.previousPrimaryLookup", previousPrimaryLookupError);
    return { error: GENERIC_IMAGE_PRIMARY_ERROR };
  }

  const { error: clearError } = await supabase
    .from("product_images")
    .update({ is_primary: false })
    .eq("product_id", productId)
    .eq("is_primary", true);

  if (clearError) {
    logProductActionError("setProductImagePrimaryAction.clearPrevious", clearError);
    return { error: GENERIC_IMAGE_PRIMARY_ERROR };
  }

  const { data: updatedTarget, error: setTargetError } = await supabase
    .from("product_images")
    .update({ is_primary: true })
    .eq("id", imageId)
    .eq("product_id", productId)
    .select("id, url, alt_text, sort_order, is_primary")
    .maybeSingle();

  if (setTargetError || !updatedTarget) {
    logProductActionError("setProductImagePrimaryAction.setTarget", setTargetError ?? { code: "no_row_returned" });

    if (previousPrimary) {
      const { error: restoreError } = await supabase
        .from("product_images")
        .update({ is_primary: true })
        .eq("id", previousPrimary.id)
        .eq("product_id", productId);

      if (restoreError) {
        logProductActionError("setProductImagePrimaryAction.restorePrevious", restoreError);
      }
    }

    return { error: GENERIC_IMAGE_PRIMARY_ERROR };
  }

  revalidateCatalogPaths();

  return {
    error: null,
    success: true,
    productId,
    image: {
      id: updatedTarget.id,
      url: updatedTarget.url,
      altText: updatedTarget.alt_text,
      sortOrder: updatedTarget.sort_order,
      isPrimary: updatedTarget.is_primary,
    },
  };
}

/**
 * Best-effort, non-atomic reorder: persists the canonicalized order via
 * a sequence of ordinary per-row updates, not a single transactional
 * operation. If any individual update fails partway through, the current
 * DB state is re-read and returned alongside the error so the client can
 * reconcile its local state with what is actually persisted, rather than
 * assuming the full reorder succeeded.
 */
export async function moveProductImageAction(
  input: MoveProductImageActionInput
): Promise<ProductImageMutationActionResult> {
  const parsed = moveProductImageSchema.safeParse(input);

  if (!parsed.success) {
    return { error: INVALID_INPUT_ERROR };
  }

  const { productId, imageId, direction } = parsed.data;

  const adminProfile = await getAdminProfile();

  if (!adminProfile) {
    return { error: NOT_ADMIN_ERROR };
  }

  const supabase = await createClient();

  const { data: currentRows, error: currentLookupError } = await supabase
    .from("product_images")
    .select("id, url, alt_text, sort_order, is_primary, created_at")
    .eq("product_id", productId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (currentLookupError) {
    logProductActionError("moveProductImageAction.currentLookup", currentLookupError);
    return { error: GENERIC_IMAGE_REORDER_ERROR };
  }

  const orderedRows = currentRows ?? [];
  const targetIndex = orderedRows.findIndex((row) => row.id === imageId);

  if (targetIndex === -1) {
    return { error: IMAGE_NOT_FOUND_ERROR };
  }

  const toSafeImages = (rows: typeof orderedRows): AdminSafeProductImage[] =>
    rows.map((row) => ({
      id: row.id,
      url: row.url,
      altText: row.alt_text,
      sortOrder: row.sort_order,
      isPrimary: row.is_primary,
    }));

  if (direction === "up" && targetIndex === 0) {
    return { error: null, success: true, productId, images: toSafeImages(orderedRows) };
  }

  if (direction === "down" && targetIndex === orderedRows.length - 1) {
    return { error: null, success: true, productId, images: toSafeImages(orderedRows) };
  }

  const swapWithIndex = direction === "up" ? targetIndex - 1 : targetIndex + 1;
  const reorderedRows = orderedRows.slice();

  const targetRow = reorderedRows[targetIndex];
  const neighborRow = reorderedRows[swapWithIndex];

  if (!targetRow || !neighborRow) {
    logProductActionError("moveProductImageAction.swapBounds", { code: "unexpected_image_order_bounds" });
    return {
      error: GENERIC_IMAGE_REORDER_ERROR,
      productId,
      images: toSafeImages(orderedRows),
    };
  }

  reorderedRows[targetIndex] = neighborRow;
  reorderedRows[swapWithIndex] = targetRow;

  let persistFailed = false;

  for (const [i, row] of reorderedRows.entries()) {
    const { error: persistError } = await supabase
      .from("product_images")
      .update({ sort_order: i })
      .eq("id", row.id)
      .eq("product_id", productId);

    if (persistError) {
      logProductActionError("moveProductImageAction.persist", persistError);
      persistFailed = true;
      break;
    }
  }

  if (persistFailed) {
    const { data: refetchedRows, error: refetchError } = await supabase
      .from("product_images")
      .select("id, url, alt_text, sort_order, is_primary, created_at")
      .eq("product_id", productId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });

    if (refetchError) {
      logProductActionError("moveProductImageAction.refetchAfterFailure", refetchError);
      return { error: GENERIC_IMAGE_REORDER_ERROR };
    }

    return {
      error: GENERIC_IMAGE_REORDER_ERROR,
      productId,
      images: toSafeImages(refetchedRows ?? []),
    };
  }

  const { data: finalRows, error: finalLookupError } = await supabase
    .from("product_images")
    .select("id, url, alt_text, sort_order, is_primary, created_at")
    .eq("product_id", productId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (finalLookupError) {
    logProductActionError("moveProductImageAction.finalLookup", finalLookupError);
    return { error: GENERIC_IMAGE_REORDER_ERROR };
  }

  revalidateCatalogPaths();

  return {
    error: null,
    success: true,
    productId,
    images: toSafeImages(finalRows ?? []),
  };
}

/**
 * Deletes ONLY the product_images database row. This action NEVER calls
 * Supabase Storage deletion and never parses the stored URL into a
 * Storage path -- Storage cleanup (including for orphaned or removed
 * images) is explicitly deferred to a later maintenance step.
 */
export async function removeProductImageAction(
  input: RemoveProductImageActionInput
): Promise<ProductImageMutationActionResult> {
  const parsed = removeProductImageSchema.safeParse(input);

  if (!parsed.success) {
    return { error: INVALID_INPUT_ERROR };
  }

  const { productId, imageId } = parsed.data;

  const adminProfile = await getAdminProfile();

  if (!adminProfile) {
    return { error: NOT_ADMIN_ERROR };
  }

  const supabase = await createClient();

  const { data: targetImage, error: targetLookupError } = await supabase
    .from("product_images")
    .select("id, is_primary")
    .eq("id", imageId)
    .eq("product_id", productId)
    .maybeSingle();

  if (targetLookupError) {
    logProductActionError("removeProductImageAction.targetLookup", targetLookupError);
    return { error: GENERIC_IMAGE_REMOVE_ERROR };
  }

  if (!targetImage) {
    return { error: null, success: true, productId, removedImageId: imageId };
  }

  if (targetImage.is_primary) {
    const { count: otherImageCount, error: otherCountError } = await supabase
      .from("product_images")
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId)
      .neq("id", imageId);

    if (otherCountError) {
      logProductActionError("removeProductImageAction.otherCountCheck", otherCountError);
      return { error: GENERIC_IMAGE_REMOVE_ERROR };
    }

    if ((otherImageCount ?? 0) > 0) {
      return { error: PRIMARY_IMAGE_REMOVE_BLOCKED_ERROR };
    }
  }

  const { data: deletedImage, error: deleteError } = await supabase
    .from("product_images")
    .delete()
    .eq("id", imageId)
    .eq("product_id", productId)
    .select("id")
    .maybeSingle();

  if (deleteError) {
    logProductActionError("removeProductImageAction.delete", deleteError);
    return { error: GENERIC_IMAGE_REMOVE_ERROR };
  }

  if (!deletedImage) {
    return { error: null, success: true, productId, removedImageId: imageId };
  }

  revalidateCatalogPaths();

  return {
    error: null,
    success: true,
    productId,
    removedImageId: deletedImage.id,
  };
}

type ProductImageStorageUrlClassification =
  | { kind: "external" }
  | { kind: "unsafe" }
  | { kind: "managed"; relativePath: string };

const PRODUCT_IMAGES_STORAGE_PREFIX = "/storage/v1/object/public/product-images/";
const PRODUCT_IMAGES_BUCKET_ROOT_FOR_DETECTION = "/storage/v1/object/public/product-images";

/**
 * Reduces a DETECTION-ONLY candidate string down to its actual path-like
 * portion: strips any query (from the first "?") or hash (from the
 * first "#"), and -- for a candidate that looks like an absolute URL
 * (contains "://") -- strips the scheme and authority as well, keeping
 * only what follows the first "/" after the authority. A bare/root-
 * relative candidate (no "://") is returned as-is once query/hash are
 * stripped.
 */
function extractPathOnlyForDetection(candidate: string): string {
  let withoutQueryOrHash = candidate;
  let cutIndex = withoutQueryOrHash.length;
  const queryIndex = withoutQueryOrHash.indexOf("?");
  const hashIndex = withoutQueryOrHash.indexOf("#");
  if (queryIndex !== -1 && queryIndex < cutIndex) {
    cutIndex = queryIndex;
  }
  if (hashIndex !== -1 && hashIndex < cutIndex) {
    cutIndex = hashIndex;
  }
  withoutQueryOrHash = withoutQueryOrHash.substring(0, cutIndex);

  const schemeAuthoritySeparator = "://";
  const schemeIndex = withoutQueryOrHash.indexOf(schemeAuthoritySeparator);

  if (schemeIndex === -1) {
    return withoutQueryOrHash;
  }

  const afterSeparator = schemeIndex + schemeAuthoritySeparator.length;
  const pathStartIndex = withoutQueryOrHash.indexOf("/", afterSeparator);

  if (pathStartIndex === -1) {
    return "";
  }

  return withoutQueryOrHash.substring(pathStartIndex);
}

/**
 * DETECTION-ONLY dot-segment ("." / "..") resolution for a path-only
 * candidate. Resolves the candidate against a fixed, non-project dummy
 * origin ("https://detection.invalid") purely so the standard URL path-
 * segment normalization algorithm collapses "../" traversal sequences --
 * this reveals where a traversal-obfuscated value actually resolves to,
 * for the sole purpose of the unsafe/external detection decision below.
 * The dummy origin is never a real project origin and the returned
 * pathname is NEVER used to construct a Storage relativePath -- only the
 * exact canonical RAW regex match in classifyProductImageStorageUrl may
 * do that. Returns null if the candidate cannot be resolved (detection
 * safely continues using other candidates in that case).
 */
function normalizeDotSegmentsForDetection(pathOnlyCandidate: string): string | null {
  try {
    return new URL(pathOnlyCandidate, "https://detection.invalid").pathname;
  } catch {
    return null;
  }
}

/**
 * Detects, from RAW url text and a small set of DETECTION-ONLY decoded/
 * backslash-normalized/dot-segment-resolved candidates, whether a value
 * plausibly claims THIS PROJECT'S product-images bucket ROUTE
 * specifically, as the ANCHORED ROOT of the actual (and, separately, the
 * traversal-resolved) path -- never as a substring occurring later in
 * the path, never from scheme/host/query/hash text, and never merely
 * because a raw "../" sequence happens to precede the route text
 * un-resolved. For EACH candidate, extractPathOnlyForDetection first
 * isolates the true path-like portion; the anchored bucket-root pattern
 * is tested against BOTH that path-only text AND its dot-segment-
 * resolved form, so a traversal sequence that actually resolves toward
 * the managed bucket (e.g. "/foo/../storage/v1/object/public/product-
 * images/file.jpg") is correctly flagged, while an unrelated path that
 * merely contains the bucket route mid-path with no traversal resolving
 * toward it (e.g. "/foo/storage/v1/object/public/product-images/
 * file.jpg") remains correctly undetected. Decoding, backslash-
 * normalization, and dot-segment resolution are used ONLY to catch
 * obfuscation of the route claim -- none of it ever feeds into path
 * derivation. If any step throws, detection safely continues using
 * whichever candidates were already produced.
 */
function looksLikeManagedProductImagesRawUrl(rawUrl: string): boolean {
  const candidates: string[] = [];
  const rawLower = rawUrl.toLowerCase();
  candidates.push(rawLower);
  candidates.push(rawLower.replace(/\\/g, "/"));

  try {
    const decodedOnce = decodeURIComponent(rawLower);
    candidates.push(decodedOnce);
    candidates.push(decodedOnce.replace(/\\/g, "/"));

    try {
      const decodedTwice = decodeURIComponent(decodedOnce);
      candidates.push(decodedTwice);
      candidates.push(decodedTwice.replace(/\\/g, "/"));
    } catch {
      // Second decode pass failed -- continue with candidates already collected.
    }
  } catch {
    // First decode pass failed -- continue with the raw candidates only.
  }

  const escapedRoot = PRODUCT_IMAGES_BUCKET_ROOT_FOR_DETECTION.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const bucketRootDetectionPattern = new RegExp(`^${escapedRoot}(?:/|$)`);

  for (const candidate of candidates) {
    const pathOnlyCandidate = extractPathOnlyForDetection(candidate);

    if (bucketRootDetectionPattern.test(pathOnlyCandidate)) {
      return true;
    }

    const dotSegmentResolved = normalizeDotSegmentsForDetection(pathOnlyCandidate);

    if (dotSegmentResolved !== null && bucketRootDetectionPattern.test(dotSegmentResolved)) {
      return true;
    }
  }

  return false;
}

/**
 * Classifies a product_images.url value against this project's exact
 * managed public Storage bucket shape. The caller supplies a Supabase
 * origin that has ALREADY been validated once per deleteProductAction
 * invocation.
 *
 * SAFETY: acceptance as "managed" requires the RAW, unmodified url string
 * to be byte-for-byte identical to the canonical construction:
 *   <validatedSupabaseOrigin>/storage/v1/object/public/product-images/<productId>/<uuid>.(jpg|png|webp)
 * -- this is the ONLY branch that returns { kind: "managed", ... }. A
 * genuinely managed-bucket object carrying an extra query/hash, or any
 * traversal/encoding obfuscation, still fails this exact match and
 * correctly becomes "unsafe" via detection, not silently "managed".
 *
 * A value that fails to parse as an absolute URL is NOT automatically
 * "external" -- if its path-only content (or that content's dot-
 * segment-resolved form) specifically claims the product-images bucket
 * ROUTE as the path root it is "unsafe". Once parsed, a different
 * origin is always "external". Same-origin values use exact bucket-root
 * segment semantics (pathname equals the root, or starts with root +
 * "/") rather than a substring check.
 */
function classifyProductImageStorageUrl(
  rawUrl: string,
  productId: string,
  validatedSupabaseOrigin: string
): ProductImageStorageUrlClassification {
  const managedLooking = looksLikeManagedProductImagesRawUrl(rawUrl);

  let parsedForOrigin: URL;

  try {
    parsedForOrigin = new URL(rawUrl);
  } catch {
    return managedLooking ? { kind: "unsafe" } : { kind: "external" };
  }

  if (parsedForOrigin.origin !== validatedSupabaseOrigin) {
    return { kind: "external" };
  }

  const escapeForRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const uuidPattern = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
  const canonicalPattern = new RegExp(
    `^${escapeForRegex(validatedSupabaseOrigin)}${escapeForRegex(PRODUCT_IMAGES_STORAGE_PREFIX)}${escapeForRegex(productId)}/(${uuidPattern})\\.(jpg|png|webp)$`
  );

  const exactMatch = canonicalPattern.exec(rawUrl);

  if (exactMatch) {
    return { kind: "managed", relativePath: `${productId}/${exactMatch[1]}.${exactMatch[2]}` };
  }

  const normalizedPathLower = parsedForOrigin.pathname.toLowerCase();
  const normalizedLooksManaged =
    normalizedPathLower === PRODUCT_IMAGES_BUCKET_ROOT_FOR_DETECTION ||
    normalizedPathLower.startsWith(PRODUCT_IMAGES_BUCKET_ROOT_FOR_DETECTION + "/");

  if (managedLooking || normalizedLooksManaged) {
    return { kind: "unsafe" };
  }

  return { kind: "external" };
}

/**
 * Implements the existing Step-2 deleteProductSchema/DeleteProductActionInput
 * contract. FROZEN ORDERING: (0) validate the Supabase base URL config
 * ONCE, before any image query and before Product deletion, regardless of
 * how many images the Product has; (1) read current product_images URLs
 * and safely classify them BEFORE any deletion; (2) if any URL claiming
 * this project's managed bucket cannot be safely mapped, STOP before the
 * Product DB delete; (3) delete the Product row (existing FK cascades
 * remove product_images/product_variants/product_collections; an RFQ-
 * referencing FK conflict (23503) becomes a controlled error and NO
 * Storage call is made); if the delete call reports no error but also no
 * confirmed deleted row, a FRESH existence-confirmation SELECT decides
 * outcome -- still-present is a failure (no Storage touched), confirmed-
 * absent continues through the SAME unified post-delete path as a normal
 * successful deletion; (4) ONLY after confirmed DB absence, remove the
 * safely-collected managed Storage paths -- never before. A Storage
 * cleanup failure (returned error OR a thrown/rejected exception) after
 * confirmed DB deletion becomes success+warning, never a reported
 * deletion failure. This is NOT presented as DB+Storage transactionally
 * atomic. Orphan/unfinalized Storage objects are never swept.
 */
export async function deleteProductAction(
  input: DeleteProductActionInput
): Promise<ProductActionResult> {
  const parsed = deleteProductSchema.safeParse(input);

  if (!parsed.success) {
    return { error: INVALID_INPUT_ERROR };
  }

  const { productId } = parsed.data;

  const adminProfile = await getAdminProfile();

  if (!adminProfile) {
    return { error: NOT_ADMIN_ERROR };
  }

  const supabase = await createClient();

  const { data: product, error: productLookupError } = await supabase
    .from("products")
    .select("id")
    .eq("id", productId)
    .maybeSingle();

  if (productLookupError) {
    logProductActionError("deleteProductAction.productLookup", productLookupError);
    return { error: GENERIC_PRODUCT_DELETE_ERROR };
  }

  if (!product) {
    return {
      error: null,
      success: true,
      productId,
    };
  }

  const supabaseBaseUrlRaw = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!supabaseBaseUrlRaw) {
    logProductActionError("deleteProductAction.missingSupabaseUrlConfig", { code: "missing_supabase_url_config" });
    return { error: GENERIC_PRODUCT_DELETE_ERROR };
  }

  let validatedSupabaseOrigin: string;

  try {
    validatedSupabaseOrigin = new URL(supabaseBaseUrlRaw).origin;
  } catch {
    logProductActionError("deleteProductAction.invalidSupabaseUrlConfig", { code: "invalid_supabase_url_config" });
    return { error: GENERIC_PRODUCT_DELETE_ERROR };
  }

  const { data: imageRows, error: imagesLookupError } = await supabase
    .from("product_images")
    .select("url")
    .eq("product_id", productId);

  if (imagesLookupError) {
    logProductActionError("deleteProductAction.imagesLookup", imagesLookupError);
    return { error: GENERIC_PRODUCT_DELETE_ERROR };
  }

  const referencedStoragePaths = new Set<string>();

  for (const imageRow of imageRows ?? []) {
    const classification = classifyProductImageStorageUrl(imageRow.url, productId, validatedSupabaseOrigin);

    if (classification.kind === "unsafe") {
      logProductActionError("deleteProductAction.unsafeImageUrl", { code: "unsafe_managed_storage_url" });
      return { error: GENERIC_PRODUCT_DELETE_ERROR };
    }

    if (classification.kind === "managed") {
      referencedStoragePaths.add(classification.relativePath);
    }
  }

  const { data: deletedProduct, error: deleteError } = await supabase
    .from("products")
    .delete()
    .eq("id", productId)
    .select("id")
    .maybeSingle();

  if (deleteError) {
    if (deleteError.code === "23503") {
      return { error: PRODUCT_RFQ_REFERENCED_DELETE_ERROR };
    }

    logProductActionError("deleteProductAction.delete", deleteError);
    return { error: GENERIC_PRODUCT_DELETE_ERROR };
  }

  if (!deletedProduct) {
    const { data: confirmedAbsent, error: confirmationLookupError } = await supabase
      .from("products")
      .select("id")
      .eq("id", productId)
      .maybeSingle();

    if (confirmationLookupError) {
      logProductActionError("deleteProductAction.postDeleteConfirmationError", confirmationLookupError);
      return { error: GENERIC_PRODUCT_DELETE_ERROR };
    }

    if (confirmedAbsent) {
      logProductActionError("deleteProductAction.postDeleteConfirmationStillPresent", { code: "product_still_present_after_delete" });
      return { error: GENERIC_PRODUCT_DELETE_ERROR };
    }
  }


  const pathsToRemove = Array.from(referencedStoragePaths);

  if (pathsToRemove.length === 0) {
    return {
      error: null,
      success: true,
      productId,
    };
  }

  let storageCleanupFailed = false;

  try {
    const { error: storageRemoveError } = await supabase.storage
      .from("product-images")
      .remove(pathsToRemove);

    if (storageRemoveError) {
      storageCleanupFailed = true;
      logProductActionError("deleteProductAction.storageCleanup", { code: "storage_cleanup_failed" });
    }
  } catch {
    storageCleanupFailed = true;
    logProductActionError("deleteProductAction.storageCleanupThrew", { code: "storage_cleanup_threw" });
  }

  if (storageCleanupFailed) {
    return {
      error: null,
      success: true,
      productId,
      warning: "Product deleted, but some image files could not be removed from Storage. Manual cleanup may be required.",
    };
  }

  return {
    error: null,
    success: true,
    productId,
  };
}