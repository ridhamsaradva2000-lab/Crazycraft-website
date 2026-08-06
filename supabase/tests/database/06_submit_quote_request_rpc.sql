-- 06_submit_quote_request_rpc.sql
-- Run via: supabase test db
-- Runs as the default connecting role — these test the RPC's own internal
-- validation logic, which applies identically regardless of caller role
-- (anon's ability to call it at all is covered in 02_).

begin;
select plan(10);

-- ── empty items array rejected ──────────────────────────────────────────
select throws_ok(
  $$ select public.submit_quote_request(
       'Empty Items Co', 'empty-items@example.com', null, 'US',
       null, null, null, null, null, null, null, null, null, null, null,
       '[]'::jsonb
     ) $$,
  '22023',
  null,
  'submit_quote_request rejects an empty items array'
);

-- ── malformed JSON (an object instead of an array) rejected ────────────
select throws_ok(
  $$ select public.submit_quote_request(
       'Malformed Co', 'malformed@example.com', null, 'US',
       null, null, null, null, null, null, null, null, null, null, null,
       '{"not": "an array"}'::jsonb
     ) $$,
  '22023',
  null,
  'submit_quote_request rejects a JSON object where an array is required'
);

-- ── missing required header field rejected ──────────────────────────────
select throws_ok(
  $$ select public.submit_quote_request(
       'No Email Co', '', null, 'US',
       null, null, null, null, null, null, null, null, null, null, null,
       '[{"product_id": "99999999-9999-9999-9999-999999999992", "quantity": 1}]'::jsonb
     ) $$,
  '22023',
  null,
  'submit_quote_request rejects an empty email'
);

-- ── nonexistent / unpublished product rejected ──────────────────────────
select throws_ok(
  $$ select public.submit_quote_request(
       'Bad Product Co', 'bad-product@example.com', null, 'US',
       null, null, null, null, null, null, null, null, null, null, null,
       '[{"product_id": "00000000-0000-0000-0000-000000000000", "quantity": 1}]'::jsonb
     ) $$,
  '23503',
  null,
  'submit_quote_request rejects an item referencing a nonexistent/unpublished product'
);

-- ── variant belonging to a different product rejected (RPC-level check,
-- ── same rule the composite FK enforces at the storage layer in 05_) ───
select throws_ok(
  format(
    $$ select public.submit_quote_request(
         'Mismatch Co', 'mismatch@example.com', null, 'US',
         null, null, null, null, null, null, null, null, null, null, null,
         '[{"product_id": "%s", "product_variant_id": "%s", "quantity": 1}]'::jsonb
       ) $$,
    '99999999-9999-9999-9999-999999999992',
    '88888888-1111-1111-1111-111111111111'
  ),
  '23503',
  null,
  'submit_quote_request rejects a variant that does not belong to the given product'
);

-- ── valid multi-item submission succeeds and creates both rows ─────────
do $$
declare
  v_id uuid;
begin
  v_id := public.submit_quote_request(
    'Valid Co', 'valid-multi@example.com', '+1-555-0100', 'US',
    'visitor-123', 'google', 'cpc', 'summer-2026', null, null, null, null, null, null, null,
    format(
      '[{"product_id": "%s", "quantity": 10}, {"product_id": "%s", "quantity": 3}]',
      '99999999-9999-9999-9999-999999999992',
      '99999999-9999-9999-9999-999999999999'
    )::jsonb
  );
  perform set_config('crazycraft_test.valid_quote_id', v_id::text, true);
end $$;

select ok(
  current_setting('crazycraft_test.valid_quote_id', true) is not null,
  'submit_quote_request returned a non-null id for a valid submission'
);

select is(
  (select count(*)::int from public.quote_request_items
   where quote_request_id = current_setting('crazycraft_test.valid_quote_id')::uuid),
  2,
  'both items were created atomically alongside the quote_request'
);

-- ── admin-controlled defaults are forced even though the RPC never ──────
-- ── sets them explicitly — the guard-insert trigger still applies ──────
select is(
  (select status from public.quote_requests where id = current_setting('crazycraft_test.valid_quote_id')::uuid),
  'new'::public.lead_status,
  'the new quote_request has status = new by default'
);

select is(
  (select lead_score from public.quote_requests where id = current_setting('crazycraft_test.valid_quote_id')::uuid),
  0,
  'the new quote_request has lead_score = 0 by default'
);

-- ── two separate calls never merge into the same quote_request ─────────
do $$
declare
  v_id2 uuid;
begin
  v_id2 := public.submit_quote_request(
    'Valid Co', 'valid-multi@example.com', '+1-555-0100', 'US',
    null, null, null, null, null, null, null, null, null, null, null,
    format('[{"product_id": "%s", "quantity": 1}]', '99999999-9999-9999-9999-999999999992')::jsonb
  );
  perform set_config('crazycraft_test.valid_quote_id_2', v_id2::text, true);
end $$;

select isnt(
  current_setting('crazycraft_test.valid_quote_id'),
  current_setting('crazycraft_test.valid_quote_id_2'),
  'a second call with identical company/email data creates a brand new quote_request, never appends to the first'
);

select * from finish();
rollback;
