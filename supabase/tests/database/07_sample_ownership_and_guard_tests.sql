-- 07_sample_ownership_and_guard_tests.sql
-- Run via: supabase test db
-- Self-contained — creates its own quote_request fixtures rather than
-- relying on any other test file's (rolled-back) data.

begin;
select plan(14);

-- Fixture quote_requests owned by buyer one and buyer two respectively,
-- inserted as the default connecting role (bypasses grants/RLS).
insert into public.quote_requests (id, buyer_id, email, country)
values ('99999999-9999-9999-9999-999999999981', '44444444-4444-4444-4444-444444444444', 'buyer-one-qr@example.com', 'AU')
on conflict (id) do nothing;

insert into public.quote_requests (id, buyer_id, email, country)
values ('99999999-9999-9999-9999-999999999982', '55555555-5555-5555-5555-555555555555', 'buyer-two-qr@example.com', 'DE')
on conflict (id) do nothing;

-- ── authenticated buyer CAN link a sample to their OWN quote_request ────
set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
set local role authenticated;

select lives_ok(
  format(
    $$ select public.submit_sample_request(
         'Buyer One', 'buyer-one-sample@example.com', null, null, 'AU',
         '%s', 1, '99999999-9999-9999-9999-999999999981'
       ) $$,
    '99999999-9999-9999-9999-999999999992'
  ),
  'authenticated buyer can link a sample request to their OWN quote_request via submit_sample_request'
);

reset role;

-- Verified under the trusted default role, not the buyer's — after
-- Module 5 removed direct buyer SELECT access to samples entirely (see
-- that migration's own security-fix section), a buyer querying this
-- table directly would get no row at all, and `(select col from ...)`
-- with zero matching rows evaluates to NULL regardless of what the
-- column's actual value is — creating exactly the same false-positive
-- risk as checking "0 rows exist" from a role that can't see any rows
-- for an unrelated reason. Querying under the trusted role instead
-- genuinely proves what the RPC stored, not a side effect of buyer
-- visibility being gone.
select is(
  (select quote_request_id from public.samples where email = 'buyer-one-sample@example.com'),
  '99999999-9999-9999-9999-999999999981'::uuid,
  'the sample was actually linked to the correct owned quote_request'
);

set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
set local role authenticated;

-- ── authenticated buyer CANNOT link to ANOTHER buyer's quote_request ───
select throws_ok(
  format(
    $$ select public.submit_sample_request(
         'Buyer One', 'buyer-one-sample-2@example.com', null, null, 'AU',
         '%s', 1, '99999999-9999-9999-9999-999999999982'
       ) $$,
    '99999999-9999-9999-9999-999999999992'
  ),
  '42501',
  'You may only link a sample request to your own quote request',
  'authenticated buyer CANNOT link a sample request to buyer two''s quote_request — ownership verified and rejected'
);

-- Verified under the trusted default role, not the buyer's — the buyer
-- now gets zero rows from public.samples regardless of whether the
-- rejected linkage attempt actually created a row or not (buyer
-- base-table access is gone entirely), so checking as the buyer here
-- would prove nothing either way. The trusted role genuinely proves
-- non-creation.
reset role;

select is(
  (select count(*)::int from public.samples where email = 'buyer-one-sample-2@example.com'),
  0,
  'the rejected cross-buyer linkage attempt left no sample row behind at all'
);

-- ── authenticated buyer: direct INSERT into samples is gone entirely ────
-- Restoring the buyer role here — this next test specifically needs to
-- run AS the buyer (proving THEY, not some other role, cannot INSERT
-- directly).
set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
set local role authenticated;

select throws_ok(
  format(
    $$ insert into public.samples (buyer_id, name, email, country, product_id, requested_quantity)
       values ('44444444-4444-4444-4444-444444444444', 'Buyer One Direct', 'buyer-one-direct@example.com', 'AU', '%s', 1) $$,
    '99999999-9999-9999-9999-999999999992'
  ),
  '42501',
  null,
  'authenticated buyer cannot INSERT into samples directly at all — submit_sample_request() is the only creation path'
);

reset role;

-- ── draft (unpublished) products are rejected through the RPC too ──────
set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
set local role authenticated;

select throws_ok(
  format(
    $$ select public.submit_sample_request(
         'Buyer One', 'buyer-one-draft@example.com', null, null, 'AU',
         '%s', 1, null
       ) $$,
    '99999999-9999-9999-9999-999999999979'
  ),
  '23503',
  null,
  'submit_sample_request() rejects a draft (unpublished) product'
);

reset role;

-- ── guest (anon) CANNOT supply any quote_request_id at all ──────────────
-- Explicitly clear the leftover request.jwt.claim.sub from the previous
-- (buyer-one) block before switching to anon — reset role only resets
-- the Postgres ROLE, it does NOT clear custom GUCs set via SET LOCAL,
-- which remain in effect for the rest of this transaction otherwise.
-- Without this, auth.uid() would still return buyer one's uuid here,
-- silently defeating the whole point of this test.
select set_config('request.jwt.claim.sub', '', true);
set local role anon;

select throws_ok(
  format(
    $$ select public.submit_sample_request(
         'Guest Requester', 'guest-sample@example.com', null, null, 'US',
         '%s', 1, '99999999-9999-9999-9999-999999999981'
       ) $$,
    '99999999-9999-9999-9999-999999999992'
  ),
  '42501',
  'Only an authenticated buyer may link a sample request to a quote request',
  'guest (anon) cannot supply any quote_request_id — there is no session identity to verify a claim against'
);

reset role;

-- ── item 4: shipping_country is forced null on non-admin insert ────────
-- Verified under the trusted default role, not the buyer's — this check
-- only needs to confirm what submit_sample_request() actually stored, not
-- re-exercise buyer visibility (which no longer includes direct samples
-- access at all after Module 5's fix, making a buyer-session query here
-- evaluate to NULL either way — a real row with shipping_country IS
-- null, or no row visible at all — exactly the false-positive risk this
-- avoids by not switching roles for a check that doesn't need to).
select is(
  (
    select shipping_country from public.samples
    where email = 'buyer-one-sample@example.com'
  ),
  null,
  'shipping_country is forced to null on a non-admin sample insert (via submit_sample_request), even though the column was never referenced by the RPC'
);

-- ── buyer_samples view — the corrected buyer-facing samples design ─────
-- ── (Module 5): base-table access is gone entirely; ownership-scoped ────
-- ── visibility now comes from this explicit-column-list view instead.
set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
set local role authenticated;

select is(
  (select count(*)::int from public.samples where email = 'buyer-one-sample@example.com'),
  0,
  'buyer one gets zero rows querying samples directly, even for their own sample — base-table buyer access no longer exists at all'
);

select is(
  (select count(*)::int from public.buyer_samples where email = 'buyer-one-sample@example.com'),
  1,
  'buyer one CAN see their own sample through buyer_samples — the view''s own buyer_id = auth.uid() predicate does the ownership filtering'
);

reset role;
set local request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
set local role authenticated;

select is(
  (select count(*)::int from public.buyer_samples where email = 'buyer-one-sample@example.com'),
  0,
  'buyer two cannot see buyer one''s sample through buyer_samples — ownership filtering, not a blanket denial (buyer one''s own visibility was just proven above)'
);

reset role;

-- ── item 4: shipping_country is protected on UPDATE too ─────────────────
-- This is a TRIGGER-ISOLATION test, not an RLS test: samples has no buyer
-- UPDATE RLS policy at all (only "sales can update samples", gated by
-- has_admin_role('sales')), so switching to the buyer's authenticated role
-- would have the UPDATE's RLS USING clause filter the row out entirely —
-- the statement would then affect zero rows and raise NO exception at
-- all, making throws_ok fail for the wrong reason (no error, not the
-- right error). The previous revision of this test made exactly that
-- mistake (it also relied on a temporary grant that was never actually
-- needed for this purpose).
--
-- The correct way to test the TRIGGER specifically, independent of RLS,
-- is to stay under the default postgres/test-owner role (bypasses RLS,
-- so the row is visible and updatable) while setting only
-- request.jwt.claim.sub to the buyer's uuid. The trigger's
-- private.has_admin_role('sales') call reads auth.uid() from that claim
-- regardless of which Postgres role is actually executing the statement,
-- so it correctly evaluates "is the acting identity an admin?" as false
-- and raises its own exception — proving the trigger itself protects
-- shipping_country even with RLS out of the picture entirely.
reset role;
select set_config(
  'request.jwt.claim.sub',
  '44444444-4444-4444-4444-444444444444',
  true
);

select throws_ok(
  $$ update public.samples
     set shipping_country = 'US'
     where email = 'buyer-one-sample@example.com' $$,
  '42501',
  'Only an authorized admin may modify payment, shipping, tracking, status, or assignment fields on a sample request',
  'sample guard trigger rejects a non-admin shipping_country change (isolated from RLS by staying under the owner role)'
);

reset role;

-- ── sales admin CAN set shipping_country via the completed RPC ─────────
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set local role authenticated;

select lives_ok(
  $$ select public.admin_update_sample_status(
       (select id from public.samples where email = 'buyer-one-sample@example.com'),
       'approved'::public.sample_status, 'unpaid'::public.payment_status,
       '11111111-1111-1111-1111-111111111111', null, null, 0, 'USD',
       'US', '123 Admin St', 'LA Port'
     ) $$,
  'sales admin can set shipping_country (and other shipping fields) via admin_update_sample_status'
);

select is(
  (select shipping_country from public.samples where email = 'buyer-one-sample@example.com'),
  'US',
  'shipping_country was actually updated via the admin RPC'
);

reset role;

select * from finish();
rollback;
