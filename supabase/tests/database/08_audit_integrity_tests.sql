-- 08_audit_integrity_tests.sql
-- Run via: supabase test db
-- Self-contained — creates its own inquiry/quote_request/sample fixtures
-- as the default connecting role, before any role simulation begins.

begin;
select plan(11);

insert into public.inquiries (id, name, email, country, business_type)
values ('99999999-9999-9999-9999-999999999983', 'Audit Test Inquiry', 'audit-inquiry@example.com', 'US', 'importer')
on conflict (id) do nothing;

insert into public.quote_requests (id, email, country)
values ('99999999-9999-9999-9999-999999999984', 'audit-qr@example.com', 'US')
on conflict (id) do nothing;

insert into public.samples (id, name, email, country, product_id, requested_quantity)
values ('99999999-9999-9999-9999-999999999985', 'Audit Sample Requester', 'audit-sample@example.com', 'US', '99999999-9999-9999-9999-999999999992', 1)
on conflict (id) do nothing;

set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set local role authenticated;

-- ── sales admin can create an activity ──────────────────────────────────
select lives_ok(
  $$ insert into public.lead_activity_log (inquiry_id, event_type, note)
     values ('99999999-9999-9999-9999-999999999983', 'note', 'Called the lead') $$,
  'sales admin can create a lead_activity_log entry'
);

-- ── created_by is always forced to auth.uid() ───────────────────────────
select is(
  (
    select created_by from public.lead_activity_log
    where inquiry_id = '99999999-9999-9999-9999-999999999983'
    order by created_at desc limit 1
  ),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'created_by is forced to the actual calling admin''s auth.uid(), even though it was never named in the INSERT'
);

-- ── a caller cannot forge another admin's uuid as created_by ────────────
-- Rejected at the GRANT layer — created_by isn't in the INSERT column
-- list at all, so this is a plain permission-denied error, not the
-- trigger. Even if the grant were ever loosened, the guard trigger
-- unconditionally overwrites created_by regardless of what's supplied
-- (see trg_lead_activity_log_guard_insert), so forgery is rejected either way.
select throws_ok(
  $$ insert into public.lead_activity_log (inquiry_id, event_type, created_by)
     values ('99999999-9999-9999-9999-999999999983', 'note', '33333333-3333-3333-3333-333333333333') $$,
  '42501',
  null,
  'a sales admin cannot name "created_by" in the INSERT at all — cannot forge another admin as the author'
);

-- ── created_at is database-generated; a caller-supplied value is ───────
-- ── REJECTED (grant-blocked), not silently ignored ──────────────────────
select throws_ok(
  $$ insert into public.lead_activity_log (inquiry_id, event_type, created_at)
     values ('99999999-9999-9999-9999-999999999983', 'note', '2020-01-01T00:00:00Z'::timestamptz) $$,
  '42501',
  null,
  'a sales admin cannot name "created_at" in the INSERT — rejected outright, not silently overwritten'
);

select ok(
  (
    select now() - created_at < interval '1 minute' from public.lead_activity_log
    where inquiry_id = '99999999-9999-9999-9999-999999999983'
    order by created_at desc limit 1
  ),
  'created_at on the successful insert reflects the actual insert time, confirming it is database-generated'
);

-- ── orphan parent references are rejected by the foreign keys ──────────
select throws_ok(
  $$ insert into public.lead_activity_log (inquiry_id, event_type)
     values ('00000000-0000-0000-0000-000000000000', 'note') $$,
  '23503',
  null,
  'lead_activity_log referencing a nonexistent inquiry_id is rejected by the foreign key'
);

select throws_ok(
  $$ insert into public.lead_activity_log (sample_id, event_type)
     values ('00000000-0000-0000-0000-000000000000', 'note') $$,
  '23503',
  null,
  'lead_activity_log referencing a nonexistent sample_id is rejected by the foreign key'
);

-- ── exactly one valid parent reference is required ──────────────────────
select throws_ok(
  $$ insert into public.lead_activity_log (event_type) values ('note') $$,
  '23514',
  null,
  'lead_activity_log with no parent reference at all violates the exactly-one-parent CHECK'
);

select throws_ok(
  $$ insert into public.lead_activity_log (inquiry_id, quote_request_id, event_type)
     values ('99999999-9999-9999-9999-999999999983', '99999999-9999-9999-9999-999999999984', 'note') $$,
  '23514',
  null,
  'lead_activity_log with BOTH inquiry_id and quote_request_id set violates the exactly-one-parent CHECK'
);

-- ── each single valid parent type succeeds on its own ───────────────────
select lives_ok(
  $$ insert into public.lead_activity_log (quote_request_id, event_type)
     values ('99999999-9999-9999-9999-999999999984', 'note') $$,
  'lead_activity_log with only quote_request_id set succeeds'
);

select lives_ok(
  $$ insert into public.lead_activity_log (sample_id, event_type)
     values ('99999999-9999-9999-9999-999999999985', 'note') $$,
  'lead_activity_log with only sample_id set succeeds'
);

select * from finish();
rollback;
