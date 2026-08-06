-- 02_anon_negative_and_rpc_tests.sql
-- Run via: supabase test db

begin;

-- Explicitly establish anon role BEFORE any anon-specific assertion below
-- — this was missing in an earlier revision (the anon tests relied on
-- whatever role the test runner happened to be connected as by default).
-- Anon requests carry no JWT at all in practice, so no claim is set here.
set local role anon;

select plan(18);

-- ── anon: direct INSERT into inquiries is gone entirely as of Module 4 ──
-- ── — submit_inquiry() is the only creation path (see item 4's own ──────
-- ── migration: 20260726090200_revoke_direct_inquiries_insert.sql) ───────
select throws_ok(
  $$ insert into public.inquiries (name, email, country, business_type, message)
     values ('Anon Tester', 'anon@example.com', 'US', 'importer', 'test inquiry') $$,
  '42501',
  null,
  'anon cannot INSERT into inquiries directly at all, even using only fully buyer-facing columns — no grant exists'
);

-- The four checks below remain valid and are kept as an extra layer of
-- regression coverage: even if the table-wide grant were ever
-- accidentally reintroduced, these specific admin-controlled columns
-- must still never be nameable in an anon INSERT.

-- ── anon: cannot even name an admin-controlled column in the INSERT ────
select throws_ok(
  $$ insert into public.inquiries (name, email, country, business_type, status)
     values ('Anon Tester 2', 'anon2@example.com', 'US', 'importer', 'won') $$,
  '42501',
  null,
  'anon cannot name "status" in an inquiries INSERT — blocked at the GRANT layer'
);

select throws_ok(
  $$ insert into public.inquiries (name, email, country, business_type, lead_score)
     values ('Anon Tester 3', 'anon3@example.com', 'US', 'importer', 90) $$,
  '42501',
  null,
  'anon cannot name "lead_score" in an inquiries INSERT — blocked at the GRANT layer'
);

select throws_ok(
  $$ insert into public.inquiries (name, email, country, business_type, assigned_to)
     values ('Anon Tester 4', 'anon4@example.com', 'US', 'importer', '11111111-1111-1111-1111-111111111111') $$,
  '42501',
  null,
  'anon cannot name "assigned_to" in an inquiries INSERT — blocked at the GRANT layer'
);

-- ── anon: cannot name qualification_stage either — always starts at the ─
-- ── column default (1); stage advancement is a later-module RPC concern ─
select throws_ok(
  $$ insert into public.inquiries (name, email, country, business_type, qualification_stage)
     values ('Anon Tester 5', 'anon5@example.com', 'US', 'importer', 3) $$,
  '42501',
  null,
  'anon cannot name "qualification_stage" in an inquiries INSERT — blocked at the GRANT layer'
);

-- ── anon: cannot read inquiries at all (no SELECT grant) ────────────────
select throws_ok(
  $$ select 1 from public.inquiries limit 1 $$,
  '42501',
  null,
  'anon cannot SELECT from inquiries at all'
);

-- ── anon: cannot touch capi_events / capi_event_log in any way ──────────
select throws_ok(
  $$ select 1 from public.capi_events limit 1 $$,
  '42501',
  null,
  'anon cannot SELECT from capi_events'
);

select throws_ok(
  $$ insert into public.capi_events (event_name, event_id, payload)
     values ('Lead', gen_random_uuid(), '{}'::jsonb) $$,
  '42501',
  null,
  'anon cannot INSERT into capi_events'
);

-- ── anon: has no direct INSERT access to quote_requests or ──────────────
-- ── quote_request_items — must go through submit_quote_request() ───────
select throws_ok(
  $$ insert into public.quote_requests (email, country) values ('anon-direct@example.com', 'US') $$,
  '42501',
  null,
  'anon cannot INSERT directly into quote_requests — no grant exists at all'
);

-- ── anon: CAN successfully call submit_quote_request() end-to-end ──────
select lives_ok(
  format(
    $$ select public.submit_quote_request(
         'Anon Guest Co', 'anon-guest@example.com', null, 'US',
         null, null, null, null, null, null, null, null, null, null, null,
         '[{"product_id": "%s", "quantity": 5}]'::jsonb
       ) $$,
    '99999999-9999-9999-9999-999999999992'
  ),
  'anon can successfully call submit_quote_request() with one valid item'
);

-- ── anon: attribution_events column-level grant ─────────────────────────
select throws_ok(
  $$ insert into public.attribution_events (visitor_id, event_type, created_at)
     values ('v-1', 'page_view', now()) $$,
  '42501',
  null,
  'anon cannot name "created_at" in an attribution_events INSERT — blocked at the GRANT layer'
);

select lives_ok(
  $$ insert into public.attribution_events (visitor_id, event_type, page_path, utm_source)
     values ('v-1', 'page_view', '/products', 'google') $$,
  'anon CAN insert attribution_events using only the allowed columns'
);

-- ── anon: newsletter_subscribers column-level grant ─────────────────────
select throws_ok(
  $$ insert into public.newsletter_subscribers (email, subscribed_at)
     values ('grant-test@example.com', now()) $$,
  '42501',
  null,
  'anon cannot name "subscribed_at" in a newsletter_subscribers INSERT — blocked at the GRANT layer'
);

select lives_ok(
  $$ insert into public.newsletter_subscribers (email, source) values ('grant-test-2@example.com', 'footer-form') $$,
  'anon CAN insert newsletter_subscribers using only the allowed columns'
);

-- ── anon: direct INSERT into samples is gone entirely — ────────────────
-- ── submit_sample_request() is the only creation path ───────────────────
select throws_ok(
  format(
    $$ insert into public.samples (name, email, country, product_id, requested_quantity)
       values ('Anon Sample', 'anon-sample@example.com', 'US', '%s', 1) $$,
    '99999999-9999-9999-9999-999999999992'
  ),
  '42501',
  null,
  'anon cannot INSERT into samples directly at all, even using only previously-allowed columns — no grant exists'
);

-- ── anon: CAN successfully call submit_sample_request() end-to-end ─────
select lives_ok(
  format(
    $$ select public.submit_sample_request(
         'Anon Sample Requester', 'anon-sample-rpc@example.com', null, null, 'US',
         '%s', 2, null
       ) $$,
    '99999999-9999-9999-9999-999999999992'
  ),
  'anon can successfully call submit_sample_request() with no quote_request linkage'
);

-- ── inquiries: direct INSERT fails entirely (any shape, any product_id) ─
-- ── — submit_inquiry() remains callable and succeeds, matching the same
-- ── pattern already proven above for quote_requests and samples ────────
select throws_ok(
  $$ insert into public.inquiries (name, email, country, business_type)
     values ('General Inquiry Tester', 'general-inquiry@example.com', 'US', 'importer') $$,
  '42501',
  null,
  'anon cannot INSERT into inquiries directly even with product_id left null — no grant exists at all'
);

-- ── inquiries is now the MOST locked-down of the three lead tables: ─────
-- ── unlike quote_requests/samples, where the RPC remains anon- ──────────
-- ── callable, submit_inquiry() is service_role-only (Module 4's ────────
-- ── security correction) — neither a direct INSERT nor the RPC itself ──
-- ── is reachable with just the publishable key. See
-- ── 10_submit_inquiry_rpc.sql for the RPC's own dedicated security-
-- ── boundary tests (anon/authenticated both denied, service_role allowed).
select throws_ok(
  format(
    $$ select public.submit_inquiry(
         '%s', 'RPC Inquiry Tester', 'rpc-inquiry@example.com', 'US', 'importer'::public.business_type,
         'Interested in your handicraft products for our business', null, null, null, null, null, null, null, null, null, false,
         'visitor-rpc-inquiry', null, null, null, null, null, null, null, null, null,
         null, null, null, null, null, null, null) $$,
    '99999999-9999-9999-9999-999999999992'
  ),
  '42501',
  null,
  'anon cannot execute submit_inquiry() either — service_role-only, not just direct-insert-only'
);

reset role;

select * from finish();
rollback;
