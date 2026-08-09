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
