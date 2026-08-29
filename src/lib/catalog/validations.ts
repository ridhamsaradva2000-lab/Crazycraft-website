import { z } from "zod";

/**
 * A native GET form submits an empty string for an unselected/"All ..."
 * <select> option (e.g. `category=""` for "All categories") — trimming
 * that down to "" and then applying the category/collection regex (which
 * requires at least one character) would incorrectly reject it as
 * invalid, when it actually just means "no filter." This preprocesses
 * empty/whitespace-only STRING values to `undefined` before the rest of
 * each field's schema runs, so that case is treated as "not provided,"
 * not as a validation error.
 *
 * A non-string value (e.g. a repeated query parameter like
 * `?category=a&category=b`, which Next.js delivers as a string ARRAY,
 * not a string) is returned unchanged here — it then fails the inner
 * `z.string()` type check itself and is safely REJECTED as a validation
 * error, rather than being silently coerced into some arbitrary joined
 * string.
 */
function normalizeEmptyString(value: unknown): unknown {
  if (typeof value === "string" && value.trim() === "") return undefined;
  return value;
}

/**
 * Products listing query params. Search is capped at 100 characters —
 * an oversized value is a validation ERROR (surfaced to the page as a
 * distinct state), never silently truncated or silently treated as "no
 * search," which would otherwise turn an invalid request into an
 * unfiltered "show everything" result — the same class of mistake
 * corrected in Module 5's samples search.
 */
export const productsQuerySchema = z.object({
  q: z.preprocess(
    normalizeEmptyString,
    z.string().trim().max(100, "Search must be 100 characters or fewer").optional()
  ),
  category: z.preprocess(
    normalizeEmptyString,
    z.string().trim().max(100).regex(/^[a-z0-9-]+$/, "Invalid category").optional()
  ),
  collection: z.preprocess(
    normalizeEmptyString,
    z.string().trim().max(100).regex(/^[a-z0-9-]+$/, "Invalid collection").optional()
  ),
  page: z.coerce.number().int().min(1).max(1000).optional().default(1),
});

export type ProductsQuery = z.infer<typeof productsQuerySchema>;

/**
 * Shared catalogue slug schema — the same canonical format enforced at
 * the database level, reused everywhere a slug is accepted from an
 * untrusted source (product/category/collection detail pages, and the
 * contact page's `?product=` context) so the validation rule lives in
 * exactly one place.
 */
export const catalogSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);


// ============================================================================
// Module 8 Stage 4 — Category Server Action validation schemas.
// catalogSlugSchema is reused exactly as-is for category slugs below; no
// new slug regex/schema is defined here.
// ============================================================================

export const categoryIdSchema = z
  .string()
  .uuid("Invalid category id.");

export const categoryNameSchema = z
  .string()
  .trim()
  .min(1, "Category name is required.")
  .max(200, "Category name must be 200 characters or fewer.");

export const parentIdSchema = z
  .string()
  .uuid("Invalid parent category.")
  .nullable();

export const createCategorySchema = z.object({
  name: categoryNameSchema,
  slug: catalogSlugSchema,
  parentId: parentIdSchema,
  isActive: z.boolean().optional().default(true),
});

// Raw, untrusted action-input boundary: isActive genuinely optional here.
export type CreateCategoryActionInput = z.input<typeof createCategorySchema>;

export const updateCategorySchema = z.object({
  categoryId: categoryIdSchema,
  name: categoryNameSchema,
  slug: catalogSlugSchema,
  parentId: parentIdSchema,
});

export type UpdateCategoryActionInput = z.input<typeof updateCategorySchema>;

export const setCategoryActiveSchema = z.object({
  categoryId: categoryIdSchema,
  isActive: z.boolean(),
});

export type SetCategoryActiveActionInput = z.input<typeof setCategoryActiveSchema>;

export const deleteCategorySchema = z.object({
  categoryId: categoryIdSchema,
});

export type DeleteCategoryActionInput = z.input<typeof deleteCategorySchema>;

// ============================================================================
// Module 8 Stage 6 — Product Server Action validation schemas.
// catalogSlugSchema is reused exactly as-is for product slugs; no new slug
// regex/schema is defined here.
// ============================================================================

export const productIdSchema = z
  .string()
  .uuid("Invalid product id.");

export const productNameSchema = z
  .string()
  .trim()
  .min(1, "Product name is required.");

/**
 * Authoritative, single source of truth for the database's product_status
 * enum ('draft', 'published', 'archived'), confirmed directly from the
 * migration defining the type. No other Product schema redefines these
 * values independently.
 */
export const productStatusSchema = z.enum(["draft", "published", "archived"]);

/**
 * category_id is nullable in the database. A future admin form's "No
 * category" option submits an empty string, not null/undefined -- this
 * preprocesses an empty or whitespace-only string to null before the
 * UUID check runs, so that case is accepted as "no category" rather
 * than rejected as an invalid UUID. Any other non-empty, malformed UUID
 * string is NOT preprocessed away and is correctly rejected by
 * .uuid().nullable().
 */
const productCategoryIdSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.string().uuid("Invalid category id.").nullable()
);

/**
 * MOQ is NOT nullable in the database (NOT NULL DEFAULT 1, CHECK >= 1).
 * A blank value is normalized to undefined so the (non-optional) number
 * schema below rejects it as missing -- never silently defaulted to 1
 * or coerced to 0. A malformed or fractional string is left unchanged
 * so it fails the underlying number/int check, rather than being
 * silently coerced.
 */
function preprocessRequiredInteger(value: unknown): unknown {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return undefined;
    if (!/^-?\d+$/.test(trimmed)) return trimmed;
    return Number(trimmed);
  }
  return value;
}

/**
 * lead_time_days and weight_grams are nullable (CHECK >= 0 when
 * present). A blank value is normalized to null, not undefined --
 * distinct from the MOQ behavior above, since these fields are
 * genuinely optional in the database.
 */
function preprocessNullableInteger(value: unknown): unknown {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    if (!/^-?\d+$/.test(trimmed)) return trimmed;
    return Number(trimmed);
  }
  return value;
}

export const productMoqSchema = z.preprocess(
  preprocessRequiredInteger,
  z.number().int("MOQ must be a whole number.").min(1, "MOQ must be at least 1.")
);

export const productLeadTimeDaysSchema = z.preprocess(
  preprocessNullableInteger,
  z
    .number()
    .int("Lead time must be a whole number.")
    .min(0, "Lead time cannot be negative.")
    .nullable()
    .optional()
);

export const productWeightGramsSchema = z.preprocess(
  preprocessNullableInteger,
  z
    .number()
    .int("Weight must be a whole number.")
    .min(0, "Weight cannot be negative.")
    .nullable()
    .optional()
);

/**
 * Normalizes an empty/whitespace-only string to null for the database's
 * nullable text columns. No max-length or format rule is imposed beyond
 * what the database itself already enforces (none, for these columns).
 */
function preprocessNullableText(value: unknown): unknown {
  if (typeof value === "string" && value.trim() === "") return null;
  return value;
}

const nullableProductTextSchema = z.preprocess(
  preprocessNullableText,
  z.string().nullable().optional()
);

export const createProductSchema = z.strictObject({
  name: productNameSchema,
  slug: catalogSlugSchema,
  description: nullableProductTextSchema,
  shortDescription: nullableProductTextSchema,
  categoryId: productCategoryIdSchema,
  moq: productMoqSchema,
  leadTimeDays: productLeadTimeDaysSchema,
  baseMaterial: nullableProductTextSchema,
  dimensions: nullableProductTextSchema,
  weightGrams: productWeightGramsSchema,
  hsCode: nullableProductTextSchema,
  isCustomizable: z.boolean(),
  customizationNotes: nullableProductTextSchema,
  metaTitle: nullableProductTextSchema,
  metaDescription: nullableProductTextSchema,
  status: productStatusSchema,
});

export type CreateProductActionInput = z.input<typeof createProductSchema>;

export const updateProductSchema = z.strictObject({
  productId: productIdSchema,
  name: productNameSchema,
  slug: catalogSlugSchema,
  description: nullableProductTextSchema,
  shortDescription: nullableProductTextSchema,
  categoryId: productCategoryIdSchema,
  moq: productMoqSchema,
  leadTimeDays: productLeadTimeDaysSchema,
  baseMaterial: nullableProductTextSchema,
  dimensions: nullableProductTextSchema,
  weightGrams: productWeightGramsSchema,
  hsCode: nullableProductTextSchema,
  isCustomizable: z.boolean(),
  customizationNotes: nullableProductTextSchema,
  metaTitle: nullableProductTextSchema,
  metaDescription: nullableProductTextSchema,
  status: productStatusSchema,
});

export type UpdateProductActionInput = z.input<typeof updateProductSchema>;

export const setProductStatusSchema = z.strictObject({
  productId: productIdSchema,
  status: productStatusSchema,
});

export type SetProductStatusActionInput = z.input<typeof setProductStatusSchema>;

export const deleteProductSchema = z.strictObject({
  productId: productIdSchema,
});

export type DeleteProductActionInput = z.input<typeof deleteProductSchema>;
// ============================================================================
// Module 8 Stage 6 Step 6 — Existing Variant + Collection assignment
// validation schemas. Reuses productIdSchema; no Category/Product schema
// above this point is altered.
// ============================================================================

export const variantIdSchema = z
  .string()
  .uuid("Invalid variant id.");

export const variantNameSchema = z
  .string()
  .trim()
  .min(1, "Variant name is required.");

/**
 * SKU is nullable in the database. Blank/whitespace-only input
 * normalizes to null; a genuinely non-empty value is trimmed (but not
 * lowercased -- the database's generated sku_normalized column remains
 * the sole authority for case-insensitive uniqueness comparisons).
 */
function preprocessSku(value: unknown): unknown {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  return value;
}

export const variantSkuSchema = z.preprocess(
  preprocessSku,
  z.string().nullable().optional()
);

// Reuses the existing nullableProductTextSchema exactly as-is (blank ->
// null, no invented max length) rather than duplicating that logic.
export const variantPriceNoteSchema = nullableProductTextSchema;

export const collectionIdSchema = z
  .string()
  .uuid("Invalid collection id.");

export const createProductVariantSchema = z.strictObject({
  productId: productIdSchema,
  variantName: variantNameSchema,
  sku: variantSkuSchema,
  priceNote: variantPriceNoteSchema,
});

export type CreateProductVariantActionInput = z.input<typeof createProductVariantSchema>;

export const updateProductVariantSchema = z.strictObject({
  productId: productIdSchema,
  variantId: variantIdSchema,
  variantName: variantNameSchema,
  sku: variantSkuSchema,
  priceNote: variantPriceNoteSchema,
});

export type UpdateProductVariantActionInput = z.input<typeof updateProductVariantSchema>;

export const deleteProductVariantSchema = z.strictObject({
  productId: productIdSchema,
  variantId: variantIdSchema,
});

export type DeleteProductVariantActionInput = z.input<typeof deleteProductVariantSchema>;

export const assignProductCollectionSchema = z.strictObject({
  productId: productIdSchema,
  collectionId: collectionIdSchema,
});

export type AssignProductCollectionActionInput = z.input<typeof assignProductCollectionSchema>;

export const unassignProductCollectionSchema = z.strictObject({
  productId: productIdSchema,
  collectionId: collectionIdSchema,
});

export type UnassignProductCollectionActionInput = z.input<typeof unassignProductCollectionSchema>;
// ============================================================================
// Module 8 Stage 6 Step 7 — Product Image upload validation (direct-to-
// Storage signed-upload architecture: image bytes travel Browser -> Supabase
// Storage directly via a browser-called uploadToSignedUrl(), never through a
// Server Action / Vercel Function). Reuses productIdSchema exactly as-is.
// Neither schema here accepts image bytes: prepare receives only declared
// metadata, and finalize receives only a path/metadata confirmation --
// finalize itself later re-downloads and re-inspects the real object.
// ============================================================================

const productImageMimeTypeSchema = z.enum(["image/jpeg", "image/png", "image/webp"]);

export const prepareProductImageUploadSchema = z.strictObject({
  productId: productIdSchema,
  declaredMimeType: productImageMimeTypeSchema,
  declaredFileSize: z.preprocess(
    preprocessRequiredInteger,
    z.number().int().min(1).max(10 * 1024 * 1024)
  ),
});

export type PrepareProductImageUploadActionInput = z.input<typeof prepareProductImageUploadSchema>;

export const finalizeProductImageUploadSchema = z.strictObject({
  productId: productIdSchema,
  objectPath: z.string().trim().min(1),
  declaredMimeType: productImageMimeTypeSchema,
  altText: z.string().trim(),
});

export type FinalizeProductImageUploadActionInput = z.input<typeof finalizeProductImageUploadSchema>;
// ============================================================================
// Module 8 Stage 6 Step 8 — Admin Product Images UI validation contracts.
// Reuses productIdSchema exactly as-is. Step-7 image upload schemas above
// this point are not modified.
// ============================================================================

export const productImageIdSchema = z
  .string()
  .uuid("Invalid image id.");

export const updateProductImageAltTextSchema = z.strictObject({
  productId: productIdSchema,
  imageId: productImageIdSchema,
  altText: z.string().trim(),
});

export type UpdateProductImageAltTextActionInput = z.input<typeof updateProductImageAltTextSchema>;

export const setProductImagePrimarySchema = z.strictObject({
  productId: productIdSchema,
  imageId: productImageIdSchema,
});

export type SetProductImagePrimaryActionInput = z.input<typeof setProductImagePrimarySchema>;

const moveProductImageDirectionSchema = z.enum(["up", "down"]);

export const moveProductImageSchema = z.strictObject({
  productId: productIdSchema,
  imageId: productImageIdSchema,
  direction: moveProductImageDirectionSchema,
});

export type MoveProductImageActionInput = z.input<typeof moveProductImageSchema>;

export const removeProductImageSchema = z.strictObject({
  productId: productIdSchema,
  imageId: productImageIdSchema,
});

export type RemoveProductImageActionInput = z.input<typeof removeProductImageSchema>;
