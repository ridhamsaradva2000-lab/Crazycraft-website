-- Remove committed catalog fixtures created by 00_fixtures.sql so they
-- never remain visible in the public storefront after the DB test suite.

create extension if not exists pgtap with schema extensions;

select plan(3);

delete from public.inquiries
where product_id in (
  '99999999-9999-9999-9999-999999999979',
  '99999999-9999-9999-9999-999999999992',
  '99999999-9999-9999-9999-999999999999'
);

delete from public.product_collections
where product_id in (
  '99999999-9999-9999-9999-999999999979',
  '99999999-9999-9999-9999-999999999992',
  '99999999-9999-9999-9999-999999999999'
);

delete from public.product_images
where product_id in (
  '99999999-9999-9999-9999-999999999979',
  '99999999-9999-9999-9999-999999999992',
  '99999999-9999-9999-9999-999999999999'
);

delete from public.product_variants
where product_id in (
  '99999999-9999-9999-9999-999999999979',
  '99999999-9999-9999-9999-999999999992',
  '99999999-9999-9999-9999-999999999999'
);

delete from public.quote_request_items
where product_id in (
  '99999999-9999-9999-9999-999999999979',
  '99999999-9999-9999-9999-999999999992',
  '99999999-9999-9999-9999-999999999999'
);

delete from public.samples
where product_id in (
  '99999999-9999-9999-9999-999999999979',
  '99999999-9999-9999-9999-999999999992',
  '99999999-9999-9999-9999-999999999999'
);

delete from public.saved_products
where product_id in (
  '99999999-9999-9999-9999-999999999979',
  '99999999-9999-9999-9999-999999999992',
  '99999999-9999-9999-9999-999999999999'
);

delete from public.products
where id in (
  '99999999-9999-9999-9999-999999999979',
  '99999999-9999-9999-9999-999999999992',
  '99999999-9999-9999-9999-999999999999'
);

delete from public.categories
where id = '99999999-9999-9999-9999-999999999991';

select is(
  (
    select count(*)::int
    from public.products
    where id in (
      '99999999-9999-9999-9999-999999999979',
      '99999999-9999-9999-9999-999999999992',
      '99999999-9999-9999-9999-999999999999'
    )
  ),
  0,
  'all committed catalog fixture products are removed'
);

select is(
  (
    select count(*)::int
    from public.product_variants
    where id in (
      '99999999-9999-9999-9999-999999999993',
      '88888888-1111-1111-1111-111111111111'
    )
  ),
  0,
  'all committed catalog fixture variants are removed'
);

select is(
  (
    select count(*)::int
    from public.categories
    where id = '99999999-9999-9999-9999-999999999991'
  ),
  0,
  'committed test category is removed'
);

select * from finish();