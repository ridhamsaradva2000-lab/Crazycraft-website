-- 09_catalog_integrity_tests.sql
-- Run via: supabase test db
-- Runs as the default connecting role — these are structural constraints
-- on the catalog tables, not role/RLS behavior.
--
-- NOTE: this file needs at least one row in quote_requests to exercise
-- the product/variant consistency checks against quote_request_items. It
-- creates its own rather than depending on any other test file.

begin;
select plan(12);

insert into public.quote_requests (id, email, country)
values ('99999999-9999-9999-9999-999999999986', 'catalog-integrity-qr@example.com', 'US')
on conflict (id) do nothing;

-- ── canonical lowercase slug checks ──────────────────────────────────────
select throws_ok(
  $$ insert into public.categories (slug, name) values ('Uppercase-Slug', 'Bad Category') $$,
  '23514',
  null,
  'an uppercase category slug is rejected by the canonical-slug CHECK'
);

select throws_ok(
  $$ insert into public.collections (slug, name) values ('bad slug with spaces', 'Bad Collection') $$,
  '23514',
  null,
  'a collection slug containing spaces is rejected by the canonical-slug CHECK'
);

select throws_ok(
  $$ insert into public.products (slug, name) values ('bad_slug_underscore', 'Bad Product') $$,
  '23514',
  null,
  'a product slug using underscores instead of hyphens is rejected by the canonical-slug CHECK'
);

-- ── category self-parenting rejected ─────────────────────────────────────
do $$
declare
  v_cat_id uuid;
begin
  insert into public.categories (slug, name) values ('self-parent-test', 'Self Parent Test')
  returning id into v_cat_id;
  perform set_config('crazycraft_test.self_parent_cat_id', v_cat_id::text, true);
end $$;

select throws_ok(
  format(
    $$ update public.categories set parent_id = '%s' where id = '%s' $$,
    current_setting('crazycraft_test.self_parent_cat_id'),
    current_setting('crazycraft_test.self_parent_cat_id')
  ),
  '23514',
  null,
  'a category cannot be set as its own direct parent — rejected by the self-parent CHECK'
);

-- ── product_images.sort_order >= 0 ──────────────────────────────────────
select throws_ok(
  $$ insert into public.product_images (product_id, url, alt_text, sort_order)
     values ('99999999-9999-9999-9999-999999999992', 'https://example.com/neg.jpg', 'Negative sort order', -1) $$,
  '23514',
  null,
  'a negative sort_order on product_images is rejected by the CHECK'
);

-- ── SKU checks: non-blank and case-insensitive uniqueness ───────────────
select throws_ok(
  $$ insert into public.product_variants (product_id, variant_name, sku)
     values ('99999999-9999-9999-9999-999999999992', 'Blank SKU Variant', '   ') $$,
  '23514',
  null,
  'a whitespace-only SKU is rejected by the non-blank CHECK'
);

select lives_ok(
  $$ insert into public.product_variants (product_id, variant_name, sku)
     values ('99999999-9999-9999-9999-999999999992', 'SKU Variant A', 'ABC-123') $$,
  'a variant with a valid, non-blank SKU succeeds'
);

select throws_ok(
  $$ insert into public.product_variants (product_id, variant_name, sku)
     values ('99999999-9999-9999-9999-999999999992', 'SKU Variant B', 'abc-123') $$,
  '23505',
  null,
  'a differently-cased duplicate SKU is rejected by the case-insensitive unique index on sku_normalized'
);

-- ── only one primary image per product (uses its own product, distinct ──
-- ── from 05_integrity_constraints.sql's, so the two files never collide)─
insert into public.products (id, slug, name, status, category_id)
values ('99999999-9999-9999-9999-999999999980', 'catalog-test-product', 'Catalog Test Product', 'published', '99999999-9999-9999-9999-999999999991')
on conflict (id) do nothing;

select lives_ok(
  $$ insert into public.product_images (product_id, url, alt_text, is_primary)
     values ('99999999-9999-9999-9999-999999999980', 'https://example.com/c1.jpg', 'Catalog test image 1', true) $$,
  'first primary image for this product succeeds'
);

select throws_ok(
  $$ insert into public.product_images (product_id, url, alt_text, is_primary)
     values ('99999999-9999-9999-9999-999999999980', 'https://example.com/c2.jpg', 'Catalog test image 2', true) $$,
  '23505',
  null,
  'a second primary image for the same product is rejected by the partial unique index'
);

-- ── valid vs. mismatched product/variant combinations ───────────────────
select lives_ok(
  $$ insert into public.quote_request_items (quote_request_id, product_id, product_variant_id, quantity)
     values ('99999999-9999-9999-9999-999999999986', '99999999-9999-9999-9999-999999999992', '99999999-9999-9999-9999-999999999993', 1) $$,
  'a quote_request_item with a variant that genuinely belongs to the given product succeeds'
);

select throws_ok(
  $$ insert into public.quote_request_items (quote_request_id, product_id, product_variant_id, quantity)
     values ('99999999-9999-9999-9999-999999999986', '99999999-9999-9999-9999-999999999992', '88888888-1111-1111-1111-111111111111', 1) $$,
  '23503',
  null,
  'a quote_request_item pairing a product with a variant belonging to a DIFFERENT product is rejected by the composite FK'
);

select * from finish();
rollback;
