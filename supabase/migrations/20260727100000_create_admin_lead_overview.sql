-- 20260727100000_create_admin_lead_overview.sql
--
-- CORRECTION NOTE: this migration has not yet been applied to any real
-- environment, so the security fix below (an explicit has_admin_role()
-- predicate on the view, closing a real buyer-visible-CRM-field leak) was
-- applied by editing this file in place, rather than adding a separate
-- later correction migration — consistent with this project's
-- established convention that pre-application edits happen in place,
-- and only already-applied migrations get superseding follow-up
-- migrations.
--
-- Module 5 (CRM) needs a single, sortable/filterable list combining
-- inquiries and quote_requests — both use the identical lead pipeline
-- shape (lead_score, status, assigned_to, follow_up_at) and both are
-- managed through the admin_update_inquiry()/admin_update_quote_request()
-- RPCs already built in Module 2. Sample requests are deliberately NOT
-- included here — samples have a different pipeline entirely (fulfillment
-- status: requested → approved → shipped → delivered, plus payment
-- status), not a sales-qualification pipeline, and get their own list at
-- /admin/samples instead.
--
-- SECURITY: `with (security_invoker = true)` is essential here, not
-- decorative. Without it, a view's underlying table access is checked
-- against the VIEW OWNER's privileges (whoever ran this migration —
-- effectively bypassing RLS entirely, since migrations run as a
-- superuser-equivalent role). With security_invoker, Postgres checks RLS
-- against the actual querying session instead.
--
-- CORRECTED — A REAL LEAK, NOT JUST A THEORETICAL ONE: security_invoker
-- alone is not sufficient here, and an earlier revision of this view
-- relied on it alone. quote_requests has its own legitimate
-- "buyers can view own quote_requests" RLS policy (Module 2) — a buyer
-- viewing THEIR OWN quote request is intended, correct behavior on the
-- base table. But this view had no predicate of its own layered on top,
-- and SELECT was granted to `authenticated` broadly (needed so admins
-- can query it) — so an authenticated BUYER querying this view directly
-- through the Data API (the admin route protection in proxy.ts/the
-- dashboard layout only protects Next.js *routes*, not the underlying
-- database object, which is reachable with nothing more than the
-- publishable key and a buyer's own session) would have their own
-- quote_request row pass straight through the union, exposing
-- lead_score/status/assigned_to/follow_up_at — internal CRM fields never
-- meant for buyer eyes, and not fields Module 2's own buyer-facing
-- quote_requests grant ever intended to expose in this combined shape.
--
-- NOTE: the "buyers can view own quote_requests" policy referenced above
-- existed when this specific leak (through this view) was first found
-- and fixed. It does not exist anymore at all — a LATER, SEPARATE
-- section of this same migration file removes it entirely, once it
-- became clear the same underlying problem (RLS restricts rows, not
-- columns) also let a buyer see every column of their own row via a
-- DIRECT base-table query, bypassing this view altogether. Buyers now
-- receive ZERO rows querying quote_requests or samples directly, full
-- stop — not "their own row only," zero. See that later section's own
-- extended comment for the full explanation, and
-- public.buyer_quote_requests / public.buyer_samples for what buyer-
-- facing access looks like now.
--
-- Fixed by adding an explicit `where private.has_admin_role('sales')`
-- to BOTH union branches — independent of, and in addition to,
-- security_invoker. AT THE TIME this specific fix was made, a buyer's
-- own row would still have passed the BASE TABLE's RLS (that policy was
-- still in place then — see the NOTE above: it has SINCE been removed
-- entirely, for the broader reason described in this file's later
-- base-table fix section). This view's own predicate independently
-- requires CRM/sales access before a row is ever produced at all,
-- regardless of what the base table's RLS permits at any given time —
-- a buyer has no admin_users row, so has_admin_role('sales') is false
-- for them either way. has_admin_role() already treats
-- super_admin as a superset of every specific role check (established
-- throughout this project since Module 2), so this one condition
-- correctly admits both sales and super_admin while excluding editor,
-- buyers, and anon.
create view public.admin_lead_overview
with (security_invoker = true)
as
select
  id,
  'inquiry'::text as source_type,
  name,
  email,
  company_name,
  country,
  business_type::text as business_type,
  qualification_stage,
  inquiry_type::text as detail_type,
  lead_score,
  status,
  assigned_to,
  follow_up_at,
  created_at,
  updated_at
from public.inquiries
where private.has_admin_role('sales'::public.admin_role)
union all
select
  id,
  'quote_request'::text as source_type,
  -- quote_requests has no personal "name" column (it's a guest/buyer
  -- cart checkout, not a name-collecting form) — fall back to
  -- company_name, then email, so the list always has something to show.
  coalesce(company_name, email) as name,
  email,
  company_name,
  country,
  null::text as business_type,
  null::smallint as qualification_stage,
  null::text as detail_type,
  lead_score,
  status,
  assigned_to,
  follow_up_at,
  created_at,
  updated_at
from public.quote_requests
where private.has_admin_role('sales'::public.admin_role);

comment on view public.admin_lead_overview is
  'Unified, read-only list of inquiries + quote_requests for the Module 5 CRM leads dashboard. security_invoker=true AND an explicit has_admin_role(''sales'') predicate on both branches — the role check is NOT optional decoration on top of RLS, it is what stops a buyer''s own legitimate "view own quote_request" RLS pass-through from leaking internal CRM fields (lead_score/status/assigned_to/follow_up_at) through this specific combined view. Samples are intentionally excluded (separate fulfillment pipeline, separate /admin/samples list).';

-- A grant is still required in addition to both of the above: PostgreSQL
-- checks table/view-level GRANTs independently of RLS and of this view's
-- own WHERE predicate, and (per Module 3's default-privilege lockdown) a
-- brand-new object like this view starts with zero grants to anyone
-- until explicitly given one. Granting to `authenticated` broadly is
-- safe specifically because the view's own has_admin_role() predicate
-- above is what actually restricts visibility now — a non-admin
-- authenticated session can execute the query, but every row is filtered
-- out before it ever reaches them.
grant select on public.admin_lead_overview to authenticated;

-- ══════════════════════════════════════════════════════════════════════
-- CRM assignment-directory RPC
-- ══════════════════════════════════════════════════════════════════════
--
-- CORRECTED — the previous approach in this migration (an additive
-- admin_users SELECT policy plus a security_invoker "column-restricted"
-- view on top) did not actually restrict columns at all. RLS is a
-- ROW-level mechanism only; `authenticated` already holds Module 2's
-- original table-level SELECT GRANT on admin_users, so once the new
-- policy made every staff row visible to a sales session, that session
-- could simply run `select * from public.admin_users` directly and see
-- every column of every row — the view was never a security boundary,
-- just an unenforced convention that the application code happened to
-- follow. The only mechanism that genuinely enforces "this caller may
-- see exactly these three columns, nothing else, ever" is a function's
-- own RETURNS clause, which is precisely what this RPC uses instead.
--
-- Module 2's original admin_users SELECT policies ("admins can view own
-- record" / "super_admins can view all admin records") are back to
-- their original, untouched state — the broad additive policy from the
-- earlier revision of this migration is removed entirely, along with
-- the view that sat on top of it. An ordinary (non-super_admin) admin
-- querying admin_users directly is back to seeing only their own row,
-- exactly as Module 2 originally specified.
create or replace function public.list_crm_assignment_admins()
returns table (id uuid, full_name text, role public.admin_role)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_admin_role('sales'::public.admin_role) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return query
    select a.id, a.full_name, a.role
    from public.admin_users a
    where a.role in ('sales'::public.admin_role, 'super_admin'::public.admin_role)
    order by a.full_name;
end;
$$;

comment on function public.list_crm_assignment_admins() is
  'CRM assignment-directory lookup for dropdowns and timeline actor-name resolution. SECURITY DEFINER specifically so its RETURNS clause — not a view built on top of RLS — is what genuinely limits exposure to exactly id/full_name/role, regardless of what admin_users might contain or grow into. Explicitly checks has_admin_role(''sales'') internally (raising 42501 for anyone else, including editor and buyers) rather than relying on any admin_users RLS/GRANT at all. Returns only sales/super_admin rows — editor is excluded from the returned rows entirely (not just from calling this function), since an editor has no CRM access at all and assigning a lead/sample to one would create an unusable assignment; see the assigned_to guard trigger below for the corresponding database-level enforcement.';

revoke all on function public.list_crm_assignment_admins() from public, anon;
grant execute on function public.list_crm_assignment_admins() to authenticated;

-- ══════════════════════════════════════════════════════════════════════
-- Safe sample search
-- ══════════════════════════════════════════════════════════════════════
--
-- The samples list page needs to search by name/email/company_name.
-- Building that as a PostgREST .or() filter string with the raw search
-- term interpolated into it is unsafe: .or()'s value is a filter
-- EXPRESSION the client parses, where commas separate conditions and
-- periods separate column/operator/value — a search term containing
-- any of those characters could alter which filters actually get
-- applied, not just what they match against. A genuine SQL function
-- parameter has no such problem: p_search below is a normal bound
-- parameter, handled by Postgres's own parameter binding, never
-- string-interpolated into a query PostgREST parses as filter grammar.
--
-- Deliberately NOT security definer — this function has no elevated
-- privilege of its own and needs none. Left as the default (security
-- invoker), it runs as the calling role, so `samples`' own RLS applies
-- to its result set exactly as it would to a direct table query. As of
-- this same migration's later section, that RLS means: sales/super_admin
-- see everything ("sales can view samples"), and a buyer sees nothing at
-- all through this function OR through the base table directly — the
-- buyer-owning-row policy is dropped entirely later in this file (see
-- that section's own extended comment for why), and this function's own
-- explicit has_admin_role('sales') predicate (below) independently
-- excludes buyers regardless. Buyer-facing sample access lives
-- exclusively in `public.buyer_samples` from this migration onward.
create function public.search_samples(p_search text default null)
returns setof public.samples
language plpgsql
stable
as $$
declare
  v_search text;
begin
  v_search := trim(p_search);

  -- Reject, don't truncate: silently searching on only the first 100
  -- characters of a longer input would change what the caller actually
  -- asked for without telling them. A direct-RPC caller (bypassing the
  -- UI/Zod layer entirely) deserves an explicit, unambiguous validation
  -- error instead.
  if v_search is not null and length(v_search) > 100 then
    raise exception 'search term exceeds the maximum length of 100 characters' using errcode = '22023';
  end if;

  return query
    select *
    from public.samples
    where private.has_admin_role('sales'::public.admin_role)
      and (
        v_search is null or length(v_search) = 0
        or name ilike '%' || v_search || '%'
        or email ilike '%' || v_search || '%'
        or company_name ilike '%' || v_search || '%'
      )
    order by created_at desc;
end;
$$;

comment on function public.search_samples(text) is
  'CRM sample search — sales/super_admin ONLY, per the approved Module 5 admin-search contract. An earlier revision omitted the explicit role check and relied on samples'' own RLS alone, which meant a buyer session could also use this function to search their own sample — not a cross-buyer leak (RLS still correctly limited them to their own row at the time), but not the approved admin-only CRM contract either. The explicit `private.has_admin_role(''sales'')` predicate now requires a CRM session regardless of what RLS alone would otherwise permit. Buyer-facing sample access never went through this function and does not now either — it is public.buyer_samples exclusively, since the buyer-owning-row base-table policy this function''s RLS once relied on for buyers has since been dropped entirely (see this migration''s later base-table fix section). Still SECURITY INVOKER (the default) — this predicate is an ADDITIONAL restriction layered on top of RLS, not a replacement for it; RLS remains the underlying boundary for the roles that do have it (sales/super_admin). A search term over 100 characters is REJECTED outright (raises 22023), not silently truncated — enforced inside this function itself, not just the UI/Zod layer, since this RPC can be called directly, bypassing both. An earlier revision silently truncated via left(...,100) instead, which changed the caller''s input without telling them; that was corrected to an explicit rejection.';

revoke all on function public.search_samples(text) from public, anon;
grant execute on function public.search_samples(text) to authenticated;

-- ══════════════════════════════════════════════════════════════════════
-- Database-level assigned_to guard — inquiries, quote_requests, samples
-- ══════════════════════════════════════════════════════════════════════
--
-- list_crm_assignment_admins() (above) already excludes editor rows from
-- the dropdown — but a dropdown is only a UI-layer suggestion, not an
-- enforcement boundary. Nothing previously stopped assigned_to from
-- being set to an editor's id (or a buyer's id, or a nonexistent uuid)
-- by any other path, present or future: a direct RPC call bypassing the
-- dropdown entirely, a future admin RPC that forgets this constraint, a
-- manual data fix. This trigger is the actual enforcement, applied at
-- the table level across all three CRM-pipeline tables, so it protects
-- every current and future write path uniformly rather than requiring
-- every individual RPC to remember to re-implement the same check.
--
-- CORRECTED — a real bug, not a hardening pass: an earlier revision of
-- this function was NOT security definer, so its internal admin_users
-- query ran with the CALLING session's own privileges — and that
-- session's own admin_users RLS ("admins can view own record") means an
-- ordinary sales admin can only see THEIR OWN row. Validating an
-- assignment to a DIFFERENT sales admin, or to super_admin, requires
-- checking a row the calling session's own RLS would hide from a plain
-- query — so the EXISTS check below would incorrectly find nothing and
-- reject an entirely valid assignment, purely because of who happened to
-- be making it, not because the target was actually wrong. SECURITY
-- DEFINER fixes this: the trigger's own internal check now sees the full
-- admin_users table regardless of the calling session's own visibility,
-- which is exactly what "does this id genuinely have this role" needs to
-- check correctly. This does not expose any admin_users row DATA to the
-- caller — the trigger only ever returns NEW unchanged or raises an
-- exception, never any queried column value — and does not touch
-- admin_users' own RLS or table grants at all.
create or replace function private.validate_crm_assigned_to()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assigned_to is not null and not exists (
    select 1 from public.admin_users
    where id = new.assigned_to
      and role in ('sales'::public.admin_role, 'super_admin'::public.admin_role)
  ) then
    raise exception 'assigned_to must be null or reference a sales/super_admin admin_users row' using errcode = '23514';
  end if;
  return new;
end;
$$;

comment on function private.validate_crm_assigned_to() is
  'Database-level enforcement (not just the assignment dropdown) that assigned_to on inquiries/quote_requests/samples is either null or references an admin_users row whose role is sales or super_admin — never editor, never a buyer id, never a nonexistent uuid. Applied as a BEFORE INSERT OR UPDATE OF assigned_to trigger on all three CRM-pipeline tables. SECURITY DEFINER so this check sees the full admin_users table regardless of the calling session''s own RLS visibility — see the extended comment above for why a plain (invoker) version of this check would incorrectly reject valid assignments made by an ordinary sales session. Returns only NEW unchanged or raises; never exposes any admin_users row data to the caller.';

-- Trigger functions execute only in trigger context and cannot normally
-- be invoked directly as an ordinary function call (NEW/OLD are
-- undefined outside that context) — but EXECUTE is revoked explicitly
-- anyway, as defense in depth, so this SECURITY DEFINER function is
-- never callable directly by anyone, only ever fired by the three
-- triggers below.
revoke all on function private.validate_crm_assigned_to() from public, anon, authenticated;

create trigger validate_inquiries_assigned_to
  before insert or update of assigned_to on public.inquiries
  for each row execute function private.validate_crm_assigned_to();

create trigger validate_quote_requests_assigned_to
  before insert or update of assigned_to on public.quote_requests
  for each row execute function private.validate_crm_assigned_to();

create trigger validate_samples_assigned_to
  before insert or update of assigned_to on public.samples
  for each row execute function private.validate_crm_assigned_to();

-- ══════════════════════════════════════════════════════════════════════
-- CRITICAL FIX — buyer base-table column exposure on quote_requests/samples
-- ══════════════════════════════════════════════════════════════════════
--
-- A REAL, SEVERE BUG, not a hardening pass: Module 2's original
-- "buyers can view own quote_requests" / "buyers can view own samples"
-- policies restrict which ROWS a buyer can see — but RLS only ever
-- restricts rows, never columns. `authenticated` holds a genuine
-- table-level SELECT GRANT on both tables (Module 2), so a buyer
-- querying their own quote_requests/samples row directly — e.g.
-- `select * from quote_requests where id = <their own row>` — got back
-- EVERY column, including internal-only fields never meant for buyer
-- eyes: lead_score, status, assigned_to, follow_up_at, and notes
-- (explicitly documented as "internal sales notes — admin-only, never
-- buyer-submitted") on quote_requests; assigned_to and other internal
-- fulfillment/staff fields on samples. Module 5's own
-- admin_lead_overview fix (the has_admin_role predicate closing the
-- buyer-visible-CRM-field leak through that view) does NOT protect
-- against this at all — a buyer bypassing the view entirely and
-- querying the base table directly was never affected by that fix,
-- since the buyer policy on the BASE TABLE was untouched and still let
-- their own row's every column through.
--
-- FIXED in two parts:
--   1. The buyer SELECT policies are dropped entirely from both base
--      tables. `authenticated`'s table-level GRANT is deliberately left
--      alone (not revoked globally) — sales/super_admin sessions use
--      the exact same `authenticated` database role, and their own
--      "sales can view quote_requests"/"sales can view samples" RLS
--      policies still apply normally, completely independent of the
--      buyer policy being removed. Without a matching buyer policy, a
--      buyer session now gets ZERO rows from a direct base-table query —
--      exactly the same outcome editor and anon already got, for exactly
--      the same reason (no RLS policy exists that includes them).
--   2. `public.buyer_quote_requests` / `public.buyer_samples` — new,
--      narrow, explicit-column-list views taking over buyer-facing
--      access. Each view runs with SECURITY_INVOKER left at its default
--      (false) — the "trusted owner" execution model, the OPPOSITE
--      choice from admin_lead_overview's security_invoker=true, and
--      deliberately so: with the buyer policy now gone, a buyer session
--      has NO RLS path into the base table at all, so the view itself
--      must be the thing bypassing RLS on the buyer's behalf (via the
--      view owner's own privileges, the same mechanism a plain
--      SECURITY DEFINER function uses). Row-level safety comes entirely
--      from each view's own explicit `where buyer_id = auth.uid()`
--      predicate — doing the exact job the removed RLS policy used to
--      do, just inside the view instead of the table. Column-level
--      safety comes from each view's explicit, hand-picked column list —
--      internal CRM fields (lead_score/status/assigned_to/follow_up_at/
--      notes on quote_requests; assigned_to and other internal
--      fulfillment fields on samples) and internal attribution fields
--      (visitor_id/utm_*/fbp/fbc/event_id) are never included in the
--      SELECT list at all, so there is nothing to accidentally expose
--      regardless of what either base table contains or grows into.
--      `security_barrier = true` is set explicitly on both views: this
--      is the standard Postgres safeguard against a caller's own
--      (potentially leaky) function/operator being planner-pushed-down
--      ahead of the view's security-relevant `buyer_id = auth.uid()`
--      filter — without it, a sufficiently creative query against the
--      view could in principle observe side effects of evaluating a
--      user-supplied expression against ROWS the ownership filter was
--      supposed to hide first.
--
-- private.can_access_quote_request(uuid) (Module 2) is UNAFFECTED by any
-- of this — it was already SECURITY DEFINER and already checked buyer
-- ownership by querying quote_requests directly with its own bypassed
-- privileges, never relying on the (now-removed) buyer RLS policy in the
-- first place. quote_request_items' own buyer visibility
-- ("buyers can view own quote_request_items", Module 2) is built
-- entirely on top of that same SECURITY DEFINER function, not on the
-- quote_requests buyer policy — so removing that policy does not affect
-- quote_request_items access at all. See this migration's own pgTAP
-- coverage for a test proving this directly.

drop policy "buyers can view own quote_requests" on public.quote_requests;
drop policy "buyers can view own samples" on public.samples;

create view public.buyer_quote_requests
with (security_barrier = true, security_invoker = false)
as
select
  id,
  buyer_id,
  company_name,
  email,
  phone,
  country,
  created_at,
  updated_at
from public.quote_requests
where buyer_id = auth.uid();

comment on view public.buyer_quote_requests is
  'The ONLY buyer-facing way to see quote_requests — direct base-table SELECT is no longer possible for buyers at all (see this migration''s own header comment for why the buyer RLS policy was removed entirely rather than merely narrowed). security_barrier=true, security_invoker left at its default (false, "trusted owner" execution) so the view itself can read the underlying table on the buyer''s behalf via the view owner''s privileges — its own explicit "where buyer_id = auth.uid()" predicate is what actually restricts rows now, doing the job the removed RLS policy used to do. Exposes ONLY id/buyer_id/company_name/email/phone/country/created_at/updated_at — deliberately excludes lead_score, status, assigned_to, follow_up_at, notes (internal sales notes), and every visitor/UTM/fbp/fbc/event_id attribution field. A buyer-safe quote-progress indicator, if wanted, should be designed later as its own deliberately-safe field — never by exposing the internal lead_status enum through this view.';

revoke all on public.buyer_quote_requests from public, anon;
grant select on public.buyer_quote_requests to authenticated;

create view public.buyer_samples
with (security_barrier = true, security_invoker = false)
as
select
  id,
  buyer_id,
  name,
  email,
  phone,
  company_name,
  country,
  quote_request_id,
  product_id,
  requested_quantity,
  sample_charge,
  currency,
  payment_status,
  shipping_country,
  shipping_address,
  shipping_port,
  courier_name,
  tracking_number,
  sample_status,
  created_at,
  updated_at
from public.samples
where buyer_id = auth.uid();

comment on view public.buyer_samples is
  'The ONLY buyer-facing way to see samples — direct base-table SELECT is no longer possible for buyers at all. Same security model as buyer_quote_requests: security_barrier=true, security_invoker left at its default (false), "where buyer_id = auth.uid()" as the actual row-level restriction. Exposes id/buyer_id/name/email/phone/company_name/country/quote_request_id/product_id/requested_quantity/sample_charge/currency/payment_status/shipping_country/shipping_address/shipping_port/courier_name/tracking_number/sample_status/created_at/updated_at — a buyer legitimately needs to see their own sample''s fulfillment/shipping/payment progress. Deliberately excludes assigned_to (internal staff identifier), inquiry_id (inquiries have no buyer-ownership concept at all — exposing this would let a buyer correlate into a system they have no authorized relationship with), and email_normalized (an internal generated column, never needed by the buyer who already knows their own email).';

revoke all on public.buyer_samples from public, anon;
grant select on public.buyer_samples to authenticated;
