-- 03_buyer_and_verified_field_tests.sql
-- Run via: supabase test db
--
-- Consistent strategy for `buyers.verified` (per correction): it is
-- excluded from the authenticated INSERT/UPDATE grant entirely. A buyer's
-- attempt to touch it — in either an INSERT or an UPDATE — fails with a
-- PLAIN Postgres permission-denied error at the GRANT layer, before RLS or
-- the guard trigger ever evaluate anything. The guard trigger
-- (trg_buyers_guard_update) is real defense in depth, not the primary
-- mechanism — its own custom exception message is only reachable if the
-- grant is ever loosened. This file tests both: the actual current
-- behavior (grant-blocked, generic error), AND the trigger's behavior in
-- isolation, by temporarily re-adding the grant inside this rolled-back
-- transaction to prove the trigger still catches it if that ever happens.
--
-- Identity is set via the official request.jwt.claim.sub GUC (what
-- auth.uid() actually reads), not a hand-built request.jwt.claims JSON blob.

begin;
select plan(14);

-- Fixture: a real quote_request owned by buyer two, created under the
-- default/superuser context (bypasses RLS/grants) BEFORE any role
-- switching below. The previous revision's cross-buyer test checked that
-- buyer one saw zero rows for buyer two's quote_requests, but no such row
-- actually existed — a false positive, since zero rows would show up
-- either way. This fixture makes the test meaningful.
insert into public.quote_requests (id, buyer_id, email, country)
values ('99999999-9999-9999-9999-999999999978', '55555555-5555-5555-5555-555555555555', 'buyer-two-cross-test@example.com', 'DE')
on conflict (id) do nothing;

select ok(
  exists (
    select 1 from public.quote_requests
    where id = '99999999-9999-9999-9999-999999999978' and buyer_id = '55555555-5555-5555-5555-555555555555'
  ),
  'the fixture quote_request owned by buyer two genuinely exists (verified under the setup/superuser context)'
);

set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
set local role authenticated;

-- ── buyer: cannot name "verified" in an INSERT at all (grant-blocked) ──
select throws_ok(
  $$ insert into public.buyers (id, company_name, business_type, country, verified)
     values ('44444444-4444-4444-4444-444444444444', 'Should Not Matter', 'importer', 'AU', true)
     on conflict (id) do nothing $$,
  '42501',
  null, -- generic permission-denied, NOT a custom trigger message — the grant blocks this before any trigger runs
  'buyer cannot name "verified" in a buyers INSERT — blocked at the GRANT layer, not the trigger'
);

-- ── buyer: UPDATE touching verified fails with a plain permission error ─
select throws_ok(
  $$ update public.buyers set verified = true, phone = '+61-000-000' where id = '44444444-4444-4444-4444-444444444444' $$,
  '42501',
  null, -- generic permission-denied — verified isn't in the UPDATE grant, so this never reaches the trigger
  'buyer UPDATE touching verified fails at the GRANT layer with a plain permission-denied error'
);

select is(
  (select verified from public.buyers where id = '44444444-4444-4444-4444-444444444444'),
  false,
  'verified remains false after the rejected UPDATE attempt'
);

-- ── buyer: a legitimate self-update with no protected fields succeeds ──
select lives_ok(
  $$ update public.buyers set phone = '+61-111-222' where id = '44444444-4444-4444-4444-444444444444' $$,
  'buyer CAN update their own non-protected fields (phone)'
);

select is(
  (select phone from public.buyers where id = '44444444-4444-4444-4444-444444444444'),
  '+61-111-222',
  'the legitimate phone update actually applied'
);

-- ── buyer: base-table quote_requests access is now entirely removed ────
-- ── (not merely filtered by ownership) — the "buyers can view own ──────
-- ── quote_requests" RLS policy was dropped in Module 5, since RLS only
-- ── restricts rows, never columns, and that policy let a buyer's own
-- ── row through with every column intact, including lead_score/status/
-- ── assigned_to/follow_up_at/notes (internal sales notes). Buyer-facing
-- ── access now goes through public.buyer_quote_requests instead (an
-- ── explicit-column-list view — see that module's own tests for the
-- ── full column-exactness proof).
select is(
  (select count(*)::int from public.quote_requests where buyer_id = '55555555-5555-5555-5555-555555555555'),
  0,
  'buyer one gets zero rows querying quote_requests directly for buyer two''s row — no base-table access exists for buyers at all anymore'
);

select is(
  (select count(*)::int from public.quote_requests where id = '99999999-9999-9999-9999-999999999978'),
  0,
  'buyer one ALSO gets zero rows querying quote_requests directly for what would be buyer two''s row by id — same reason, not ownership filtering'
);

reset role;

-- ── buyer two: base-table access is ALSO entirely removed for their ────
-- ── OWN row now — this is the key behavior change from the corrected
-- ── design. Buyer-facing access exists only through
-- ── buyer_quote_requests.
set local request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
set local role authenticated;

select is(
  (select count(*)::int from public.quote_requests where id = '99999999-9999-9999-9999-999999999978'),
  0,
  'buyer two gets ZERO rows querying quote_requests DIRECTLY, even for their own row — base-table buyer access no longer exists at all, by design'
);

select is(
  (select count(*)::int from public.buyer_quote_requests where id = '99999999-9999-9999-9999-999999999978'),
  1,
  'buyer two CAN see their own row through buyer_quote_requests — the view''s own buyer_id = auth.uid() predicate does the ownership filtering the removed RLS policy used to do'
);

select is(
  (select count(*)::int from public.buyer_quote_requests where buyer_id = '44444444-4444-4444-4444-444444444444'),
  0,
  'buyer two cannot see buyer one''s row through buyer_quote_requests either — ownership filtering, not a blanket denial'
);

reset role;

-- ── defense-in-depth: prove the guard trigger STILL catches this if the ─
-- ── grant is ever (mis)configured to allow it. Rolled back with the rest
-- ── of this transaction, so no permanent privilege change results.
reset role;
grant update (verified) on public.buyers to authenticated;

set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
set local role authenticated;

select throws_ok(
  $$ update public.buyers set verified = true where id = '44444444-4444-4444-4444-444444444444' $$,
  '42501',
  'Only an authorized admin may change the verified status of a buyer account',
  'with the grant temporarily present, the guard TRIGGER itself now rejects the buyer''s change — defense in depth confirmed'
);

-- ── sales admin: admin_verify_buyer() RPC succeeds (the real path) ─────
reset role;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set local role authenticated;

select lives_ok(
  $$ select public.admin_verify_buyer('44444444-4444-4444-4444-444444444444', true) $$,
  'sales admin can call admin_verify_buyer() successfully'
);

select is(
  (select verified from public.buyers where id = '44444444-4444-4444-4444-444444444444'),
  true,
  'verified is true after the admin RPC call — the sanctioned path works'
);

reset role;

select * from finish();
rollback;
