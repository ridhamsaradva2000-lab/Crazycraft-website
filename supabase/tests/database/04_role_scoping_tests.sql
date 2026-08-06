-- 04_role_scoping_tests.sql
-- Run via: supabase test db

begin;
select plan(23);

-- Fixture data for this file's own RPC exercises — inserted as the
-- default connecting role (bypasses RLS/grants), since these rows just
-- need to exist, not be created via a simulated session.
insert into public.quote_requests (id, email, country)
values ('99999999-9999-9999-9999-999999999994', 'role-test-qr@example.com', 'US')
on conflict (id) do nothing;

insert into public.samples (id, name, email, country, product_id, requested_quantity)
values ('99999999-9999-9999-9999-999999999995', 'Role Test Sample Requester', 'role-test-sample@example.com', 'US', '99999999-9999-9999-9999-999999999992', 2)
on conflict (id) do nothing;

insert into public.inquiries (id, name, email, country, business_type)
values ('99999999-9999-9999-9999-999999999996', 'Role Test Inquiry', 'role-test-inquiry@example.com', 'US', 'importer')
on conflict (id) do nothing;

insert into public.quote_request_items (id, quote_request_id, product_id, quantity)
values ('99999999-9999-9999-9999-999999999975', '99999999-9999-9999-9999-999999999994', '99999999-9999-9999-9999-999999999992', 5)
on conflict (id) do nothing;

insert into public.saved_products (id, buyer_id, product_id)
values ('99999999-9999-9999-9999-999999999976', '44444444-4444-4444-4444-444444444444', '99999999-9999-9999-9999-999999999992')
on conflict (id) do nothing;

-- ── sales admin ──────────────────────────────────────────────────────────
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set local role authenticated;

select lives_ok(
  $$ select count(*) from public.inquiries $$,
  'sales admin can SELECT from inquiries without a permission error (RLS admits the role)'
);

select lives_ok(
  $$ select public.admin_update_inquiry('99999999-9999-9999-9999-999999999996', 'contacted'::public.lead_status, 60, '11111111-1111-1111-1111-111111111111', null) $$,
  'sales admin can call admin_update_inquiry successfully'
);

select is(
  (select status from public.inquiries where id = '99999999-9999-9999-9999-999999999996'),
  'contacted'::public.lead_status,
  'the inquiry status actually updated via the RPC'
);

select lives_ok(
  $$ select public.admin_update_quote_request('99999999-9999-9999-9999-999999999994', 'quoted'::public.lead_status, 70, '11111111-1111-1111-1111-111111111111', null, 'internal note') $$,
  'sales admin can call admin_update_quote_request successfully'
);

select is(
  (select status from public.quote_requests where id = '99999999-9999-9999-9999-999999999994'),
  'quoted'::public.lead_status,
  'the quote_request status actually updated via the RPC'
);

select lives_ok(
  $$ select public.admin_update_sample_status(
       '99999999-9999-9999-9999-999999999995',
       'approved'::public.sample_status, 'unpaid'::public.payment_status,
       '11111111-1111-1111-1111-111111111111', null, null, 25.00, 'USD',
       'AU', '1 Test Street, Sydney', 'Sydney Port'
     ) $$,
  'sales admin can call admin_update_sample_status successfully, including the new shipping fields'
);

select is(
  (select shipping_country from public.samples where id = '99999999-9999-9999-9999-999999999995'),
  'AU',
  'shipping_country was set via admin_update_sample_status'
);

-- ── sales admin retains full access to the areas just narrowed from ────
-- ── is_admin() to has_admin_role('sales') (buyers, quote_request_items, ─
-- ── saved_products) — proving the narrowing didn't accidentally lock ───
-- ── sales out too. ───────────────────────────────────────────────────────
select is(
  (select count(*)::int from public.buyers where id in (
    '44444444-4444-4444-4444-444444444444', '55555555-5555-5555-5555-555555555555'
  )),
  2,
  'sales admin can still view all buyers (both fixture rows visible)'
);

select is(
  (select count(*)::int from public.quote_request_items where id = '99999999-9999-9999-9999-999999999975'),
  1,
  'sales admin can still view quote_request_items'
);

select lives_ok(
  $$ update public.quote_request_items set quantity = 9
     where id = '99999999-9999-9999-9999-999999999975' $$,
  'sales admin can still manage (update) quote_request_items directly'
);

select is(
  (select quantity from public.quote_request_items where id = '99999999-9999-9999-9999-999999999975'),
  9,
  'the sales admin''s quote_request_items update actually applied'
);

select is(
  (select count(*)::int from public.saved_products where id = '99999999-9999-9999-9999-999999999976'),
  1,
  'sales admin can still view saved_products'
);

-- ── editor ───────────────────────────────────────────────────────────────
reset role;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set local role authenticated;

select lives_ok(
  $$ insert into public.blog_posts (slug, title, content, status)
     values ('editor-test-post', 'Editor Test Post', 'Body content', 'draft') $$,
  'editor CAN insert/manage blog_posts'
);

select throws_ok(
  $$ select public.admin_update_inquiry('99999999-9999-9999-9999-999999999996', 'won'::public.lead_status, 90, null, null) $$,
  '42501',
  'Only an authorized admin may update inquiry management fields',
  'editor cannot call admin_update_inquiry — has_admin_role(''sales'') is false for editor'
);

select throws_ok(
  $$ select public.admin_verify_buyer('55555555-5555-5555-5555-555555555555', true) $$,
  '42501',
  'Only an authorized admin may verify a buyer account',
  'editor cannot call admin_verify_buyer either — sales-only action'
);

select is(
  (select count(*)::int from public.inquiries),
  0,
  'editor SELECT on inquiries returns zero rows (RLS filters, not an error — grant exists but has_admin_role(''sales'') is false)'
);

-- ── editor cannot view buyer CRM records ────────────────────────────────
-- Two real buyer rows exist (fixtures from 00_fixtures.sql, committed) —
-- this proves the zero-count below is RLS filtering, not an absence of data.
select is(
  (select count(*)::int from public.buyers),
  0,
  'editor cannot view any buyers — is_admin() narrowed to has_admin_role(''sales'') correctly excludes editor'
);

-- ── editor cannot view quote_request_items ──────────────────────────────
-- A real fixture row (created above, before any role switching) exists —
-- this proves the zero-count below is RLS filtering, not a missing row.
select is(
  (select count(*)::int from public.quote_request_items where id = '99999999-9999-9999-9999-999999999975'),
  0,
  'editor cannot view quote_request_items — the fixture row genuinely exists but is filtered out by RLS'
);

-- ── editor cannot INSERT quote_request_items (RLS violation, raises) ───
select throws_ok(
  $$ insert into public.quote_request_items (quote_request_id, product_id, quantity)
     values ('99999999-9999-9999-9999-999999999994', '99999999-9999-9999-9999-999999999992', 1) $$,
  '42501',
  null,
  'editor cannot INSERT into quote_request_items — RLS WITH CHECK violation'
);

-- ── editor cannot UPDATE quote_request_items (RLS filters to zero rows, ─
-- ── which does NOT raise an exception — it silently affects nothing) ───
select lives_ok(
  $$ update public.quote_request_items set quantity = 999
     where id = '99999999-9999-9999-9999-999999999975' $$,
  'editor''s UPDATE on quote_request_items raises no exception (RLS just filters the row, it does not error)'
);

-- ── editor cannot DELETE quote_request_items (same no-op pattern) ──────
select lives_ok(
  $$ delete from public.quote_request_items where id = '99999999-9999-9999-9999-999999999975' $$,
  'editor''s DELETE on quote_request_items raises no exception (RLS just filters the row, it does not error)'
);

-- Verification of both no-ops happens under the setup/superuser context —
-- the editor role has zero SELECT visibility on this table (that's the
-- point being proven), so checking the outcome while still "as editor"
-- would just see NULL/no-rows and prove nothing meaningful either way.
reset role;

select is(
  (select quantity from public.quote_request_items where id = '99999999-9999-9999-9999-999999999975'),
  9,
  'the editor''s UPDATE did NOT actually change the row (still 9, from the sales admin''s earlier update in this same transaction) — RLS made it a no-op, not a real update'
);

select ok(
  exists (select 1 from public.quote_request_items where id = '99999999-9999-9999-9999-999999999975'),
  'the row still exists after editor''s DELETE attempt — RLS made it a no-op, not a real delete'
);

select * from finish();
rollback;
