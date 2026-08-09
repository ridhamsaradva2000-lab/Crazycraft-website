-- ============================================================================
-- Module 8 Stage 4 — Category hierarchy/visibility/authorization/safe-delete
-- regression coverage (pgTAP).
--
-- Scope note: 09_catalog_integrity_tests.sql already covers baseline slug
-- validity and category-creation self-parent rejection. This file focuses on
-- Stage 1/3/4-specific behavior not already covered there: role-based
-- category-mutation authorization (all three admin roles, per Stage 4's
-- explicit no-role-restriction decision), inactive-Main-as-valid-parent,
-- Main-with-children cannot become a Subcategory, updated_at trigger
-- authority, the full Stage 3 effective-visibility contract as exercised
-- through REAL authenticated-admin category enable/disable, and FK RESTRICT
-- safe-delete behavior.
--
-- Ordering note: 12_cleanup_catalog_fixtures.sql (which runs before this
-- file, numerically) removes the committed catalog fixtures created in
-- 00_fixtures.sql. This file therefore creates ALL of its own category/
-- product fixtures inside its own transaction and depends only on the
-- fixed admin/buyer identities from 00_fixtures.sql, which cleanup does
-- not remove:
--   11111111-1111-1111-1111-111111111111 = sales
--   22222222-2222-2222-2222-222222222222 = editor
--   33333333-3333-3333-3333-333333333333 = super_admin
--   44444444-4444-4444-4444-444444444444 = buyer
--
-- Everything in this file runs inside one transaction and is rolled back
-- at the end -- no committed Stage 4 test data is left behind.
--
-- Assumption flagged explicitly: the default (non-role-switched) session
-- role used for fixture setup in this file is assumed to bypass RLS
-- (consistent with 00_fixtures.sql itself being able to insert committed
-- admin_users/catalog rows directly). If this assumption is wrong, the
-- setup statements below will fail loudly with an explicit RLS/permission
-- error rather than silently producing an incorrect result.
-- ============================================================================

begin;

select plan(42);

-- ----------------------------------------------------------------------------
-- SECTION A -- AUTHORIZATION / RLS (assertions 1-5)
-- ----------------------------------------------------------------------------

set local role anon;
select throws_ok(
  $$ insert into public.categories (name, slug) values ('Stage4 Anon Attempt', 'zzstage4test-anon-attempt') $$,
  '42501',
  null,
  'anon cannot insert into categories'
);
reset role;

set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
set local role authenticated;
select throws_ok(
  $$ insert into public.categories (name, slug) values ('Stage4 Buyer Attempt', 'zzstage4test-buyer-attempt') $$,
  '42501',
  null,
  'authenticated buyer (non-admin) cannot insert into categories'
);
reset role;

set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set local role authenticated;
select lives_ok(
  $$ insert into public.categories (name, slug) values ('Stage4 Sales Test', 'zzstage4test-sales-auth') $$,
  'sales admin CAN insert into categories under current all-admin authorization model'
);
reset role;

set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set local role authenticated;
select lives_ok(
  $$ insert into public.categories (name, slug) values ('Stage4 Editor Test', 'zzstage4test-editor-auth') $$,
  'editor admin CAN insert into categories under current all-admin authorization model'
);
reset role;

set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set local role authenticated;
select lives_ok(
  $$ insert into public.categories (name, slug) values ('Stage4 Super Admin Test', 'zzstage4test-superadmin-auth') $$,
  'super_admin CAN insert into categories under current all-admin authorization model'
);
reset role;

-- Back to default (bypass-RLS) role for the remainder of setup/assertions.

-- ----------------------------------------------------------------------------
-- SECTION B -- CREATE / HIERARCHY (assertions 6-14)
-- ----------------------------------------------------------------------------

select lives_ok(
  $$ insert into public.categories (name, slug, parent_id) values ('Stage4 Main H1', 'zzstage4test-main-h1', null) $$,
  'create Main Category (parent_id null) succeeds'
);

select lives_ok(
  $$ insert into public.categories (name, slug, parent_id)
     select 'Stage4 Sub H1', 'zzstage4test-sub-h1', id from public.categories where slug = 'zzstage4test-main-h1' $$,
  'create Subcategory under an active Main Category succeeds'
);

insert into public.categories (name, slug, parent_id, is_active)
values ('Stage4 Main Inactive', 'zzstage4test-main-inactive', null, false);

select lives_ok(
  $$ insert into public.categories (name, slug, parent_id)
     select 'Stage4 Sub Under Inactive', 'zzstage4test-sub-under-inactive', id
     from public.categories where slug = 'zzstage4test-main-inactive' $$,
  'create Subcategory under an INACTIVE Main Category succeeds structurally (hierarchy and visibility are separate concerns)'
);

select is(
  private.is_category_effectively_active(
    (select id from public.categories where slug = 'zzstage4test-sub-under-inactive')
  ),
  false,
  'a structurally-valid Subcategory under an inactive Main Category is correctly reported as NOT effectively active'
);

select throws_ok(
  $$ insert into public.categories (name, slug, parent_id)
     select 'Stage4 Third Level', 'zzstage4test-third-level', id
     from public.categories where slug = 'zzstage4test-sub-h1' $$,
  '23514',
  null,
  'creating a category under an existing Subcategory (third level) is rejected by the hierarchy trigger'
);

select throws_ok(
  $$ update public.categories set parent_id = id where slug = 'zzstage4test-main-h1' $$,
  '23514',
  null,
  'setting a category as its own parent is rejected by the hierarchy trigger'
);

select throws_ok(
  $$ insert into public.categories (name, slug, parent_id)
     values ('Stage4 Nonexistent Parent', 'zzstage4test-nonexistent-parent', '00000000-0000-0000-0000-000000000000') $$,
  '23503',
  null,
  'creating a category with a nonexistent parent_id is rejected'
);

select throws_ok(
  $$ insert into public.categories (name, slug, parent_id) values ('Stage4 Dup Slug', 'zzstage4test-main-h1', null) $$,
  '23505',
  null,
  'creating a category with a slug that already exists is rejected by the unique constraint'
);

select is(
  (select count(*)::int from public.categories where slug = 'zzstage4test-main-h1'),
  1,
  'the failed duplicate-slug insert attempt did not create a second row'
);

-- ----------------------------------------------------------------------------
-- SECTION C -- UPDATE (assertions 15-23)
-- ----------------------------------------------------------------------------

insert into public.categories (name, slug, parent_id) values ('Stage4 Main H2', 'zzstage4test-main-h2', null);

select lives_ok(
  $$ update public.categories set name = 'Stage4 Main H1 Renamed' where slug = 'zzstage4test-main-h1' $$,
  'renaming a category succeeds'
);
select is(
  (select name from public.categories where slug = 'zzstage4test-main-h1'),
  'Stage4 Main H1 Renamed',
  'the renamed category reflects the new name'
);

select lives_ok(
  $$ update public.categories set slug = 'zzstage4test-main-h1-renamed-slug' where slug = 'zzstage4test-main-h1' $$,
  'changing a category slug succeeds'
);
select is(
  (select slug from public.categories where name = 'Stage4 Main H1 Renamed'),
  'zzstage4test-main-h1-renamed-slug',
  'the category now resolves under its new slug'
);

select lives_ok(
  $$ update public.categories set parent_id =
       (select id from public.categories where slug = 'zzstage4test-main-h2')
     where slug = 'zzstage4test-sub-h1' $$,
  'moving a Subcategory from Main A to Main B succeeds'
);
select is(
  (select parent_id from public.categories where slug = 'zzstage4test-sub-h1'),
  (select id from public.categories where slug = 'zzstage4test-main-h2'),
  'the moved Subcategory now points at its new parent'
);

-- Stage4 Main H2 currently has zzstage4test-sub-h1 as a child (just moved
-- above), so attempting to convert Main H2 itself into a Subcategory must
-- be rejected.
select throws_ok(
  $$ update public.categories set parent_id =
       (select id from public.categories where slug = 'zzstage4test-main-h1-renamed-slug')
     where slug = 'zzstage4test-main-h2' $$,
  '23514',
  null,
  'a category that currently has children cannot be converted into a Subcategory'
);

-- updated_at DB-trigger authority: proven by attempting to manually
-- supply a sentinel value and confirming the trigger overrides it. This
-- avoids relying on now() advancing within the same transaction (which
-- it would not, since now() is transaction-timestamp-stable in
-- PostgreSQL), and works regardless of whether set_updated_at() uses
-- now() or clock_timestamp() internally.
select lives_ok(
  $$ update public.categories
     set name = 'Stage4 Main H1 UpdatedAt Check', updated_at = '2000-01-01T00:00:00Z'::timestamptz
     where slug = 'zzstage4test-main-h1-renamed-slug' $$,
  'update with a manually-supplied updated_at value executes without error'
);
select isnt(
  (select updated_at from public.categories where slug = 'zzstage4test-main-h1-renamed-slug')::text,
  '2000-01-01T00:00:00Z'::timestamptz::text,
  'trg_categories_updated_at overrides any manually-supplied updated_at value, confirming it remains DB-trigger-managed'
);

-- ----------------------------------------------------------------------------
-- SECTION D -- TOGGLE / STAGE 3 PUBLIC VISIBILITY, MUTATED VIA REAL
-- AUTHENTICATED ADMIN RLS (assertions 24-39)
-- ----------------------------------------------------------------------------

insert into public.categories (name, slug, parent_id, is_active) values ('Stage4 Vis Main', 'zzstage4test-vis-main', null, true);
insert into public.categories (name, slug, parent_id, is_active)
  select 'Stage4 Vis Sub', 'zzstage4test-vis-sub', id, true from public.categories where slug = 'zzstage4test-vis-main';
insert into public.products (name, slug, category_id, status)
  select 'Stage4 Vis Product', 'zzstage4test-vis-product', id, 'published'
  from public.categories where slug = 'zzstage4test-vis-sub';

set local role anon;
select ok(
  (select count(*) = 1 from public.categories where slug = 'zzstage4test-vis-main'),
  'active Main Category is visible to anon'
);
select ok(
  (select count(*) = 1 from public.categories where slug = 'zzstage4test-vis-sub'),
  'active Subcategory under an active Main is visible to anon'
);
select ok(
  (select count(*) = 1 from public.products where slug = 'zzstage4test-vis-product'),
  'published product in an effectively-active category is visible to anon'
);
reset role;

-- Real authenticated admin (sales) disables the Main Category, via the
-- exact same RLS boundary a Server Action would go through.
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set local role authenticated;
select lives_ok(
  $$ update public.categories set is_active = false where slug = 'zzstage4test-vis-main' $$,
  'authenticated admin (sales) can disable the Main Category via RLS-protected UPDATE'
);
reset role;

set local role anon;
select ok(
  (select count(*) = 0 from public.categories where slug = 'zzstage4test-vis-main'),
  'disabling the Main Category (by an authenticated admin) makes it invisible to anon'
);
select ok(
  (select count(*) = 0 from public.categories where slug = 'zzstage4test-vis-sub'),
  'the child Subcategory (own is_active still true) also becomes invisible to anon once its Main is disabled'
);
select ok(
  (select count(*) = 0 from public.products where slug = 'zzstage4test-vis-product'),
  'the published product beneath the disabled Main becomes invisible to anon'
);
reset role;

set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set local role authenticated;
select lives_ok(
  $$ update public.categories set is_active = true where slug = 'zzstage4test-vis-main' $$,
  'authenticated admin (sales) can re-enable the Main Category via RLS-protected UPDATE'
);
reset role;

set local role anon;
select ok(
  (select count(*) = 1 from public.categories where slug = 'zzstage4test-vis-main'),
  're-enabling the Main Category restores its own public visibility'
);
select ok(
  (select count(*) = 1 from public.categories where slug = 'zzstage4test-vis-sub'),
  're-enabling the Main Category restores the child Subcategory''s public visibility'
);
select ok(
  (select count(*) = 1 from public.products where slug = 'zzstage4test-vis-product'),
  're-enabling the Main Category restores the product''s public visibility'
);
reset role;

set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set local role authenticated;
select lives_ok(
  $$ update public.categories set is_active = false where slug = 'zzstage4test-vis-sub' $$,
  'authenticated admin (sales) can disable the Subcategory directly via RLS-protected UPDATE'
);
reset role;

set local role anon;
select ok(
  (select count(*) = 0 from public.categories where slug = 'zzstage4test-vis-sub'),
  'disabling the Subcategory directly (Main remains active) makes it invisible to anon'
);
select ok(
  (select count(*) = 0 from public.products where slug = 'zzstage4test-vis-product'),
  'the product under the directly-disabled Subcategory becomes invisible to anon'
);
reset role;

set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set local role authenticated;
select lives_ok(
  $$ update public.categories set is_active = true where slug = 'zzstage4test-vis-sub' $$,
  'authenticated admin (sales) can re-enable the Subcategory directly via RLS-protected UPDATE'
);
reset role;

set local role anon;
select ok(
  (select count(*) = 1 from public.categories where slug = 'zzstage4test-vis-sub'),
  're-enabling the Subcategory directly restores its own visibility to anon'
);
reset role;

-- ----------------------------------------------------------------------------
-- SECTION E -- DELETE / FK SAFETY (assertions 40-42)
-- ----------------------------------------------------------------------------

select throws_ok(
  $$ delete from public.categories where slug = 'zzstage4test-vis-main' $$,
  '23503',
  null,
  'deleting a Main Category that still has a Subcategory is rejected by FK RESTRICT'
);

select throws_ok(
  $$ delete from public.categories where slug = 'zzstage4test-vis-sub' $$,
  '23503',
  null,
  'deleting a category that still has a product assigned is rejected by FK RESTRICT'
);

insert into public.categories (name, slug, parent_id) values ('Stage4 Empty Deletable', 'zzstage4test-empty-deletable', null);

set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set local role authenticated;
select lives_ok(
  $$ delete from public.categories where slug = 'zzstage4test-empty-deletable' $$,
  'an authenticated admin (sales) can delete a category with no children and no products'
);
reset role;

-- ----------------------------------------------------------------------------
select * from finish();
rollback;