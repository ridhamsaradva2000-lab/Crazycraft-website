-- 05_integrity_constraints.sql
-- Run via: supabase test db
-- Runs as the default connecting role (superuser in the local test
-- runner) — these are structural constraints that apply regardless of
-- who's writing, not role/RLS behavior (covered in 02_/03_/04_).

begin;
select plan(11);

-- ── only one primary image per product ──────────────────────────────────
select lives_ok(
  $$ insert into public.product_images (product_id, url, alt_text, is_primary)
     values ('99999999-9999-9999-9999-999999999992', 'https://example.com/a.jpg', 'Test image A', true) $$,
  'first primary image for a product succeeds'
);

select throws_ok(
  $$ insert into public.product_images (product_id, url, alt_text, is_primary)
     values ('99999999-9999-9999-9999-999999999992', 'https://example.com/b.jpg', 'Test image B', true) $$,
  '23505',
  null,
  'a second primary image for the same product violates the partial unique index'
);

-- ── lead_activity_log: orphan / malformed parent references rejected ───
select throws_ok(
  $$ insert into public.lead_activity_log (inquiry_id, event_type, note)
     values ('00000000-0000-0000-0000-000000000000', 'note', 'orphan test') $$,
  '23503',
  null,
  'lead_activity_log referencing a nonexistent inquiry_id fails the foreign key'
);

select throws_ok(
  $$ insert into public.lead_activity_log (event_type, note)
     values ('note', 'no parent set') $$,
  '23514',
  null,
  'lead_activity_log with no parent reference at all violates the exactly-one-parent CHECK'
);

insert into public.inquiries (id, name, email, country, business_type)
values ('99999999-9999-9999-9999-999999999997', 'Integrity Test Inquiry', 'integrity-inquiry@example.com', 'US', 'importer')
on conflict (id) do nothing;

insert into public.quote_requests (id, email, country)
values ('99999999-9999-9999-9999-999999999998', 'integrity-qr@example.com', 'US')
on conflict (id) do nothing;

select throws_ok(
  $$ insert into public.lead_activity_log (inquiry_id, quote_request_id, event_type)
     values ('99999999-9999-9999-9999-999999999997', '99999999-9999-9999-9999-999999999998', 'note') $$,
  '23514',
  null,
  'lead_activity_log with BOTH inquiry_id and quote_request_id set violates the exactly-one-parent CHECK'
);

-- ── quote_request_items: quantity and product/variant consistency ──────
select throws_ok(
  $$ insert into public.quote_request_items (quote_request_id, product_id, quantity)
     values ('99999999-9999-9999-9999-999999999998', '99999999-9999-9999-9999-999999999992', 0) $$,
  '23514',
  null,
  'quote_request_items with quantity = 0 violates the quantity > 0 CHECK'
);

select lives_ok(
  $$ insert into public.quote_request_items (quote_request_id, product_id, product_variant_id, quantity)
     values ('99999999-9999-9999-9999-999999999998', '99999999-9999-9999-9999-999999999992', '99999999-9999-9999-9999-999999999993', 5) $$,
  'quote_request_items with a valid quantity AND a variant that genuinely belongs to that product succeeds'
);

-- The second product + its variant (belonging to it, not the first
-- product) now live in 00_fixtures.sql, committed there so this file and
-- 06_submit_quote_request_rpc.sql both reference the same rows without
-- depending on each other's rolled-back transaction.
select throws_ok(
  $$ insert into public.quote_request_items (quote_request_id, product_id, product_variant_id, quantity)
     values ('99999999-9999-9999-9999-999999999998', '99999999-9999-9999-9999-999999999992', '88888888-1111-1111-1111-111111111111', 3) $$,
  '23503',
  null,
  'a variant belonging to a DIFFERENT product is rejected by the composite FK — product/variant mismatch caught at the DB level'
);

select is(
  (select count(*)::int from public.quote_request_items where quote_request_id = '99999999-9999-9999-9999-999999999998'),
  1,
  'exactly one quote_request_item exists for the fixture quote_request — the rejected mismatch attempt left no partial row'
);

-- ── newsletter_subscribers: case-insensitive uniqueness ─────────────────
select lives_ok(
  $$ insert into public.newsletter_subscribers (email, source) values ('Case.Test@Example.com', 'test') $$,
  'first newsletter subscription succeeds'
);

select throws_ok(
  $$ insert into public.newsletter_subscribers (email, source) values ('case.test@example.com', 'test-duplicate') $$,
  '23505',
  null,
  'a differently-cased duplicate email is rejected by the unique index on email_normalized'
);

select * from finish();
rollback;
