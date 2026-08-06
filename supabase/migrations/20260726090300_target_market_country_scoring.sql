-- 20260726090300_target_market_country_scoring.sql
--
-- Module 2's lead_scoring_rules bootstrap data includes an ACTIVE
-- 'target_market_country' rule worth 8 points ("Country is within a known
-- target export market"), and submit_inquiry() already receives p_country
-- as a parameter — but the RPC's scoring loop explicitly left this rule
-- unscored (folded into the catch-all "needs data this RPC doesn't
-- cleanly have yet" branch). That left an admin-visible, seemingly-active
-- rule silently doing nothing, which is worse than not having the rule
-- at all: an admin reviewing lead_scoring_rules would reasonably assume
-- it's in effect. This migration completes it.
--
-- The target-country list itself is admin-editable reference data, not
-- hardcoded in the function — mirroring exactly how lead_scoring_rules'
-- point VALUES are never hardcoded in submit_inquiry() either. Matching
-- is case-insensitive and whitespace-trimmed against p_country, since
-- p_country is free text (not a constrained enum) and forms/admins may
-- enter "US", "USA", or "United States" inconsistently — see the seed
-- data below for exactly which variants are pre-populated.

create table public.target_market_countries (
  country text primary key,
  created_at timestamptz not null default now()
);

comment on table public.target_market_countries is
  'Admin-editable list of countries/country-name variants considered strategic target export markets, used by submit_inquiry() to score the target_market_country lead_scoring_rules factor. Matched case-insensitively and whitespace-trimmed against an inquiry''s country field — add every spelling variant you want recognized (e.g. both "US" and "United States") rather than expecting normalization on the reading side.';

-- Matches the same RLS shape as lead_scoring_rules (Module 2): any admin
-- can view it, only super_admin can change it — this is exactly the kind
-- of scoring-impacting configuration that warrants the narrower write
-- access, consistent with lead_scoring_rules' own points values.
alter table public.target_market_countries enable row level security;

create policy "admins can view target_market_countries"
  on target_market_countries for select to authenticated
  using (private.is_admin());

create policy "super_admins manage target_market_countries"
  on target_market_countries for all to authenticated
  using (private.has_admin_role('super_admin'::admin_role))
  with check (private.has_admin_role('super_admin'::admin_role));

grant select on target_market_countries to authenticated;
grant insert (country) on target_market_countries to authenticated;
grant update (country) on target_market_countries to authenticated;
grant delete on target_market_countries to authenticated;
-- created_at is intentionally absent from any grant — always the column
-- default, matching the pattern used for every other audit-style
-- timestamp column across this project's grants.

-- Seed with a reasonable starting set of target export markets for a
-- handicraft exporter — importers, wholesalers, retail chains, hotel
-- buyers, and interior designers in established, high-value import
-- markets. Deliberately includes both abbreviated and full-name variants
-- of each country, since matching is exact-after-normalization, not
-- fuzzy — an admin can add more variants (or countries) at any time via
-- the same table, no code change required.
insert into public.target_market_countries (country) values
  ('US'), ('USA'), ('United States'), ('United States of America'),
  ('UK'), ('United Kingdom'), ('Great Britain'),
  ('AU'), ('Australia'),
  ('CA'), ('Canada'),
  ('DE'), ('Germany'),
  ('FR'), ('France'),
  ('AE'), ('UAE'), ('United Arab Emirates'),
  ('NZ'), ('New Zealand'),
  ('JP'), ('Japan'),
  ('SG'), ('Singapore')
on conflict (country) do nothing;

-- ══════════════════════════════════════════════════════════════════════
-- Wire the rule into submit_inquiry()'s scoring loop
-- ══════════════════════════════════════════════════════════════════════
--
-- Full CREATE OR REPLACE of the function (not just a fragment) —
-- Postgres has no ALTER FUNCTION mechanism for editing a single line of
-- a function body in place, and this project's established convention
-- (see every prior "CORRECTED" migration in this module) is to restate
-- the complete function via CREATE OR REPLACE rather than attempt a
-- partial patch. Signature, parameter count (33), and every other line
-- of behavior are unchanged from 20260726090100's version except: the
-- Stage-2 derivation fix (adds p_linkedin_url), the target_market_country
-- scoring branch below, and a new required-field check enforcing
-- non-blank p_message — restoring the frozen Stage-1 contract's "product
-- interest" requirement (p_message doubles as that field; see that
-- check's own comment for why).

create or replace function public.submit_inquiry(
  p_product_id uuid,
  p_name text,
  p_email text,
  p_country text,
  p_business_type public.business_type,
  p_message text,
  p_company_name text,
  p_company_website text,
  p_linkedin_url text,
  p_volume_range text,
  p_moq_familiarity public.moq_familiarity,
  p_timeline public.purchase_timeline,
  p_shipping_country text,
  p_incoterm_preference public.incoterm,
  p_private_label_required boolean,
  p_wants_sample boolean,
  p_visitor_id text,
  p_client_ip inet,
  p_utm_source text,
  p_utm_medium text,
  p_utm_campaign text,
  p_referrer text,
  p_landing_page text,
  p_first_touch_source text,
  p_first_touch_medium text,
  p_first_touch_campaign text,
  p_last_touch_source text,
  p_last_touch_medium text,
  p_last_touch_campaign text,
  p_fbp text,
  p_fbc text,
  p_event_id uuid,
  p_honeypot text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stage smallint;
  v_score integer := 0;
  v_email_normalized text;
  v_inquiry_id uuid;
  v_duplicate_count integer;
  v_recent_visitor_count integer;
  v_recent_ip_count integer;
  v_recent_email_count integer;
  v_rule record;
  v_is_free_email boolean;
  v_inquiry_type public.inquiry_type;
  v_status text;
  v_is_target_market boolean;
begin
  if p_visitor_id is not null then
    perform pg_advisory_xact_lock(1, hashtext(p_visitor_id));
  end if;
  if p_client_ip is not null then
    perform pg_advisory_xact_lock(3, hashtext(host(p_client_ip)));
  end if;

  insert into public.inquiry_rate_limit_log (visitor_id, client_ip)
  values (p_visitor_id, p_client_ip);

  if p_honeypot is not null and length(trim(p_honeypot)) > 0 then
    return jsonb_build_object('status', 'rejected', 'message', 'honeypot');
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    return jsonb_build_object('status', 'rejected', 'message', 'name is required');
  end if;
  if p_email is null or length(trim(p_email)) = 0 then
    return jsonb_build_object('status', 'rejected', 'message', 'email is required');
  end if;
  if p_country is null or length(trim(p_country)) = 0 then
    return jsonb_build_object('status', 'rejected', 'message', 'country is required');
  end if;
  if p_business_type is null then
    return jsonb_build_object('status', 'rejected', 'message', 'business_type is required');
  end if;
  -- p_message doubles as "product interest / requirement" per the frozen
  -- Stage-1 field contract (name, business email, country, product
  -- interest, business type) — enforced here as defense in depth on top
  -- of the client-side Zod requirement, since a Server Action can in
  -- principle be invoked independent of the visible form.
  if p_message is null or length(trim(p_message)) = 0 then
    return jsonb_build_object('status', 'rejected', 'message', 'product interest / requirement is required');
  end if;

  v_email_normalized := lower(trim(p_email));

  perform pg_advisory_xact_lock(2, hashtext(v_email_normalized));

  if p_product_id is not null and not exists (
    select 1 from public.products
    where id = p_product_id and status = 'published'::public.product_status
  ) then
    return jsonb_build_object('status', 'rejected', 'message', 'invalid or unpublished product');
  end if;

  if p_visitor_id is not null then
    select count(*) into v_recent_visitor_count
    from public.inquiry_rate_limit_log
    where visitor_id = p_visitor_id and created_at > now() - interval '10 minutes';

    if v_recent_visitor_count > 5 then
      return jsonb_build_object('status', 'rate_limited');
    end if;
  end if;

  if p_client_ip is not null then
    select count(*) into v_recent_ip_count
    from public.inquiry_rate_limit_log
    where client_ip = p_client_ip and created_at > now() - interval '10 minutes';

    if v_recent_ip_count > 5 then
      return jsonb_build_object('status', 'rate_limited');
    end if;
  end if;

  select count(*) into v_recent_email_count
  from public.inquiries
  where email_normalized = v_email_normalized and created_at > now() - interval '1 hour';

  if v_recent_email_count >= 3 then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  -- ── Stage-2 fix (this round): p_linkedin_url was missing from this ────
  -- ── condition, contradicting the documented "any Stage-2 field ─────────
  -- ── advances the stage" contract.
  if p_shipping_country is not null or p_incoterm_preference is not null
     or coalesce(p_private_label_required, false) or coalesce(p_wants_sample, false) then
    v_stage := 3;
  elsif p_company_name is not null or p_company_website is not null or p_linkedin_url is not null
     or p_volume_range is not null or p_moq_familiarity is not null or p_timeline is not null then
    v_stage := 2;
  else
    v_stage := 1;
  end if;

  v_inquiry_type := case
    when coalesce(p_wants_sample, false) then 'sample'::public.inquiry_type
    when p_product_id is not null then 'product'::public.inquiry_type
    else 'general'::public.inquiry_type
  end;

  v_is_free_email := v_email_normalized ~ '@(gmail|yahoo|hotmail|outlook|aol|icloud|protonmail)\.[a-z.]+$';

  -- Read once, outside the rule loop, since it never depends on which
  -- rule is currently being evaluated.
  select exists (
    select 1 from public.target_market_countries tmc
    where lower(trim(tmc.country)) = lower(trim(p_country))
  ) into v_is_target_market;

  for v_rule in select factor_key, points from public.lead_scoring_rules loop
    case v_rule.factor_key
      when 'business_email_domain' then
        if not v_is_free_email then
          v_score := v_score + v_rule.points;
        end if;
      when 'company_website_provided' then
        if p_company_website is not null and length(trim(p_company_website)) > 0 then
          v_score := v_score + v_rule.points;
        end if;
      when 'linkedin_provided' then
        if p_linkedin_url is not null and length(trim(p_linkedin_url)) > 0 then
          v_score := v_score + v_rule.points;
        end if;
      when 'high_value_business_type' then
        if p_business_type in ('hotel_buyer'::public.business_type, 'distributor'::public.business_type, 'retail_chain'::public.business_type) then
          v_score := v_score + v_rule.points;
        end if;
      when 'volume_provided' then
        if p_volume_range is not null and length(trim(p_volume_range)) > 0 then
          v_score := v_score + v_rule.points;
        end if;
      when 'rfq_stage_3_completed' then
        if v_stage = 3 then
          v_score := v_score + v_rule.points;
        end if;
      when 'free_email_no_company_single_page' then
        if v_is_free_email and p_company_name is null then
          v_score := v_score + v_rule.points; -- this rule's configured points value is negative
        end if;
      when 'target_market_country' then
        -- NEWLY WIRED (this migration) — reads public.target_market_countries,
        -- never a hardcoded list; points still come from v_rule.points,
        -- i.e. lead_scoring_rules, never hardcoded either.
        if v_is_target_market then
          v_score := v_score + v_rule.points;
        end if;
      else
        -- 'catalog_download', 'repeat_visit', and
        -- 'submission_velocity_anomaly' need data this RPC doesn't
        -- cleanly have yet (catalog download history, cross-session
        -- visit history, precise timing analysis) — intentionally left
        -- unscored here rather than guessed at inaccurately. A future
        -- module can extend this loop.
        null;
    end case;
  end loop;

  v_score := greatest(0, least(100, v_score));

  select count(*) into v_duplicate_count
  from public.inquiries
  where email_normalized = v_email_normalized
    and created_at > now() - interval '90 days';

  v_status := case when v_duplicate_count > 0 then 'duplicate' else 'accepted' end;

  perform set_config('app.trusted_scoring_context', 'on', true);

  insert into public.inquiries (
    product_id, qualification_stage, name, email, country, business_type,
    inquiry_type, message, company_name, company_website, linkedin_url,
    volume_range, moq_familiarity, timeline, shipping_country,
    incoterm_preference, private_label_required, visitor_id, utm_source,
    utm_medium, utm_campaign, referrer, landing_page, first_touch_source,
    first_touch_medium, first_touch_campaign, last_touch_source,
    last_touch_medium, last_touch_campaign, fbp, fbc, event_id, lead_score
  ) values (
    p_product_id, v_stage, p_name, p_email, p_country, p_business_type,
    v_inquiry_type, p_message, p_company_name, p_company_website, p_linkedin_url,
    p_volume_range, p_moq_familiarity, p_timeline, p_shipping_country,
    p_incoterm_preference, p_private_label_required, p_visitor_id, p_utm_source,
    p_utm_medium, p_utm_campaign, p_referrer, p_landing_page, p_first_touch_source,
    p_first_touch_medium, p_first_touch_campaign, p_last_touch_source,
    p_last_touch_medium, p_last_touch_campaign, p_fbp, p_fbc, p_event_id, v_score
  )
  returning id into v_inquiry_id;

  if v_duplicate_count > 0 then
    insert into public.lead_activity_log (inquiry_id, event_type, note)
    values (
      v_inquiry_id,
      'duplicate_detected',
      format('Possible duplicate: %s prior inquiry(ies) from this email in the last 90 days', v_duplicate_count)
    );
  end if;

  return jsonb_build_object('status', v_status, 'inquiry_id', v_inquiry_id);
end;
$$;

-- GRANT/REVOKE restated identically to 20260726090100 — CREATE OR REPLACE
-- FUNCTION does not reset privileges, so this is not strictly required
-- for the existing grant to keep working, but it's restated here anyway
-- so this migration's own file is a complete, self-contained statement
-- of exactly who can call this function, without requiring a reader to
-- cross-reference an earlier file to know the current access list.
revoke all on function public.submit_inquiry(
  uuid, text, text, text, public.business_type, text, text, text, text, text,
  public.moq_familiarity, public.purchase_timeline, text, public.incoterm,
  boolean, boolean, text, inet, text, text, text, text, text, text, text, text,
  text, text, text, text, text, uuid, text
) from public, anon, authenticated;

grant execute on function public.submit_inquiry(
  uuid, text, text, text, public.business_type, text, text, text, text, text,
  public.moq_familiarity, public.purchase_timeline, text, public.incoterm,
  boolean, boolean, text, inet, text, text, text, text, text, text, text, text,
  text, text, text, text, text, uuid, text
) to service_role;
