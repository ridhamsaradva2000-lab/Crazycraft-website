-- 00_fixtures.sql
--
-- Creates the fixed set of test identities and data used by every other
-- test file. Committed (not rolled back) — 01/02/03/04/05/06 all reference
-- these same hardcoded ids and nothing else, so no test file depends on
-- data created by another test file (each of 02-06 wraps its own
-- assertions in BEGIN/ROLLBACK). This fixes the previous bug where
-- 06_submit_quote_request_rpc.sql referenced a second product/variant that
-- only existed inside 05_integrity_constraints.sql's rolled-back
-- transaction — both files now reference the same rows created here.
--
-- CAVEAT (flagged honestly): the auth.users INSERT uses a reduced column
-- set believed to cover the smallest currently-required set for
-- Supabase's auth schema (instance_id, id, aud, role, email,
-- encrypted_password, email_confirmed_at, raw_app_meta_data,
-- raw_user_meta_data, created_at, updated_at — dropping
-- confirmation_token/email_change/email_change_token_new/recovery_token,
-- which have empty-string defaults in Supabase's schema). This was
-- written without the ability to run it against a real instance — if your
-- project's auth.users schema still rejects something, either adjust the
-- column list or switch to the community `supabase_test_helpers`
-- extension's `tests.create_supabase_user()`, which wraps this operation safely.
--
-- pgcrypto's crypt()/gen_salt() are called schema-qualified
-- (extensions.crypt / extensions.gen_salt) rather than relying on
-- search_path resolution — config.toml's extra_search_path includes
-- "extensions" for convenience elsewhere, but these specific calls don't
-- depend on it.
--
-- Test user ids (fixed, not random):
--   11111111-... = sales admin
--   22222222-... = editor admin
--   33333333-... = super_admin
--   44444444-... = buyer one
--   55555555-... = buyer two
-- Fixture data ids use the 99999999-... namespace (plus one
-- 88888888-1111-... variant), kept deliberately separate from seed.sql's
-- demo data (88888888-8888-... namespace) so the two never collide if
-- both are ever applied to the same database.

create extension if not exists pgtap with schema extensions;
create extension if not exists pgcrypto with schema extensions;

select plan(12);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'sales@test.crazycraft.dev',
   extensions.crypt('test-password-not-real', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'editor@test.crazycraft.dev',
   extensions.crypt('test-password-not-real', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333',
   'authenticated', 'authenticated', 'superadmin@test.crazycraft.dev',
   extensions.crypt('test-password-not-real', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-4444-444444444444',
   'authenticated', 'authenticated', 'buyer-one@test.crazycraft.dev',
   extensions.crypt('test-password-not-real', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '55555555-5555-5555-5555-555555555555',
   'authenticated', 'authenticated', 'buyer-two@test.crazycraft.dev',
   extensions.crypt('test-password-not-real', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now())
on conflict (id) do nothing;

select is(
  (select count(*)::int from auth.users where id in (
    '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
    '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444',
    '55555555-5555-5555-5555-555555555555'
  )),
  5,
  'all 5 fixture auth.users rows exist'
);

insert into public.admin_users (id, full_name, role) values
  ('11111111-1111-1111-1111-111111111111', 'Test Sales Admin', 'sales'),
  ('22222222-2222-2222-2222-222222222222', 'Test Editor Admin', 'editor'),
  ('33333333-3333-3333-3333-333333333333', 'Test Super Admin', 'super_admin')
on conflict (id) do nothing;

select is(
  (select role from public.admin_users where id = '11111111-1111-1111-1111-111111111111'),
  'sales'::public.admin_role,
  'fixture sales admin has role = sales'
);

select is(
  (select role from public.admin_users where id = '22222222-2222-2222-2222-222222222222'),
  'editor'::public.admin_role,
  'fixture editor admin has role = editor'
);

select is(
  (select role from public.admin_users where id = '33333333-3333-3333-3333-333333333333'),
  'super_admin'::public.admin_role,
  'fixture super admin has role = super_admin'
);

-- Inserted as the connecting superuser role (this file runs outside any
-- simulated anon/authenticated session), so RLS/guard triggers don't
-- apply here — verified is deliberately false; the actual proof that
-- buyers can't set it themselves lives in 03_buyer_and_verified_field_tests.sql.
insert into public.buyers (id, company_name, business_type, country, verified) values
  ('44444444-4444-4444-4444-444444444444', 'Test Buyer One Pty Ltd', 'importer', 'AU', false),
  ('55555555-5555-5555-5555-555555555555', 'Test Buyer Two GmbH', 'distributor', 'DE', false)
on conflict (id) do nothing;

select is(
  (select count(*)::int from public.buyers where id in (
    '44444444-4444-4444-4444-444444444444', '55555555-5555-5555-5555-555555555555'
  )),
  2,
  'both fixture buyer rows exist'
);

insert into public.categories (id, slug, name) values
  ('99999999-9999-9999-9999-999999999991', 'test-category', 'Test Category')
on conflict (id) do nothing;

select ok(
  exists (select 1 from public.categories where id = '99999999-9999-9999-9999-999999999991'),
  'fixture test category exists'
);

insert into public.products (id, slug, name, status, category_id) values
  ('99999999-9999-9999-9999-999999999992', 'test-product', 'Test Product', 'published', '99999999-9999-9999-9999-999999999991')
on conflict (id) do nothing;

select ok(
  exists (select 1 from public.products where id = '99999999-9999-9999-9999-999999999992' and status = 'published'),
  'fixture published test product exists'
);

insert into public.product_variants (id, product_id, variant_name) values
  ('99999999-9999-9999-9999-999999999993', '99999999-9999-9999-9999-999999999992', 'Test Variant A')
on conflict (id) do nothing;

select is(
  (select product_id from public.product_variants where id = '99999999-9999-9999-9999-999999999993'),
  '99999999-9999-9999-9999-999999999992'::uuid,
  'fixture product variant belongs to the fixture product'
);

-- Second published product + a variant that belongs to IT, not the first
-- product. Used by both 05_integrity_constraints.sql (product/variant
-- mismatch test) and 06_submit_quote_request_rpc.sql (mismatch test via
-- the RPC, and the multi-item valid-submission test) — committed here so
-- neither file depends on data created inside the other's rolled-back
-- transaction.
insert into public.products (id, slug, name, status, category_id) values
  ('99999999-9999-9999-9999-999999999999', 'test-product-two', 'Test Product Two', 'published', '99999999-9999-9999-9999-999999999991')
on conflict (id) do nothing;

select ok(
  exists (select 1 from public.products where id = '99999999-9999-9999-9999-999999999999' and status = 'published'),
  'fixture second published test product exists'
);

insert into public.product_variants (id, product_id, variant_name) values
  ('88888888-1111-1111-1111-111111111111', '99999999-9999-9999-9999-999999999999', 'Other Product Variant')
on conflict (id) do nothing;

select is(
  (select product_id from public.product_variants where id = '88888888-1111-1111-1111-111111111111'),
  '99999999-9999-9999-9999-999999999999'::uuid,
  'fixture second variant belongs to the second product, NOT the first — the exact mismatch pair used in later tests'
);

select is(
  (select category_id from public.products where id = '99999999-9999-9999-9999-999999999999'),
  '99999999-9999-9999-9999-999999999991'::uuid,
  'fixture second product is correctly linked to the fixture category'
);

-- A draft (unpublished) product, shared by the inquiry product-reference
-- tests (02_) and the sample-RPC draft-product rejection test (07_) —
-- committed here so neither file needs its own copy.
insert into public.products (id, slug, name, status, category_id) values
  ('99999999-9999-9999-9999-999999999979', 'draft-fixture-product', 'Draft Fixture Product', 'draft', '99999999-9999-9999-9999-999999999991')
on conflict (id) do nothing;

select ok(
  exists (select 1 from public.products where id = '99999999-9999-9999-9999-999999999979' and status = 'draft'),
  'fixture draft (unpublished) product exists'
);

select * from finish();
