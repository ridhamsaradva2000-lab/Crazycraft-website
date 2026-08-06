-- 20260725121400_create_grants.sql
--
-- Baseline: revoke everything — including the PUBLIC pseudo-role, which
-- Postgres grants EXECUTE to by default on every new function unless
-- explicitly revoked — then grant back exactly what each role needs, at
-- the column level where it matters.
--
-- IMPORTANT ORDERING NOTE: the blanket revokes below apply to every table
-- and function in `public` AND `private`, including ones earlier
-- migrations already granted EXECUTE on. Those grants are explicitly
-- re-applied in the "RPC / helper execute grants" section further down.
--
-- Design note on inquiries / quote_requests / quote_request_items /
-- samples: NO direct UPDATE grant is given to `authenticated` on
-- inquiries/quote_requests/samples at all, and NO direct INSERT grant is
-- given on quote_requests or quote_request_items to anyone. Every write to
-- these specific surfaces goes through a SECURITY DEFINER RPC, which
-- bypasses table-level grants entirely for its own internal INSERT/UPDATE
-- while independently re-checking authorization itself.

revoke all on all tables in schema public from anon, authenticated;

revoke execute on all functions in schema public from public, anon, authenticated, service_role;
revoke execute on all functions in schema private from public, anon, authenticated, service_role;

grant usage on schema public to anon, authenticated;

-- ── categories / collections / product_collections ──────────────────────
grant select on categories to anon, authenticated;
grant insert, update, delete on categories to authenticated;

grant select on collections to anon, authenticated;
grant insert, update, delete on collections to authenticated;

grant select on product_collections to anon, authenticated;
grant insert, update, delete on product_collections to authenticated;

-- ── products / images / variants ────────────────────────────────────────
grant select on products to anon, authenticated;
grant insert, update, delete on products to authenticated;

grant select on product_images to anon, authenticated;
grant insert, update, delete on product_images to authenticated;

grant select on product_variants to anon, authenticated;
grant insert, update, delete on product_variants to authenticated;

-- ── blog_posts ───────────────────────────────────────────────────────────
grant select on blog_posts to anon, authenticated;
grant insert, update, delete on blog_posts to authenticated;

-- ── admin_users ──────────────────────────────────────────────────────────
grant select on admin_users to authenticated;
grant insert, update, delete on admin_users to authenticated; -- RLS restricts to super_admin

-- ── buyers ───────────────────────────────────────────────────────────────
grant select on buyers to authenticated;

-- verified and created_at are never in the column list — a buyer's INSERT
-- literally cannot name them, regardless of what a malicious client sends.
grant insert (id, company_name, business_type, country, phone, website)
  on buyers to authenticated;

-- verified is NOT in this list either — the only sanctioned way to change
-- it is admin_verify_buyer(), which runs as SECURITY DEFINER and bypasses
-- this grant for its own internal UPDATE. A buyer's direct attempt to
-- UPDATE verified fails here, at the grant layer, with a plain Postgres
-- permission-denied error — it never reaches the guard trigger at all.
-- The guard trigger (trg_buyers_guard_update) remains in place purely as
-- defense in depth, in case a future migration ever loosens this grant.
grant update (company_name, business_type, country, phone, website)
  on buyers to authenticated;

-- ── inquiries ────────────────────────────────────────────────────────────
grant select on inquiries to authenticated; -- RLS narrows this to sales/super_admin only

-- qualification_stage is deliberately ABSENT from this list. Public
-- submissions always start at the column default (1) — a caller can never
-- supply their own stage value. Stage advancement is a later-module
-- concern (a protected server path/RPC once the progressive-RFQ UI is
-- built), not something accepted as raw input here.
grant insert (
  product_id, name, email, country, business_type,
  inquiry_type, message, company_name, company_website, linkedin_url,
  volume_range, moq_familiarity, timeline, shipping_country,
  incoterm_preference, private_label_required, visitor_id, utm_source,
  utm_medium, utm_campaign, referrer, landing_page, first_touch_source,
  first_touch_medium, first_touch_campaign, last_touch_source,
  last_touch_medium, last_touch_campaign, fbp, fbc, event_id
) on inquiries to anon, authenticated;
-- lead_score, status, assigned_to, follow_up_at, created_at, updated_at,
-- qualification_stage are absent from this list on purpose.

-- No UPDATE grant at all. All changes via admin_update_inquiry().

-- ── quote_requests ───────────────────────────────────────────────────────
grant select on quote_requests to authenticated; -- RLS narrows to own-row (buyer) or sales/super_admin

-- No INSERT grant to anon or authenticated at all. Creation happens
-- exclusively through public.submit_quote_request(). No UPDATE grant
-- either — all changes via admin_update_quote_request().

-- ── quote_request_items ──────────────────────────────────────────────────
grant select on quote_request_items to authenticated; -- RLS narrows to owning buyer or admin

-- No INSERT grant to anon or authenticated at all — every row is created
-- exclusively inside public.submit_quote_request(). Admins retain direct
-- write access for CRM tooling (Module 5):
grant insert, update, delete on quote_request_items to authenticated; -- RLS restricts to admins

-- ── samples ──────────────────────────────────────────────────────────────
grant select on samples to authenticated; -- RLS narrows to own-row (buyer) or sales/super_admin

-- No INSERT grant to anon or authenticated at all. public.submit_sample_request()
-- is the ONLY way to create a sample request — it validates the product is
-- published, derives buyer_id from auth.uid() (never trusts caller input),
-- verifies quote_request ownership before accepting any linkage, and
-- returns only the new sample id. A direct table INSERT is not a
-- supported path for any non-admin caller; inquiry_id and quote_request_id
-- were never in this grant to begin with (inquiries have no ownership
-- concept at all, so inquiry_id is never accepted from a public caller by
-- any path). No UPDATE grant either — all changes via
-- admin_update_sample_status().

-- ── saved_products ───────────────────────────────────────────────────────
grant select, insert, delete on saved_products to authenticated; -- RLS restricts to buyer's own rows

-- ── lead_activity_log ────────────────────────────────────────────────────
grant select on lead_activity_log to authenticated; -- RLS restricts to sales/super_admin

-- created_by, created_at, and id are deliberately ABSENT from this list.
-- Authorship and timestamp are forced by trg_lead_activity_log_guard_insert
-- (see the guard-triggers migration) regardless — this grant is the
-- belt-and-suspenders companion: a caller can't even name those columns,
-- so there's no way to submit a forged author or backdated timestamp,
-- whether or not the trigger is present.
grant insert (inquiry_id, quote_request_id, sample_id, event_type, note)
  on lead_activity_log to authenticated;

-- ── lead_scoring_rules ───────────────────────────────────────────────────
grant select on lead_scoring_rules to authenticated;
grant insert, update, delete on lead_scoring_rules to authenticated; -- RLS restricts to super_admin

-- ── attribution_events ───────────────────────────────────────────────────
-- id and created_at are absent — both have defaults, and a public caller
-- has no legitimate reason to set either.
grant insert (
  visitor_id, event_type, page_path, utm_source, utm_medium,
  utm_campaign, referrer, landing_page
) on attribution_events to anon, authenticated;
grant select on attribution_events to authenticated; -- RLS restricts to admins

-- ── capi_events / capi_event_log ─────────────────────────────────────────
-- No grants at all for anon or authenticated. Only a service-role client
-- (bypasses grants and RLS both) can touch these — introduced in Module 7.

-- ── media_library ────────────────────────────────────────────────────────
grant select, insert, update, delete on media_library to authenticated; -- RLS restricts to admins

-- ── seo_metadata ─────────────────────────────────────────────────────────
grant select on seo_metadata to anon, authenticated;
grant insert, update, delete on seo_metadata to authenticated; -- RLS restricts to admins

-- ── site_settings ────────────────────────────────────────────────────────
grant select on site_settings to anon, authenticated;
grant insert, update, delete on site_settings to authenticated; -- RLS restricts to super_admin

-- ── newsletter_subscribers ───────────────────────────────────────────────
-- id and subscribed_at are absent — both have defaults.
grant insert (email, source) on newsletter_subscribers to anon, authenticated;
grant select on newsletter_subscribers to authenticated; -- RLS restricts to admins

-- ══════════════════════════════════════════════════════════════════════
-- Private-schema helper function execute grants
-- ══════════════════════════════════════════════════════════════════════
-- Re-applied after the blanket "from public, anon, authenticated" revoke
-- above. These are the only three functions in `private` any non-superuser
-- role may ever call — every other function in that schema (guard-trigger
-- functions) has zero EXECUTE grant to anyone but the trigger mechanism
-- itself, which doesn't need one.

grant execute on function private.is_admin() to anon, authenticated;
grant execute on function private.has_admin_role(public.admin_role) to anon, authenticated;
grant execute on function private.can_access_quote_request(uuid) to authenticated;

-- ══════════════════════════════════════════════════════════════════════
-- Public RPC execute grants
-- ══════════════════════════════════════════════════════════════════════

grant execute on function public.admin_verify_buyer(uuid, boolean)
  to authenticated;

grant execute on function public.admin_update_inquiry(uuid, public.lead_status, integer, uuid, timestamptz)
  to authenticated;

grant execute on function public.admin_update_quote_request(uuid, public.lead_status, integer, uuid, timestamptz, text)
  to authenticated;

grant execute on function public.admin_update_sample_status(uuid, public.sample_status, public.payment_status, uuid, text, text, numeric, text, text, text, text)
  to authenticated;

-- submit_quote_request and submit_sample_request are callable by anon too
-- — guests submit RFQs and sample requests without an account.
grant execute on function public.submit_quote_request(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text, uuid, jsonb
) to anon, authenticated;

grant execute on function public.submit_sample_request(
  text, text, text, text, text, uuid, integer, uuid
) to anon, authenticated;

-- Every trigger function (set_updated_at, all *_guard_insert/_guard_update
-- functions, lead_activity_log's guard-insert function) is deliberately
-- left with NO EXECUTE grant to anon/authenticated/public. Triggers are
-- invoked by the trigger execution machinery itself, which does not
-- require the DML-issuing role to hold EXECUTE on the trigger function —
-- so there is no legitimate reason for any session role to call them
-- directly, and they must not be callable via `select fn()`.

-- ══════════════════════════════════════════════════════════════════════
-- Default privileges — protects every migration written AFTER this one.
-- ══════════════════════════════════════════════════════════════════════
--
-- CORRECTED PER RUNTIME EVIDENCE (this is the third correction to this
-- section, each based on actual pg_default_acl inspection against the
-- running instance rather than assumption):
--
-- 1. An earlier revision omitted "FOR ROLE" entirely, assuming that would
--    adapt to whatever role creates an object later. Wrong: it resolves
--    to the role executing the ALTER DEFAULT PRIVILEGES statement itself
--    (postgres, since migrations run as postgres) and does not adapt.
--
-- 2. The next revision added explicit "FOR ROLE supabase_admin" entries,
--    reasoning that pgTAP's test-created objects are owned by
--    supabase_admin. This is not viable: postgres is not a member of
--    supabase_admin, so `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin`
--    fails migration startup with SQLSTATE 42501 ("must be member of
--    role supabase_admin"). Removed below — this migration cannot and
--    should not attempt to govern supabase_admin's defaults.
--
-- 3. Direct inspection of pg_default_acl for owner postgres showed:
--      postgres | public  | S  (sequences — customized)
--      postgres | public  | f  | {postgres=X/postgres}  (functions — customized, no PUBLIC execute)
--      postgres | public  | r  (relations/tables — customized)
--    but NO row at all for (postgres, private, function) and NO global
--    (schema-independent) function row either. A schema-specific
--    ALTER DEFAULT PRIVILEGES ... IN SCHEMA private statement does not,
--    by itself, reliably materialize as expected without an accompanying
--    global rule in this environment — so `private` schema functions
--    were still falling back to Postgres's hardcoded default of granting
--    PUBLIC execute on every new function.
--
-- The fix: add a GLOBAL default-privilege revoke for postgres (no
-- "IN SCHEMA" clause at all), which governs every schema postgres creates
-- functions in unless a schema-specific override exists. The existing
-- schema-specific "IN SCHEMA public" and "IN SCHEMA private" statements
-- are kept — the public one is confirmed working per the evidence above,
-- and schema-specific overrides remain the right tool wherever a schema
-- needs different treatment than the global rule in the future.

alter default privileges for role postgres
  revoke execute on functions from public, anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;

alter default privileges for role postgres in schema private
  revoke execute on functions from public, anon, authenticated, service_role;

-- Table/sequence default restrictions are unaffected by this diagnosis —
-- no evidence surfaced that any role other than postgres creates tables
-- or sequences in this project's migrations or tests, so these remain
-- scoped to the role executing this migration (postgres) as before.
alter default privileges in schema public
  revoke select, insert, update, delete on tables from anon, authenticated;

alter default privileges in schema public
  revoke usage, select on sequences from anon, authenticated;
