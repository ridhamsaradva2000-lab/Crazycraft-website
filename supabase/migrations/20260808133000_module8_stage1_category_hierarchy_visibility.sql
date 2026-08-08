-- ============================================================================
-- Module 8 Stage 1 (revised) — Category hierarchy + visibility + safe-delete
-- Scope: database only. No public RLS/query changes (that is Stage 3).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Visibility flag. No IF NOT EXISTS -- fails loudly on unexpected drift
--    rather than silently no-op'ing if the column already exists.
-- ----------------------------------------------------------------------------
ALTER TABLE public.categories
  ADD COLUMN is_active boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.categories.is_active IS
  'Module 8: whether this category (Main or Subcategory) is enabled for public visibility. Existing rows default to true to preserve current visibility.';

-- ----------------------------------------------------------------------------
-- 2. Safe-delete: drop the two specific, known, PostgreSQL-generated
--    constraint names explicitly. If either name does not exist, this
--    migration FAILS LOUDLY rather than silently skipping -- unexpected
--    schema drift (e.g. a manually renamed constraint) must be surfaced,
--    not hidden.
-- ----------------------------------------------------------------------------
ALTER TABLE public.categories
  DROP CONSTRAINT categories_parent_id_fkey;

ALTER TABLE public.categories
  ADD CONSTRAINT categories_parent_id_fkey
  FOREIGN KEY (parent_id)
  REFERENCES public.categories(id)
  ON DELETE RESTRICT;

ALTER TABLE public.products
  DROP CONSTRAINT products_category_id_fkey;

ALTER TABLE public.products
  ADD CONSTRAINT products_category_id_fkey
  FOREIGN KEY (category_id)
  REFERENCES public.categories(id)
  ON DELETE RESTRICT;

-- ----------------------------------------------------------------------------
-- 3. Hierarchy validation trigger function.
--    search_path = '' (hardened project convention); every reference is
--    schema-qualified. The referenced parent row is locked FOR UPDATE
--    before its parent_id is inspected, to prevent two concurrent
--    parent-reassignments from each validating against stale state and
--    jointly producing an invalid hierarchy.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.categories_validate_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_parent_parent_id uuid;
  v_parent_found boolean := false;
BEGIN
  IF NEW.parent_id IS NOT NULL AND NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'A category cannot be its own parent (category id: %)', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.parent_id IS NOT NULL THEN
    SELECT true, parent_id
      INTO v_parent_found, v_parent_parent_id
      FROM public.categories
      WHERE id = NEW.parent_id
      FOR UPDATE;

    IF NOT v_parent_found THEN
      RAISE EXCEPTION 'Parent category % does not exist', NEW.parent_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_parent_parent_id IS NOT NULL THEN
      RAISE EXCEPTION 'Category % cannot be assigned under % because that category is itself a Subcategory (maximum hierarchy depth is Main Category -> Subcategory)', NEW.id, NEW.parent_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.parent_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.categories
    WHERE parent_id = NEW.id
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'Category % cannot become a Subcategory because it already has its own Subcategories', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.categories_validate_hierarchy() IS
  'Module 8: enforces a maximum two-level category hierarchy (Main -> Subcategory), rejects self-parenting, rejects assigning a Subcategory as a parent, and rejects turning a category with existing children into a Subcategory. Locks the referenced parent row (and any existing children of the candidate) FOR UPDATE to prevent concurrent parent-reassignments from jointly producing an invalid hierarchy. Internal trigger function only -- not a public RPC surface.';

REVOKE ALL ON FUNCTION public.categories_validate_hierarchy() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.categories_validate_hierarchy() FROM anon;
REVOKE ALL ON FUNCTION public.categories_validate_hierarchy() FROM authenticated;

DROP TRIGGER IF EXISTS trg_categories_validate_hierarchy ON public.categories;

CREATE TRIGGER trg_categories_validate_hierarchy
  BEFORE INSERT OR UPDATE OF parent_id ON public.categories
  FOR EACH ROW
  EXECUTE FUNCTION public.categories_validate_hierarchy();

-- ----------------------------------------------------------------------------
-- 4. Effective visibility helper. SECURITY DEFINER + search_path = '' so it
--    can evaluate category state directly against the underlying table,
--    bypassing categories' own RLS, and therefore be safely callable FROM
--    WITHIN categories' own future public SELECT RLS policy (Stage 3)
--    without causing recursive RLS evaluation. Returns only a boolean --
--    no category data is exposed through this function's return value.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_category_effectively_active(p_category_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    CASE
      WHEN p_category_id IS NULL THEN false
      ELSE COALESCE(
        (
          SELECT c.is_active AND (c.parent_id IS NULL OR COALESCE(p.is_active, false))
          FROM public.categories c
          LEFT JOIN public.categories p ON p.id = c.parent_id
          WHERE c.id = p_category_id
        ),
        false
      )
    END;
$$;

COMMENT ON FUNCTION public.is_category_effectively_active(uuid) IS
  'Module 8: returns true only if the given category is a Main Category with is_active=true, or a Subcategory with is_active=true whose Main Category also has is_active=true. Returns false for NULL or nonexistent category ids. SECURITY DEFINER with search_path = '''' so it can be safely called from within categories/products/product_images/product_variants public SELECT RLS policies (Stage 3) without recursively re-evaluating categories RLS. Returns only a boolean; exposes no category data. Not yet referenced by any RLS policy or application query -- wiring this in is Stage 3.';

REVOKE ALL ON FUNCTION public.is_category_effectively_active(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_category_effectively_active(uuid) TO anon, authenticated;