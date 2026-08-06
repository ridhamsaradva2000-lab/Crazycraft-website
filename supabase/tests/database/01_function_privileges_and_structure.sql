-- 01_function_privileges_and_structure.sql
-- Run via: supabase test db
-- No role switching needed — has_function_privilege() and the RLS/
-- bootstrap checks below query catalog state directly and are true
-- regardless of the calling role.

begin;
select plan(34);

-- ── authenticated CAN execute every approved RPC ────────────────────────
select ok(
  has_function_privilege('authenticated', 'public.admin_verify_buyer(uuid, boolean)', 'execute'),
  'authenticated has EXECUTE on admin_verify_buyer'
);

select ok(
  has_function_privilege('authenticated', 'public.admin_update_inquiry(uuid, public.lead_status, integer, uuid, timestamptz)', 'execute'),
  'authenticated has EXECUTE on admin_update_inquiry'
);

select ok(
  has_function_privilege('authenticated', 'public.admin_update_quote_request(uuid, public.lead_status, integer, uuid, timestamptz, text)', 'execute'),
  'authenticated has EXECUTE on admin_update_quote_request'
);

select ok(
  has_function_privilege('authenticated', 'public.admin_update_sample_status(uuid, public.sample_status, public.payment_status, uuid, text, text, numeric, text, text, text, text)', 'execute'),
  'authenticated has EXECUTE on admin_update_sample_status'
);

select ok(
  has_function_privilege('authenticated', 'public.submit_quote_request(text, text, text, text, text, text, text, text, text, text, text, text, text, text, uuid, jsonb)', 'execute'),
  'authenticated has EXECUTE on submit_quote_request'
);

select ok(
  has_function_privilege('authenticated', 'public.submit_sample_request(text, text, text, text, text, uuid, integer, uuid)', 'execute'),
  'authenticated has EXECUTE on submit_sample_request'
);

-- ── anon CANNOT execute any admin-only RPC ──────────────────────────────
select ok(
  not has_function_privilege('anon', 'public.admin_verify_buyer(uuid, boolean)', 'execute'),
  'anon does NOT have EXECUTE on admin_verify_buyer'
);

select ok(
  not has_function_privilege('anon', 'public.admin_update_inquiry(uuid, public.lead_status, integer, uuid, timestamptz)', 'execute'),
  'anon does NOT have EXECUTE on admin_update_inquiry'
);

select ok(
  not has_function_privilege('anon', 'public.admin_update_quote_request(uuid, public.lead_status, integer, uuid, timestamptz, text)', 'execute'),
  'anon does NOT have EXECUTE on admin_update_quote_request'
);

select ok(
  not has_function_privilege('anon', 'public.admin_update_sample_status(uuid, public.sample_status, public.payment_status, uuid, text, text, numeric, text, text, text, text)', 'execute'),
  'anon does NOT have EXECUTE on admin_update_sample_status'
);

-- ── anon CAN execute submit_quote_request / submit_sample_request ──────
-- ── (guests submit RFQs and sample requests) ────────────────────────────
select ok(
  has_function_privilege('anon', 'public.submit_quote_request(text, text, text, text, text, text, text, text, text, text, text, text, text, text, uuid, jsonb)', 'execute'),
  'anon has EXECUTE on submit_quote_request'
);

select ok(
  has_function_privilege('anon', 'public.submit_sample_request(text, text, text, text, text, uuid, integer, uuid)', 'execute'),
  'anon has EXECUTE on submit_sample_request'
);

-- ── submit_inquiry() is service_role-only as of Module 4's security ─────
-- ── correction — NOT anon, NOT authenticated, NOT PUBLIC. Neither the ───
-- ── publishable key nor a buyer's own session can reach it directly; ────
-- ── only the trusted server action, holding the secret key, can. ────────
-- ── (log_inquiry_attempt() no longer exists as a separate function — ────
-- ── its logic was folded into submit_inquiry() itself, and this same ────
-- ── boundary now covers it.) ──────────────────────────────────────────────
select ok(
  not has_function_privilege('anon', 'public.submit_inquiry(uuid, text, text, text, public.business_type, text, text, text, text, text, public.moq_familiarity, public.purchase_timeline, text, public.incoterm, boolean, boolean, text, inet, text, text, text, text, text, text, text, text, text, text, text, text, text, uuid, text)', 'execute'),
  'anon does NOT have EXECUTE on submit_inquiry'
);

select ok(
  not has_function_privilege('authenticated', 'public.submit_inquiry(uuid, text, text, text, public.business_type, text, text, text, text, text, public.moq_familiarity, public.purchase_timeline, text, public.incoterm, boolean, boolean, text, inet, text, text, text, text, text, text, text, text, text, text, text, text, text, uuid, text)', 'execute'),
  'authenticated does NOT have EXECUTE on submit_inquiry'
);

select ok(
  has_function_privilege('service_role', 'public.submit_inquiry(uuid, text, text, text, public.business_type, text, text, text, text, text, public.moq_familiarity, public.purchase_timeline, text, public.incoterm, boolean, boolean, text, inet, text, text, text, text, text, text, text, text, text, text, text, text, text, uuid, text)', 'execute'),
  'service_role HAS EXECUTE on submit_inquiry — the one and only intended caller'
);

-- ── private-schema helper functions: correct EXECUTE scoping ────────────
select ok(
  has_function_privilege('authenticated', 'private.is_admin()', 'execute'),
  'authenticated has EXECUTE on private.is_admin'
);

select ok(
  has_function_privilege('anon', 'private.is_admin()', 'execute'),
  'anon has EXECUTE on private.is_admin (needed for RLS policies anon triggers)'
);

select ok(
  has_function_privilege('authenticated', 'private.has_admin_role(public.admin_role)', 'execute'),
  'authenticated has EXECUTE on private.has_admin_role'
);

select ok(
  has_function_privilege('anon', 'private.has_admin_role(public.admin_role)', 'execute'),
  'anon has EXECUTE on private.has_admin_role'
);

select ok(
  has_function_privilege('authenticated', 'private.can_access_quote_request(uuid)', 'execute'),
  'authenticated has EXECUTE on private.can_access_quote_request'
);

select ok(
  not has_function_privilege('anon', 'private.can_access_quote_request(uuid)', 'execute'),
  'anon does NOT have EXECUTE on private.can_access_quote_request (authenticated-only by design)'
);

-- ── trigger functions are never directly executable by any session role ─
select ok(
  not has_function_privilege('anon', 'public.set_updated_at()', 'execute'),
  'anon does NOT have EXECUTE on set_updated_at (trigger-only function)'
);

select ok(
  not has_function_privilege('authenticated', 'public.set_updated_at()', 'execute'),
  'authenticated does NOT have EXECUTE on set_updated_at (trigger-only function)'
);

select ok(
  not has_function_privilege('anon', 'private.buyers_guard_insert()', 'execute'),
  'anon does NOT have EXECUTE on the buyers_guard_insert trigger function'
);

select ok(
  not has_function_privilege('authenticated', 'private.buyers_guard_insert()', 'execute'),
  'authenticated does NOT have EXECUTE on the buyers_guard_insert trigger function'
);

select ok(
  not has_function_privilege('authenticated', 'private.lead_activity_log_guard_insert()', 'execute'),
  'authenticated does NOT have EXECUTE on the lead_activity_log_guard_insert trigger function'
);

-- ── postgres-owned default-function ACL grants EXECUTE to neither ──────
-- ── PUBLIC, anon, nor authenticated — global baseline plus schema ──────
-- ── overrides ────────────────────────────────────────────────────────────
--
-- CORRECTED (second correction to this test, per further runtime
-- evidence): the grants migration now relies on a GLOBAL (no "IN SCHEMA")
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres entry as the guaranteed
-- baseline — direct inspection of pg_default_acl showed the public
-- schema's own entry was present and correct, but no entry existed for
-- the private schema at all, meaning private-schema functions were still
-- falling back to Postgres's hardcoded "PUBLIC gets execute" default
-- before the global rule was added.
--
-- These tests now check the security model actually in force:
--   1&2. The GLOBAL postgres-owned default-function ACL (no specific
--        schema — defaclnamespace = 0) is the guaranteed baseline: it
--        MUST exist, and must grant EXECUTE to neither PUBLIC nor
--        anon/authenticated.
--   3&4. The public and private schema-SPECIFIC entries are optional
--        overrides layered on top. Each is checked for "does not grant
--        EXECUTE to PUBLIC/anon/authenticated if it exists at all" — a
--        missing schema-specific row is explicitly acceptable here,
--        since the global baseline above already covers that case. This
--        matches confirmed reality: a schema-specific row is not always
--        materialized, and the global rule is what must be relied upon.

select ok(
  exists (
    select 1 from pg_default_acl da
    where da.defaclrole = 'postgres'::regrole
      and da.defaclnamespace = 0
      and da.defaclobjtype = 'f'
  )
  and not exists (
    select 1
    from pg_default_acl da
    cross join lateral aclexplode(da.defaclacl) as ex(grantor, grantee, privilege_type, is_grantable)
    where da.defaclrole = 'postgres'::regrole
      and da.defaclnamespace = 0
      and da.defaclobjtype = 'f'
      and ex.grantee = 0 -- 0 = the PUBLIC pseudo-role in an exploded aclitem
      and ex.privilege_type = 'EXECUTE'
  ),
  'the GLOBAL postgres-owned default-function ACL exists and grants no EXECUTE to PUBLIC'
);

select ok(
  exists (
    select 1 from pg_default_acl da
    where da.defaclrole = 'postgres'::regrole
      and da.defaclnamespace = 0
      and da.defaclobjtype = 'f'
  )
  and not exists (
    select 1
    from pg_default_acl da
    cross join lateral aclexplode(da.defaclacl) as ex(grantor, grantee, privilege_type, is_grantable)
    where da.defaclrole = 'postgres'::regrole
      and da.defaclnamespace = 0
      and da.defaclobjtype = 'f'
      and ex.grantee in ('anon'::regrole::oid, 'authenticated'::regrole::oid)
      and ex.privilege_type = 'EXECUTE'
  ),
  'the GLOBAL postgres-owned default-function ACL exists and grants EXECUTE to neither anon nor authenticated'
);

select ok(
  not exists (
    select 1
    from pg_default_acl da
    cross join lateral aclexplode(da.defaclacl) as ex(grantor, grantee, privilege_type, is_grantable)
    where da.defaclrole = 'postgres'::regrole
      and da.defaclnamespace = 'public'::regnamespace
      and da.defaclobjtype = 'f'
      and ex.grantee in (0, 'anon'::regrole::oid, 'authenticated'::regrole::oid)
      and ex.privilege_type = 'EXECUTE'
  ),
  'the public schema has no default-function ACL override granting EXECUTE to PUBLIC, anon, or authenticated (a missing override row is fine — the global baseline covers it)'
);

select ok(
  not exists (
    select 1
    from pg_default_acl da
    cross join lateral aclexplode(da.defaclacl) as ex(grantor, grantee, privilege_type, is_grantable)
    where da.defaclrole = 'postgres'::regrole
      and da.defaclnamespace = 'private'::regnamespace
      and da.defaclobjtype = 'f'
      and ex.grantee in (0, 'anon'::regrole::oid, 'authenticated'::regrole::oid)
      and ex.privilege_type = 'EXECUTE'
  ),
  'the private schema has no default-function ACL override granting EXECUTE to PUBLIC, anon, or authenticated (a missing override row is fine — the global baseline covers it)'
);

-- ── every table in the public schema has RLS enabled ────────────────────
select is(
  (
    select count(*)::int from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false
  ),
  0,
  'every table in the public schema has row level security enabled'
);

-- ── bootstrap reference data (from the bootstrap-data migration) ───────
select ok(
  (select count(*)::int from public.lead_scoring_rules) >= 11,
  'lead_scoring_rules bootstrap data is present (>= 11 rows)'
);

select ok(
  (select count(*)::int from public.categories) >= 5,
  'categories bootstrap data is present (>= 5 rows)'
);

select ok(
  (select count(*)::int from public.site_settings) >= 2,
  'site_settings bootstrap data is present (>= 2 rows)'
);

select * from finish();
rollback;
