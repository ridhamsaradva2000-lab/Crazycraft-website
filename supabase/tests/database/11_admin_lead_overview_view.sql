-- 11_admin_lead_overview_view.sql
-- Run via: supabase test db
-- Self-contained — creates its own inquiry/quote_request/sample fixtures
-- as the default/superuser role, then queries as different roles to
-- prove RLS, view predicates, and RPC-internal role checks are all
-- actually in effect.

begin;
select plan(144);

-- ══════════════════════════════════════════════════════════════════════
-- Fixtures (as default/superuser role — fixture setup, not under test)
-- ══════════════════════════════════════════════════════════════════════
insert into public.inquiries (id, name, email, country, business_type, message)
values (
  '99999999-9999-9999-9999-999999999970',
  'Overview Test Inquiry', 'overview-inquiry@example.com', 'US', 'importer',
  'Testing the admin_lead_overview view'
)
on conflict (id) do nothing;

insert into public.quote_requests (id, company_name, email, country)
values (
  '99999999-9999-9999-9999-999999999971',
  'Overview Test Co', 'overview-quoterequest@example.com', 'US'
)
on conflict (id) do nothing;

-- Owned by the committed buyer fixture (44444444...) from 00_fixtures.sql
-- — the fixture the real (now-fixed) leak hinges on.
insert into public.quote_requests (id, buyer_id, company_name, email, country)
values (
  '99999999-9999-9999-9999-999999999972',
  '44444444-4444-4444-4444-444444444444',
  'Buyer Owned Quote Co', 'buyer-owned-quoterequest@example.com', 'US'
)
on conflict (id) do nothing;

insert into public.samples (id, name, email, country, product_id, requested_quantity)
values (
  '99999999-9999-9999-9999-999999999973',
  'Overview Test Sample Requester', 'overview-sample@example.com', 'US',
  '99999999-9999-9999-9999-999999999992', 1
)
on conflict (id) do nothing;

-- A second buyer's own sample, for the search_samples() cross-buyer test
insert into public.samples (id, buyer_id, name, email, country, product_id, requested_quantity)
values (
  '99999999-9999-9999-9999-999999999974',
  '44444444-4444-4444-4444-444444444444',
  'Buyer Owned Sample Requester', 'buyer-owned-sample@example.com', 'US',
  '99999999-9999-9999-9999-999999999992', 1
)
on conflict (id) do nothing;

-- ══════════════════════════════════════════════════════════════════════
-- admin_lead_overview — catalog-level proof, not just behavior
-- ══════════════════════════════════════════════════════════════════════
select ok(
  exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral pg_options_to_table(c.reloptions) opts
    where n.nspname = 'public' and c.relname = 'admin_lead_overview'
      and c.relkind = 'v'
      and opts.option_name = 'security_invoker' and opts.option_value = 'true'
  ),
  'admin_lead_overview has security_invoker=true in the catalog (pg_options_to_table), not merely inferred from behavior'
);

-- ══════════════════════════════════════════════════════════════════════
-- admin_lead_overview — access control
-- ══════════════════════════════════════════════════════════════════════
set local role anon;

select throws_ok(
  $$ select count(*) from public.admin_lead_overview $$,
  '42501',
  null,
  'anon cannot query admin_lead_overview at all'
);

reset role;

set local request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
set local role authenticated;

select is(
  (select count(*)::int from public.admin_lead_overview),
  0,
  'an ordinary authenticated buyer (owning nothing in these fixtures) sees zero rows through admin_lead_overview'
);

reset role;

-- THE REAL LEAK REGRESSION TEST
set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
set local role authenticated;

select is(
  (select count(*)::int from public.admin_lead_overview),
  0,
  'a buyer who OWNS a fixture quote_request still sees ZERO rows through admin_lead_overview — the view''s own has_admin_role(''sales'') predicate blocks the buyer''s legitimate base-table RLS pass-through'
);

select is(
  (select count(*)::int from public.quote_requests where id = '99999999-9999-9999-9999-999999999972'),
  0,
  'the same buyer ALSO gets zero rows querying quote_requests directly for their own row via the base table — the buyer-owning-row policy was dropped entirely later in this same migration, not merely narrowed. (The later bidirectional buyer_quote_requests tests separately prove this buyer genuinely CAN see this exact row through the safe view — not duplicated here.)'
);

reset role;

set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set local role authenticated;

select is(
  (select count(*)::int from public.admin_lead_overview),
  0,
  'editor sees zero rows through admin_lead_overview'
);

reset role;

set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set local role authenticated;

select ok(
  exists (select 1 from public.admin_lead_overview where id = '99999999-9999-9999-9999-999999999970' and source_type = 'inquiry'),
  'sales admin sees the inquiry-sourced row with correct source_type'
);

select ok(
  exists (select 1 from public.admin_lead_overview where id = '99999999-9999-9999-9999-999999999971' and source_type = 'quote_request'),
  'sales admin sees the quote_request-sourced row with correct source_type'
);

select ok(
  exists (select 1 from public.admin_lead_overview where id = '99999999-9999-9999-9999-999999999972' and source_type = 'quote_request'),
  'sales admin ALSO sees the buyer-owned quote_request row — unaffected by underlying row ownership'
);

select is(
  (select name from public.admin_lead_overview where id = '99999999-9999-9999-9999-999999999970'),
  'Overview Test Inquiry',
  'the inquiry-sourced row surfaces its own name as display_name'
);

select is(
  (select name from public.admin_lead_overview where id = '99999999-9999-9999-9999-999999999971'),
  'Overview Test Co',
  'the quote_request-sourced row falls back to company_name for display_name'
);

select is(
  (select email from public.admin_lead_overview where id = '99999999-9999-9999-9999-999999999971'),
  'overview-quoterequest@example.com',
  'the quote_request-sourced row surfaces its own email'
);

select is(
  (select country from public.admin_lead_overview where id = '99999999-9999-9999-9999-999999999971'),
  'US',
  'the quote_request-sourced row surfaces its own country'
);

-- ── Inquiry mapping via a real update ───────────────────────────────────
select lives_ok(
  $$ select public.admin_update_inquiry(
       '99999999-9999-9999-9999-999999999970', 'contacted'::public.lead_status, 42,
       '11111111-1111-1111-1111-111111111111', '2026-08-01 10:00:00+00'::timestamptz
     ) $$,
  'sales admin can update the fixture inquiry via admin_update_inquiry()'
);

select is(
  (select status from public.admin_lead_overview where id = '99999999-9999-9999-9999-999999999970'),
  'contacted'::public.lead_status,
  'inquiry: updated status maps correctly through admin_lead_overview'
);

select is(
  (select lead_score from public.admin_lead_overview where id = '99999999-9999-9999-9999-999999999970'),
  42,
  'inquiry: updated lead_score maps correctly through admin_lead_overview'
);

select is(
  (select assigned_to from public.admin_lead_overview where id = '99999999-9999-9999-9999-999999999970'),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'inquiry: updated assigned_to maps correctly through admin_lead_overview'
);

select is(
  (select follow_up_at from public.admin_lead_overview where id = '99999999-9999-9999-9999-999999999970'),
  '2026-08-01 10:00:00+00'::timestamptz,
  'inquiry: updated follow_up_at maps correctly through admin_lead_overview'
);

-- ── Quote-request mapping via a real update (item 3) ────────────────────
select lives_ok(
  $$ select public.admin_update_quote_request(
       '99999999-9999-9999-9999-999999999971', 'quoted'::public.lead_status, 77,
       '11111111-1111-1111-1111-111111111111', '2026-08-05 14:00:00+00'::timestamptz,
       'Internal note from admin_update_quote_request test'
     ) $$,
  'sales admin can update the fixture quote_request via admin_update_quote_request()'
);

select ok(
  exists (
    select 1 from public.admin_lead_overview
    where id = '99999999-9999-9999-9999-999999999971' and source_type = 'quote_request'
  ),
  'quote_request: source_type/id remain correctly mapped after the update'
);

select is(
  (select status from public.admin_lead_overview where id = '99999999-9999-9999-9999-999999999971'),
  'quoted'::public.lead_status,
  'quote_request: updated status maps correctly through admin_lead_overview'
);

select is(
  (select lead_score from public.admin_lead_overview where id = '99999999-9999-9999-9999-999999999971'),
  77,
  'quote_request: updated lead_score maps correctly through admin_lead_overview'
);

select is(
  (select assigned_to from public.admin_lead_overview where id = '99999999-9999-9999-9999-999999999971'),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'quote_request: updated assigned_to maps correctly through admin_lead_overview'
);

select is(
  (select follow_up_at from public.admin_lead_overview where id = '99999999-9999-9999-9999-999999999971'),
  '2026-08-05 14:00:00+00'::timestamptz,
  'quote_request: updated follow_up_at maps correctly through admin_lead_overview'
);

select is(
  (select name from public.admin_lead_overview where id = '99999999-9999-9999-9999-999999999971'),
  'Overview Test Co',
  'quote_request: display_name (company_name fallback) is unaffected by the CRM-only field update'
);

select is(
  (select email from public.admin_lead_overview where id = '99999999-9999-9999-9999-999999999971'),
  'overview-quoterequest@example.com',
  'quote_request: email is unaffected by the CRM-only field update'
);

select is(
  (select country from public.admin_lead_overview where id = '99999999-9999-9999-9999-999999999971'),
  'US',
  'quote_request: country is unaffected by the CRM-only field update'
);

reset role;

set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set local role authenticated;

select is(
  (select count(*)::int from public.admin_lead_overview where id in (
    '99999999-9999-9999-9999-999999999970', '99999999-9999-9999-9999-999999999971',
    '99999999-9999-9999-9999-999999999972'
  )),
  3,
  'super_admin sees all three fixture rows through admin_lead_overview'
);

reset role;

-- ══════════════════════════════════════════════════════════════════════
-- list_crm_assignment_admins() — the corrected, RPC-based design
-- ══════════════════════════════════════════════════════════════════════
--
-- CORRECTED: an earlier revision relied on an additive admin_users RLS
-- policy plus a security_invoker view on top — but RLS is row-level
-- only, and `authenticated` already had table-level SELECT on
-- admin_users (Module 2), so that policy made the view meaningless as a
-- security boundary: any sales session could just query admin_users
-- directly. This RPC's own RETURNS TABLE clause is what actually
-- restricts the shape now; the additive policy and the view have both
-- been removed entirely, and admin_users' original Module 2 policies
-- ("admins can view own record" / "super_admins can view all admin
-- records" / "super_admins manage admin_users") are back to their
-- untouched original state.

-- Column-exactness proof: proargnames for a RETURNS TABLE function lists
-- exactly its declared output columns, in order, since this function
-- takes no input parameters to also appear in that list.
select is(
  (
    select proargnames from pg_proc
    where proname = 'list_crm_assignment_admins' and pronamespace = 'public'::regnamespace
  ),
  array['id', 'full_name', 'role'],
  'list_crm_assignment_admins() returns exactly id, full_name, role — no other column, per its own RETURNS TABLE clause'
);

set local role anon;

select throws_ok(
  $$ select * from public.list_crm_assignment_admins() $$,
  '42501',
  null,
  'anon has no EXECUTE privilege on list_crm_assignment_admins() at all'
);

reset role;

set local request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
set local role authenticated;

select throws_ok(
  $$ select * from public.list_crm_assignment_admins() $$,
  '42501',
  null,
  'an ordinary buyer is rejected by list_crm_assignment_admins()''s own internal has_admin_role check'
);

reset role;

set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set local role authenticated;

select throws_ok(
  $$ select * from public.list_crm_assignment_admins() $$,
  '42501',
  null,
  'editor is rejected by list_crm_assignment_admins()''s own internal has_admin_role check'
);

select is(
  (select count(*)::int from public.admin_users),
  1,
  'baseline preserved: editor querying admin_users directly still sees only their OWN record (the original Module 2 "view own record" policy), never the full staff list'
);

reset role;

set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set local role authenticated;

select ok(
  exists (select 1 from public.list_crm_assignment_admins() where id = '11111111-1111-1111-1111-111111111111'),
  'sales admin can call list_crm_assignment_admins() and the directory includes the sales fixture'
);

select ok(
  exists (select 1 from public.list_crm_assignment_admins() where id = '33333333-3333-3333-3333-333333333333'),
  'the directory also includes the super_admin fixture'
);

select is(
  (select count(*)::int from public.list_crm_assignment_admins() where id = '22222222-2222-2222-2222-222222222222'),
  0,
  'the directory returns ZERO rows for the editor fixture — assigning a lead/sample to an editor would create an unusable assignment, since editor has no CRM access at all'
);

select is(
  (select count(*)::int from public.admin_users),
  1,
  'sales admin querying admin_users DIRECTLY still sees only their OWN record — the RPC is genuinely the only path to the full staff list, not a redundant convenience alongside direct table access'
);

select throws_ok(
  $$ insert into public.admin_users (id, full_name, role) values (gen_random_uuid(), 'Rogue Admin', 'sales') $$,
  '42501',
  null,
  'sales still cannot INSERT into admin_users — INSERT''s RLS WITH CHECK clause genuinely rejects the new row outright, raising 42501'
);

-- UPDATE/DELETE behave differently from INSERT here: `authenticated`
-- genuinely holds the table-level UPDATE/DELETE GRANT on admin_users
-- (Module 2's grants file: "RLS restricts to super_admin" — the grant
-- exists, RLS is what narrows it), so a sales session's UPDATE/DELETE
-- does not raise an exception at all. RLS's USING clause for UPDATE/
-- DELETE determines which EXISTING rows the statement is even allowed
-- to see/touch — a row that doesn't pass USING is simply excluded from
-- the statement's effect, same as it would be from a plain SELECT,
-- resulting in "0 rows affected" rather than a thrown error. (INSERT is
-- different because there's no "existing row" to filter — a brand new
-- row either satisfies WITH CHECK or the whole INSERT is rejected
-- outright with an exception.) An earlier revision of this test
-- incorrectly expected 42501 for UPDATE/DELETE too.
select lives_ok(
  $sql$
    update public.admin_users
    set full_name = 'Renamed By Sales Attempt'
    where id = '11111111-1111-1111-1111-111111111111'
  $sql$,
  'sales UPDATE against admin_users completes without an exception; the unchanged-row assertion below proves RLS filtered the target to zero rows'
);

select is(
  (select full_name from public.admin_users where id = '11111111-1111-1111-1111-111111111111'),
  'Test Sales Admin',
  'the target row''s full_name is genuinely unchanged after the 0-row UPDATE attempt — no write policy was weakened'
);

select lives_ok(
  $sql$
    delete from public.admin_users
    where id = '22222222-2222-2222-2222-222222222222'
  $sql$,
  'sales DELETE against admin_users completes without an exception; the trusted-role existence assertion below proves RLS filtered the target to zero rows'
);

-- Reset to the trusted default/superuser role BEFORE this check —
-- running it while still under the sales session would be meaningless:
-- sales' own admin_users RLS only exposes their own row, so this exists()
-- check would return false EITHER WAY (whether the editor row genuinely
-- still exists but sales can't see it, or whether it was actually
-- deleted) — the check couldn't distinguish "correctly unaffected" from
-- "a real bug" at all under that role. The trusted default role sees
-- every row regardless of RLS, which is what this verification needs.
reset role;

select ok(
  exists (select 1 from public.admin_users where id = '22222222-2222-2222-2222-222222222222'),
  'the target row genuinely still exists after the 0-row DELETE attempt — no write policy was weakened'
);

set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set local role authenticated;

select ok(
  (
    select count(*)::int
    from public.list_crm_assignment_admins()
    where id in (
      '11111111-1111-1111-1111-111111111111',
      '33333333-3333-3333-3333-333333333333'
    )
  ) = 2
  and not exists (
    select 1
    from public.list_crm_assignment_admins()
    where id = '22222222-2222-2222-2222-222222222222'
  ),
  'super_admin can call list_crm_assignment_admins(), sees both sales/super_admin fixture rows, and editor remains excluded'
);

reset role;

-- ── list_crm_assignment_admins() — catalog/security assertions (item 6) ─
select ok(
  (select prosecdef from pg_proc where proname = 'list_crm_assignment_admins' and pronamespace = 'public'::regnamespace),
  'list_crm_assignment_admins() is genuinely SECURITY DEFINER (prosecdef = true) in the catalog'
);

select ok(
  exists (
    select 1 from pg_proc p
    cross join lateral pg_options_to_table(p.proconfig) opts
    where p.proname = 'list_crm_assignment_admins' and p.pronamespace = 'public'::regnamespace
      and opts.option_name = 'search_path' and opts.option_value = '""'
  ),
  'list_crm_assignment_admins() has search_path fixed to the empty string, not left to the caller''s own setting'
);

select ok(
  has_function_privilege('authenticated', 'public.list_crm_assignment_admins()', 'execute'),
  'authenticated has EXECUTE on list_crm_assignment_admins()'
);

select ok(
  not has_function_privilege('anon', 'public.list_crm_assignment_admins()', 'execute'),
  'anon does NOT have EXECUTE on list_crm_assignment_admins()'
);

select ok(
  not has_function_privilege('public', 'public.list_crm_assignment_admins()', 'execute'),
  'PUBLIC does NOT have EXECUTE on list_crm_assignment_admins()'
);

-- ══════════════════════════════════════════════════════════════════════
-- Database-level assigned_to guard — inquiries/quote_requests/samples
-- ══════════════════════════════════════════════════════════════════════
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set local role authenticated;

select lives_ok(
  $$ select public.admin_update_inquiry(
       '99999999-9999-9999-9999-999999999970', 'contacted'::public.lead_status, 50,
       '11111111-1111-1111-1111-111111111111', null
     ) $$,
  'assigning to a SALES admin succeeds — valid CRM-capable assignment'
);

select lives_ok(
  $$ select public.admin_update_inquiry(
       '99999999-9999-9999-9999-999999999970', 'contacted'::public.lead_status, 50,
       '33333333-3333-3333-3333-333333333333', null
     ) $$,
  'assigning to a SUPER_ADMIN succeeds — valid CRM-capable assignment'
);

select lives_ok(
  $$ select public.admin_update_inquiry(
       '99999999-9999-9999-9999-999999999970', 'contacted'::public.lead_status, 50,
       null, null
     ) $$,
  'clearing assigned_to (null) remains allowed — the guard only restricts non-null values'
);

select throws_ok(
  $$ select public.admin_update_inquiry(
       '99999999-9999-9999-9999-999999999970', 'contacted'::public.lead_status, 50,
       '22222222-2222-2222-2222-222222222222', null
     ) $$,
  '23514',
  null,
  'assigning to an EDITOR is rejected at the database level, not just excluded from the dropdown — the guard trigger fires regardless of which RPC/path attempts the write'
);

select throws_ok(
  $$ select public.admin_update_inquiry(
       '99999999-9999-9999-9999-999999999970', 'contacted'::public.lead_status, 50,
       '00000000-0000-0000-0000-000000000099', null
     ) $$,
  '23514',
  null,
  'assigning to a nonexistent admin_users id is rejected'
);

-- quote_request — same guard, exercised through the real
-- admin_update_quote_request() mutation boundary, not just inquiries.
select lives_ok(
  $$ select public.admin_update_quote_request(
       '99999999-9999-9999-9999-999999999971', 'quoted'::public.lead_status, 77,
       '11111111-1111-1111-1111-111111111111', null, 'reassignment test'
     ) $$,
  'quote_request: assigning to a SALES admin succeeds via admin_update_quote_request()'
);

select throws_ok(
  $$ select public.admin_update_quote_request(
       '99999999-9999-9999-9999-999999999971', 'quoted'::public.lead_status, 77,
       '22222222-2222-2222-2222-222222222222', null, 'reassignment test'
     ) $$,
  '23514',
  null,
  'quote_request: assigning to an EDITOR is rejected at the database level via admin_update_quote_request()'
);

-- samples — same guard, exercised through the real
-- admin_update_sample_status() mutation boundary.
select lives_ok(
  $$ select public.admin_update_sample_status(
       '99999999-9999-9999-9999-999999999973',
       'approved'::public.sample_status, 'unpaid'::public.payment_status,
       '11111111-1111-1111-1111-111111111111', null, null, 0, 'USD', null, null, null
     ) $$,
  'sample: assigning to a SALES admin succeeds via admin_update_sample_status()'
);

select throws_ok(
  $$ select public.admin_update_sample_status(
       '99999999-9999-9999-9999-999999999973',
       'approved'::public.sample_status, 'unpaid'::public.payment_status,
       '22222222-2222-2222-2222-222222222222', null, null, 0, 'USD', null, null, null
     ) $$,
  '23514',
  null,
  'sample: assigning to an EDITOR is rejected at the database level via admin_update_sample_status()'
);

reset role;

-- ── private.validate_crm_assigned_to() — catalog/privilege proofs ──────
select ok(
  (select prosecdef from pg_proc where proname = 'validate_crm_assigned_to' and pronamespace = 'private'::regnamespace),
  'validate_crm_assigned_to() is genuinely SECURITY DEFINER (prosecdef = true) in the catalog'
);

select ok(
  exists (
    select 1 from pg_proc p
    cross join lateral pg_options_to_table(p.proconfig) opts
    where p.proname = 'validate_crm_assigned_to' and p.pronamespace = 'private'::regnamespace
      and opts.option_name = 'search_path' and opts.option_value = '""'
  ),
  'validate_crm_assigned_to() has search_path fixed to the empty string'
);

select ok(
  not has_function_privilege('public', 'private.validate_crm_assigned_to()', 'execute'),
  'PUBLIC lacks EXECUTE on validate_crm_assigned_to() — it is only ever invoked by the three triggers, never called directly'
);

select ok(
  not has_function_privilege('anon', 'private.validate_crm_assigned_to()', 'execute'),
  'anon lacks EXECUTE on validate_crm_assigned_to()'
);

select ok(
  not has_function_privilege('authenticated', 'private.validate_crm_assigned_to()', 'execute'),
  'authenticated lacks direct EXECUTE on validate_crm_assigned_to() — the trigger still fires regardless, since trigger firing does not require the calling session to hold EXECUTE on the trigger function itself'
);

-- ── Trigger attachment proofs — all three CRM-pipeline tables, firing ───
-- ── only on INSERT or UPDATE OF assigned_to specifically. Uses ─────────
-- ── pg_get_triggerdef() (returns the actual CREATE TRIGGER statement as
-- ── text) rather than decoding pg_trigger.tgtype's bitmask by hand, so
-- ── this checks the real, exact firing condition, not just bare
-- ── attachment.
select ok(
  (
    select pg_get_triggerdef(t.oid) ilike '%before insert or update of assigned_to%'
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_proc p on p.oid = t.tgfoid
    where c.relname = 'inquiries' and p.proname = 'validate_crm_assigned_to' and not t.tgisinternal
  ),
  'validate_crm_assigned_to() fires BEFORE INSERT OR UPDATE OF assigned_to on public.inquiries specifically'
);

select ok(
  (
    select pg_get_triggerdef(t.oid) ilike '%before insert or update of assigned_to%'
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_proc p on p.oid = t.tgfoid
    where c.relname = 'quote_requests' and p.proname = 'validate_crm_assigned_to' and not t.tgisinternal
  ),
  'validate_crm_assigned_to() fires BEFORE INSERT OR UPDATE OF assigned_to on public.quote_requests specifically'
);

select ok(
  (
    select pg_get_triggerdef(t.oid) ilike '%before insert or update of assigned_to%'
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_proc p on p.oid = t.tgfoid
    where c.relname = 'samples' and p.proname = 'validate_crm_assigned_to' and not t.tgisinternal
  ),
  'validate_crm_assigned_to() fires BEFORE INSERT OR UPDATE OF assigned_to on public.samples specifically'
);

-- ══════════════════════════════════════════════════════════════════════
-- search_samples() — full authorization matrix, real fixtures
-- ══════════════════════════════════════════════════════════════════════
set local role anon;

select throws_ok(
  $$ select count(*) from public.search_samples('Overview') $$,
  '42501',
  null,
  'anon has no EXECUTE privilege on search_samples() at all'
);

reset role;

set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set local role authenticated;

select is(
  (select count(*)::int from public.search_samples(null)),
  0,
  'editor receives zero CRM sample records via search_samples() — SECURITY INVOKER means the existing sales-only samples RLS applies to its result set exactly as it would to a direct table query'
);

reset role;

set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set local role authenticated;

select ok(
  exists (select 1 from public.search_samples('Overview Test Sample') where id = '99999999-9999-9999-9999-999999999973'),
  'sales admin finds the fixture sample via search_samples() with a matching term'
);

reset role;

set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set local role authenticated;

select ok(
  exists (select 1 from public.search_samples('Overview Test Sample') where id = '99999999-9999-9999-9999-999999999973'),
  'super_admin finds the fixture sample via search_samples() too'
);

reset role;

-- search_samples() carries an explicit has_admin_role('sales')
-- predicate — a buyer gets ZERO rows through it, including for their OWN
-- sample. Buyer-facing sample access is public.buyer_samples, never the
-- base table directly (its "buyers can view own samples" policy was
-- dropped entirely — see this migration's own base-table fix section)
-- and never search_samples() (CRM-only).
set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
set local role authenticated;

select is(
  (select count(*)::int from public.search_samples(null) where id = '99999999-9999-9999-9999-999999999974'),
  0,
  'a buyer gets ZERO rows via search_samples(), even for their OWN sample — the approved contract is CRM (sales/super_admin) only, not "whatever the caller''s own RLS happens to allow"'
);

select is(
  (select count(*)::int from public.samples where id = '99999999-9999-9999-9999-999999999974'),
  0,
  'the SAME buyer gets ZERO rows querying samples DIRECTLY too, even for their own row — the buyer base-table policy was dropped entirely in this same migration'
);

select is(
  (select count(*)::int from public.buyer_samples where id = '99999999-9999-9999-9999-999999999974'),
  1,
  'the SAME buyer sees their own row through buyer_samples instead — the view''s own buyer_id = auth.uid() predicate is the actual (and only) buyer-facing path now'
);

reset role;

-- Oversized direct-RPC input is REJECTED (22023), not silently
-- truncated — enforced inside the function itself, not just the UI/Zod
-- layer, which a direct RPC call would bypass entirely.
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set local role authenticated;

select throws_ok(
  $$ select count(*) from public.search_samples(repeat('x', 300)) $$,
  '22023',
  null,
  'search_samples() REJECTS a 300-character direct-RPC search term with a validation exception (22023), rather than silently truncating it — enforced inside the function itself, not only in application-layer validation that a direct call would bypass'
);

select lives_ok(
  $$ select count(*) from public.search_samples(repeat('x', 100)) $$,
  'a search term at exactly the 100-character boundary is accepted, not rejected — confirms the limit is ">100", not an off-by-one that rejects valid maximum-length input too'
);

reset role;

-- ── search_samples() — catalog/security assertions (item 6) ────────────
select ok(
  not (select prosecdef from pg_proc where proname = 'search_samples' and pronamespace = 'public'::regnamespace),
  'search_samples() is genuinely SECURITY INVOKER (prosecdef = false) in the catalog — the approved design deliberately layers an explicit role check on top of RLS rather than elevating privilege'
);

select ok(
  has_function_privilege('authenticated', 'public.search_samples(text)', 'execute'),
  'authenticated has EXECUTE on search_samples()'
);

select ok(
  not has_function_privilege('anon', 'public.search_samples(text)', 'execute'),
  'anon does NOT have EXECUTE on search_samples()'
);

select ok(
  not has_function_privilege('public', 'public.search_samples(text)', 'execute'),
  'PUBLIC does NOT have EXECUTE on search_samples()'
);

set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set local role authenticated;

select throws_ok(
  $$ insert into public.samples (name, email, country, product_id, requested_quantity)
     values ('Rogue Sample', 'rogue@example.com', 'US', '99999999-9999-9999-9999-999999999992', 1) $$,
  '42501',
  null,
  'search_samples() being read-only and callable introduces no new direct samples INSERT privilege — sales still has no direct INSERT grant on samples at all'
);

select throws_ok(
  $$ update public.samples set sample_status = 'cancelled'::public.sample_status
     where id = '99999999-9999-9999-9999-999999999973' $$,
  '42501',
  null,
  'search_samples() being callable introduces no new direct samples UPDATE privilege either — no UPDATE grant exists at all (all changes go through admin_update_sample_status())'
);

select throws_ok(
  $$ delete from public.samples where id = '99999999-9999-9999-9999-999999999973' $$,
  '42501',
  null,
  'nor does it introduce a direct samples DELETE privilege — no DELETE grant exists at all'
);

reset role;

-- ══════════════════════════════════════════════════════════════════════
-- buyer_quote_requests / buyer_samples — exact column structure and
-- full security-model catalog proofs (items 1 & 2)
-- ══════════════════════════════════════════════════════════════════════

-- ── buyer_quote_requests: exact column list AND order ───────────────────
select is(
  (
    select array_agg(column_name::text order by ordinal_position)
    from information_schema.columns
    where table_schema = 'public' and table_name = 'buyer_quote_requests'
  ),
  array['id','buyer_id','company_name','email','phone','country','created_at','updated_at']::text[],
  'buyer_quote_requests exposes exactly these 8 columns, in this order — never SELECT *'
);

select is(
  (
    select count(*)::int from information_schema.columns
    where table_schema = 'public' and table_name = 'buyer_quote_requests'
      and column_name = any(array[
        'lead_score','status','assigned_to','follow_up_at','notes',
        'visitor_id','utm_source','utm_medium','utm_campaign',
        'first_touch_source','first_touch_medium',
        'last_touch_source','last_touch_medium','fbp','fbc','event_id'
      ])
  ),
  0,
  'buyer_quote_requests excludes every internal CRM field (lead_score/status/assigned_to/follow_up_at/notes) and every attribution field (visitor_id/utm_*/first_touch_*/last_touch_*/fbp/fbc/event_id)'
);

select is(
  (select relkind from pg_class where relname = 'buyer_quote_requests' and relnamespace = 'public'::regnamespace),
  'v',
  'buyer_quote_requests is genuinely a view in the catalog'
);

select ok(
  exists (
    select 1 from pg_class c
    cross join lateral pg_options_to_table(c.reloptions) opts
    where c.relname = 'buyer_quote_requests' and c.relnamespace = 'public'::regnamespace
      and opts.option_name = 'security_barrier' and opts.option_value = 'true'
  ),
  'buyer_quote_requests has security_barrier=true in the catalog'
);

select ok(
  not exists (
    select 1 from pg_class c
    cross join lateral pg_options_to_table(c.reloptions) opts
    where c.relname = 'buyer_quote_requests' and c.relnamespace = 'public'::regnamespace
      and opts.option_name = 'security_invoker' and opts.option_value = 'true'
  ),
  'buyer_quote_requests does NOT have security_invoker=true — the trusted-owner (definer) execution model is active, the deliberate opposite of admin_lead_overview'
);

select ok(
  exists (
    select 1 from pg_class c
    cross join lateral pg_options_to_table(c.reloptions) opts
    where c.relname = 'buyer_quote_requests' and c.relnamespace = 'public'::regnamespace
      and opts.option_name = 'security_invoker' and opts.option_value = 'false'
  ),
  'buyer_quote_requests genuinely has the security_invoker option present and set to ''false'' in the catalog — not merely absent (which the check above alone would not distinguish from an accidentally-removed option)'
);

select ok(
  (
    select rolname not in ('anon', 'authenticated')
    from pg_class c
    join pg_roles r on r.oid = c.relowner
    where c.relname = 'buyer_quote_requests' and c.relnamespace = 'public'::regnamespace
  ),
  'buyer_quote_requests is owned by a role that is not anon or authenticated by name'
);

select ok(
  (
    select r.rolsuper or r.rolbypassrls
    from pg_class c
    join pg_roles r on r.oid = c.relowner
    where c.relname = 'buyer_quote_requests' and c.relnamespace = 'public'::regnamespace
  ),
  'buyer_quote_requests''s owner genuinely has rolsuper or rolbypassrls — proving actual trusted-owner CAPABILITY, not merely a name that happens not to be anon/authenticated'
);

select ok(
  (
    select c1.relowner = c2.relowner
    from pg_class c1, pg_class c2
    where c1.relname = 'buyer_quote_requests' and c1.relnamespace = 'public'::regnamespace
      and c2.relname = 'quote_requests' and c2.relnamespace = 'public'::regnamespace
  ),
  'buyer_quote_requests is owned by the SAME role that owns the underlying quote_requests table — the exact ownership relationship the trusted-owner execution model depends on'
);

select ok(
  pg_get_viewdef('public.buyer_quote_requests'::regclass) ilike '%buyer_id = auth.uid()%',
  'buyer_quote_requests''s actual definition contains the explicit buyer_id = auth.uid() ownership predicate'
);

select ok(
  pg_get_viewdef('public.buyer_quote_requests'::regclass) !~ '\*',
  'buyer_quote_requests''s definition contains no asterisk anywhere — confirms an explicit column list, never SELECT *'
);

select ok(
  has_table_privilege('authenticated', 'public.buyer_quote_requests', 'select'),
  'authenticated has SELECT on buyer_quote_requests'
);

select ok(
  not has_table_privilege('anon', 'public.buyer_quote_requests', 'select'),
  'anon does NOT have SELECT on buyer_quote_requests'
);

select ok(
  not exists (
    select 1 from pg_class c, aclexplode(c.relacl) a
    where c.relname = 'buyer_quote_requests' and c.relnamespace = 'public'::regnamespace
      and a.grantee = 0 and a.privilege_type = 'SELECT'
  ),
  'PUBLIC has no SELECT ACL entry on buyer_quote_requests (checked via aclexplode, since has_table_privilege cannot reliably represent the PUBLIC pseudo-role)'
);

select ok(
  not has_table_privilege('authenticated', 'public.buyer_quote_requests', 'insert'),
  'authenticated has no INSERT on buyer_quote_requests'
);

select ok(
  not has_table_privilege('authenticated', 'public.buyer_quote_requests', 'update'),
  'authenticated has no UPDATE on buyer_quote_requests'
);

select ok(
  not has_table_privilege('authenticated', 'public.buyer_quote_requests', 'delete'),
  'authenticated has no DELETE on buyer_quote_requests'
);

select ok(
  not has_table_privilege('anon', 'public.buyer_quote_requests', 'insert')
  and not has_table_privilege('anon', 'public.buyer_quote_requests', 'update')
  and not has_table_privilege('anon', 'public.buyer_quote_requests', 'delete'),
  'anon has no INSERT/UPDATE/DELETE on buyer_quote_requests'
);

select ok(
  not exists (
    select 1 from pg_class c, aclexplode(c.relacl) a
    where c.relname = 'buyer_quote_requests' and c.relnamespace = 'public'::regnamespace
      and a.grantee = 0 and a.privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  ),
  'PUBLIC has no INSERT/UPDATE/DELETE ACL entry on buyer_quote_requests'
);

-- ── buyer_samples: exact column list AND order ──────────────────────────
select is(
  (
    select array_agg(column_name::text order by ordinal_position)
    from information_schema.columns
    where table_schema = 'public' and table_name = 'buyer_samples'
  ),
  array[
    'id','buyer_id','name','email','phone','company_name','country',
    'quote_request_id','product_id','requested_quantity','sample_charge',
    'currency','payment_status','shipping_country','shipping_address',
    'shipping_port','courier_name','tracking_number','sample_status',
    'created_at','updated_at'
  ]::text[],
  'buyer_samples exposes exactly these 21 columns, in this order — never SELECT *'
);

select is(
  (
    select count(*)::int from information_schema.columns
    where table_schema = 'public' and table_name = 'buyer_samples'
      and column_name = any(array['assigned_to', 'inquiry_id', 'email_normalized'])
  ),
  0,
  'buyer_samples excludes assigned_to (internal staff identifier), inquiry_id (inquiries have no buyer-ownership concept), and email_normalized (internal generated column)'
);

select is(
  (select relkind from pg_class where relname = 'buyer_samples' and relnamespace = 'public'::regnamespace),
  'v',
  'buyer_samples is genuinely a view in the catalog'
);

select ok(
  exists (
    select 1 from pg_class c
    cross join lateral pg_options_to_table(c.reloptions) opts
    where c.relname = 'buyer_samples' and c.relnamespace = 'public'::regnamespace
      and opts.option_name = 'security_barrier' and opts.option_value = 'true'
  ),
  'buyer_samples has security_barrier=true in the catalog'
);

select ok(
  not exists (
    select 1 from pg_class c
    cross join lateral pg_options_to_table(c.reloptions) opts
    where c.relname = 'buyer_samples' and c.relnamespace = 'public'::regnamespace
      and opts.option_name = 'security_invoker' and opts.option_value = 'true'
  ),
  'buyer_samples does NOT have security_invoker=true — the trusted-owner (definer) execution model is active'
);

select ok(
  exists (
    select 1 from pg_class c
    cross join lateral pg_options_to_table(c.reloptions) opts
    where c.relname = 'buyer_samples' and c.relnamespace = 'public'::regnamespace
      and opts.option_name = 'security_invoker' and opts.option_value = 'false'
  ),
  'buyer_samples genuinely has the security_invoker option present and set to ''false'' in the catalog — not merely absent'
);

select ok(
  (
    select rolname not in ('anon', 'authenticated')
    from pg_class c
    join pg_roles r on r.oid = c.relowner
    where c.relname = 'buyer_samples' and c.relnamespace = 'public'::regnamespace
  ),
  'buyer_samples is owned by a role that is not anon or authenticated by name'
);

select ok(
  (
    select r.rolsuper or r.rolbypassrls
    from pg_class c
    join pg_roles r on r.oid = c.relowner
    where c.relname = 'buyer_samples' and c.relnamespace = 'public'::regnamespace
  ),
  'buyer_samples''s owner genuinely has rolsuper or rolbypassrls — proving actual trusted-owner CAPABILITY'
);

select ok(
  (
    select c1.relowner = c2.relowner
    from pg_class c1, pg_class c2
    where c1.relname = 'buyer_samples' and c1.relnamespace = 'public'::regnamespace
      and c2.relname = 'samples' and c2.relnamespace = 'public'::regnamespace
  ),
  'buyer_samples is owned by the SAME role that owns the underlying samples table'
);

select ok(
  pg_get_viewdef('public.buyer_samples'::regclass) ilike '%buyer_id = auth.uid()%',
  'buyer_samples''s actual definition contains the explicit buyer_id = auth.uid() ownership predicate'
);

select ok(
  pg_get_viewdef('public.buyer_samples'::regclass) !~ '\*',
  'buyer_samples''s definition contains no asterisk anywhere — confirms an explicit column list, never SELECT *'
);

select ok(
  has_table_privilege('authenticated', 'public.buyer_samples', 'select'),
  'authenticated has SELECT on buyer_samples'
);

select ok(
  not has_table_privilege('anon', 'public.buyer_samples', 'select'),
  'anon does NOT have SELECT on buyer_samples'
);

select ok(
  not exists (
    select 1 from pg_class c, aclexplode(c.relacl) a
    where c.relname = 'buyer_samples' and c.relnamespace = 'public'::regnamespace
      and a.grantee = 0 and a.privilege_type = 'SELECT'
  ),
  'PUBLIC has no SELECT ACL entry on buyer_samples'
);

select ok(
  not has_table_privilege('authenticated', 'public.buyer_samples', 'insert'),
  'authenticated has no INSERT on buyer_samples'
);

select ok(
  not has_table_privilege('authenticated', 'public.buyer_samples', 'update'),
  'authenticated has no UPDATE on buyer_samples'
);

select ok(
  not has_table_privilege('authenticated', 'public.buyer_samples', 'delete'),
  'authenticated has no DELETE on buyer_samples'
);

select ok(
  not has_table_privilege('anon', 'public.buyer_samples', 'insert')
  and not has_table_privilege('anon', 'public.buyer_samples', 'update')
  and not has_table_privilege('anon', 'public.buyer_samples', 'delete'),
  'anon has no INSERT/UPDATE/DELETE on buyer_samples'
);

select ok(
  not exists (
    select 1 from pg_class c, aclexplode(c.relacl) a
    where c.relname = 'buyer_samples' and c.relnamespace = 'public'::regnamespace
      and a.grantee = 0 and a.privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  ),
  'PUBLIC has no INSERT/UPDATE/DELETE ACL entry on buyer_samples'
);

-- Second quote_request fixture, owned by the OTHER buyer — needed for
-- the bidirectional isolation tests below (buyer one already owns
-- 99999999...972 from the earlier leak-regression fixtures).
insert into public.quote_requests (id, buyer_id, company_name, email, country)
values (
  '99999999-9999-9999-9999-999999999975',
  '55555555-5555-5555-5555-555555555555',
  'Buyer Two Owned Quote Co', 'buyer-two-owned-quoterequest@example.com', 'US'
)
on conflict (id) do nothing;

-- ══════════════════════════════════════════════════════════════════════
-- Bidirectional buyer_quote_requests isolation (item 3)
-- ══════════════════════════════════════════════════════════════════════
set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
set local role authenticated;

select is(
  (select count(*)::int from public.quote_requests),
  0,
  'buyer one (44444444...) gets zero rows from quote_requests directly, full stop — no base-table access exists for buyers at all'
);

select is(
  (select count(*)::int from public.buyer_quote_requests where id = '99999999-9999-9999-9999-999999999972'),
  1,
  'buyer one sees ONLY their own row through buyer_quote_requests'
);

select is(
  (select count(*)::int from public.buyer_quote_requests where id = '99999999-9999-9999-9999-999999999975'),
  0,
  'buyer one cannot see buyer two''s row through buyer_quote_requests'
);

reset role;
set local request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
set local role authenticated;

select is(
  (select count(*)::int from public.quote_requests),
  0,
  'buyer two gets zero rows from quote_requests directly, full stop'
);

select is(
  (select count(*)::int from public.buyer_quote_requests where id = '99999999-9999-9999-9999-999999999975'),
  1,
  'buyer two sees ONLY their own row through buyer_quote_requests'
);

select is(
  (select count(*)::int from public.buyer_quote_requests where id = '99999999-9999-9999-9999-999999999972'),
  0,
  'buyer two cannot see buyer one''s row through buyer_quote_requests'
);

reset role;

-- ══════════════════════════════════════════════════════════════════════
-- Admin CRM access remains fully intact (item 4) — base-table access for
-- sales/super_admin was never touched, only the buyer policies were
-- removed. admin_lead_overview itself was already extensively tested
-- above; this confirms the underlying base tables directly too.
-- ══════════════════════════════════════════════════════════════════════
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set local role authenticated;

select ok(
  (select count(*)::int from public.quote_requests) >= 2,
  'sales admin still has full direct base-table access to quote_requests — unaffected by the buyer policy removal'
);

select ok(
  (select count(*)::int from public.samples) >= 1,
  'sales admin still has full direct base-table access to samples'
);

select ok(
  (select count(*)::int from public.admin_lead_overview) >= 2,
  'admin_lead_overview still returns the expected CRM rows for a sales session, unaffected by this fix'
);

reset role;
set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set local role authenticated;

select ok(
  (select count(*)::int from public.quote_requests) >= 2,
  'super_admin still has full direct base-table access to quote_requests'
);

select ok(
  (select count(*)::int from public.samples) >= 1,
  'super_admin still has full direct base-table access to samples'
);

reset role;

-- ══════════════════════════════════════════════════════════════════════
-- quote_request_items buyer ownership — mediated entirely by
-- private.can_access_quote_request(), never by base-table visibility
-- (item 5)
-- ══════════════════════════════════════════════════════════════════════
select ok(
  (
    select prosecdef from pg_proc
    where proname = 'can_access_quote_request' and pronamespace = 'private'::regnamespace
  ),
  'private.can_access_quote_request() remains SECURITY DEFINER'
);

select ok(
  exists (
    select 1 from pg_proc p
    cross join lateral pg_options_to_table(p.proconfig) opts
    where p.proname = 'can_access_quote_request' and p.pronamespace = 'private'::regnamespace
      and opts.option_name = 'search_path' and opts.option_value = '""'
  ),
  'private.can_access_quote_request() has search_path fixed to the empty string'
);

-- Seed a real quote_request_item on buyer one's owned quote_request
-- (972), as the trusted default role.
insert into public.quote_request_items (quote_request_id, product_id, quantity)
values ('99999999-9999-9999-9999-999999999972', '99999999-9999-9999-9999-999999999992', 3)
on conflict do nothing;

set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
set local role authenticated;

select is(
  (select count(*)::int from public.quote_requests),
  0,
  'sanity check restated: buyer one still gets zero rows from quote_requests directly at this point in the test'
);

select ok(
  exists (
    select 1 from public.quote_request_items
    where quote_request_id = '99999999-9999-9999-9999-999999999972'
  ),
  'buyer one CAN read their own permitted quote_request_items — proves access is genuinely mediated by can_access_quote_request(), not by any base-table visibility (which is now zero, confirmed immediately above)'
);

reset role;
set local request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
set local role authenticated;

select is(
  (
    select count(*)::int from public.quote_request_items
    where quote_request_id = '99999999-9999-9999-9999-999999999972'
  ),
  0,
  'buyer two (a DIFFERENT buyer) cannot read buyer one''s quote_request_items — ownership-mediated, not a blanket allow'
);

reset role;

-- ══════════════════════════════════════════════════════════════════════
-- Bidirectional buyer_samples isolation via REAL submit_sample_request()
-- calls, asserting on the actual RETURNED ids (items 3 & 4) — not email
-- matching, and not the earlier direct-insert fixtures.
-- ══════════════════════════════════════════════════════════════════════

-- The RPC's own declared return type is a bare uuid — never a row or
-- record — so there is no internal-column exposure possible through the
-- return value itself, independent of anything tested below.
select is(
  (select prorettype::regtype::text from pg_proc where proname = 'submit_sample_request' and pronamespace = 'public'::regnamespace),
  'uuid',
  'submit_sample_request() is declared to return a bare uuid — never a row/record, so its return value alone cannot expose any internal column'
);

set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
set local role authenticated;

select lives_ok(
  format(
    $$ select set_config(
         'crazycraft_test.buyer_one_rpc_sample_id',
         (select public.submit_sample_request(
           'Buyer One RPC Sample', 'buyer-one-rpc-sample@example.com', null, null, 'US',
           '%s', 1, null
         ))::text,
         true
       ) $$,
    '99999999-9999-9999-9999-999999999992'
  ),
  'buyer one creates a real sample via submit_sample_request(), capturing the actual returned id for the assertions below'
);

reset role;
set local request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
set local role authenticated;

select lives_ok(
  format(
    $$ select set_config(
         'crazycraft_test.buyer_two_rpc_sample_id',
         (select public.submit_sample_request(
           'Buyer Two RPC Sample', 'buyer-two-rpc-sample@example.com', null, null, 'DE',
           '%s', 1, null
         ))::text,
         true
       ) $$,
    '99999999-9999-9999-9999-999999999992'
  ),
  'buyer two creates their own real sample via submit_sample_request(), capturing a DIFFERENT returned id'
);

reset role;

-- ── Buyer one's perspective on the two REAL, RPC-returned ids ──────────
set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
set local role authenticated;

select is(
  (
    select count(*)::int from public.buyer_samples
    where id = current_setting('crazycraft_test.buyer_one_rpc_sample_id')::uuid
  ),
  1,
  'buyer one sees their OWN returned sample id through buyer_samples'
);

select is(
  (
    select count(*)::int from public.samples
    where id = current_setting('crazycraft_test.buyer_one_rpc_sample_id')::uuid
  ),
  0,
  'buyer one gets ZERO rows for that exact same returned id through public.samples directly — base-table access is gone, not just filtered'
);

select is(
  (
    select count(*)::int from public.buyer_samples
    where id = current_setting('crazycraft_test.buyer_two_rpc_sample_id')::uuid
  ),
  0,
  'buyer one cannot see buyer two''s returned sample id through buyer_samples'
);

reset role;

-- ── Buyer two's perspective — the symmetric other half ──────────────────
set local request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
set local role authenticated;

select is(
  (
    select count(*)::int from public.buyer_samples
    where id = current_setting('crazycraft_test.buyer_two_rpc_sample_id')::uuid
  ),
  1,
  'buyer two sees their OWN returned sample id through buyer_samples'
);

select is(
  (
    select count(*)::int from public.samples
    where id = current_setting('crazycraft_test.buyer_two_rpc_sample_id')::uuid
  ),
  0,
  'buyer two gets ZERO rows for that exact same returned id through public.samples directly'
);

select is(
  (
    select count(*)::int from public.buyer_samples
    where id = current_setting('crazycraft_test.buyer_one_rpc_sample_id')::uuid
  ),
  0,
  'buyer two cannot see buyer one''s returned sample id through buyer_samples'
);

reset role;

select * from finish();
rollback;
