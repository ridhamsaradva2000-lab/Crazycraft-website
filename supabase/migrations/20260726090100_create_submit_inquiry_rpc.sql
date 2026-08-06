-- 20260726090100_create_submit_inquiry_rpc.sql
--
-- ══════════════════════════════════════════════════════════════════════
-- submit_inquiry()
-- ══════════════════════════════════════════════════════════════════════
--
-- SECOND CORRECTION TO THIS MIGRATION'S DESIGN (the first replaced
-- internal logging with a separate log_inquiry_attempt() RPC; THIS
-- revision removes that RPC again and folds everything back into one
-- function, for a more fundamental reason described below).
--
-- SECURITY BOUNDARY, STATED EXPLICITLY: this function is callable ONLY
-- by the service_role Postgres role (see the grants migration in this
-- module) — NOT anon, NOT authenticated, NOT PUBLIC. It must be called
-- exclusively from trusted server-side code holding the Supabase secret
-- key (src/lib/supabase/admin.ts), after that server-side code has
-- independently verified a Turnstile token and derived the caller's IP
-- from trusted request headers. Neither of those checks can be expressed
-- inside Postgres itself — a caller with just the publishable key must
-- never be able to invoke this function directly and skip them.
--
-- This also removes the earlier public.log_inquiry_attempt() RPC
-- entirely. That function existed to work around a real problem (an
-- uncaught exception rolling back everything in the same top-level
-- statement, including an earlier log insert) by moving the log write
-- into its own, separately-committing call — but making it its own
-- PUBLICLY CALLABLE function meant anyone could call it directly with
-- arbitrary visitor_id/client_ip values, poisoning another user's
-- rate-limit counters or fabricating attempt history. The actual fix for
-- the rollback problem doesn't need a second function at all: EXPECTED
-- business outcomes (rate limited, duplicate, rejected) are now
-- RETURNED as structured data instead of RAISED as exceptions. Since no
-- exception occurs on those paths, the log insert that happens earlier
-- in this SAME function call is never rolled back — it commits as part
-- of this function's normal completion, regardless of the business
-- outcome. Only genuinely unexpected failures (a real database error) are
-- still allowed to raise.
--
-- Returns a JSONB object shaped as one of:
--   {"status": "accepted", "inquiry_id": "<uuid>"}
--   {"status": "duplicate", "inquiry_id": "<uuid>"}   -- still created; see below
--   {"status": "rate_limited"}
--   {"status": "rejected", "message": "<safe-to-log, not necessarily safe-to-show, reason>"}
--
-- "duplicate" still creates the inquiry (matching the original design —
-- a duplicate submission is a signal for sales follow-up, not something
-- to silently drop) but reports it as a distinct status so the caller
-- can distinguish it from a first-time "accepted" if it ever wants to.
--
-- Concurrency: acquires transaction-level advisory locks
-- (pg_advisory_xact_lock, automatically released at COMMIT/ROLLBACK —
-- no manual unlock needed, no risk of a stuck lock from a dropped
-- connection) keyed by visitor_id / normalized email / client IP before
-- reading or writing anything tied to those keys. This closes a
-- time-of-check-to-time-of-use race where two concurrent requests
-- sharing the same key could both read a rate-limit count below the
-- threshold before either had committed its own log row, letting more
-- than the intended number through simultaneously.
--
-- REMOVED: an earlier revision also accepted p_authenticated_user_id,
-- intended to force the caller to have already verified the session
-- server-side. In practice the parameter was never stored, validated,
-- scored, or audited anywhere in this function — its mere presence in
-- the signature didn't actually enforce anything, and inquiries has no
-- buyer-attribution column to persist it against in the first place
-- (unlike quote_requests/samples, which do have buyer_id). A parameter
-- that looks like a security control but isn't is worse than no
-- parameter at all, so it's removed rather than kept as decoration. If
-- inquiries ever gains a genuine buyer-attribution column, add the
-- parameter back at that point, with the column it actually populates.

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
begin
  -- ── Advisory locks — acquired as early as possible, before the log ───
  -- ── insert below, so the whole read-then-write sequence for each key ─
  -- ── is serialized against concurrent attempts sharing that key. ──────
  -- Namespaced with a fixed first key (1/3) so visitor_id and client_ip
  -- hash spaces can never collide with each other.
  if p_visitor_id is not null then
    perform pg_advisory_xact_lock(1, hashtext(p_visitor_id));
  end if;
  if p_client_ip is not null then
    perform pg_advisory_xact_lock(3, hashtext(host(p_client_ip)));
  end if;

  -- ── Record this attempt. Because every rejection path below RETURNS ──
  -- ── a structured result rather than RAISING an exception, this ───────
  -- ── insert is never rolled back by a later rejection in this same ────
  -- ── call — it commits as part of this function's normal completion.
  insert into public.inquiry_rate_limit_log (visitor_id, client_ip)
  values (p_visitor_id, p_client_ip);

  -- ── Honeypot: a filled hidden field means a bot filled the whole ────
  -- ── form. Returned as an ordinary "rejected" outcome — not raised —
  -- ── so the caller can't distinguish "honeypot" from any other
  -- ── rejection reason by error shape, which would teach an adversary
  -- ── the field is being checked at all.
  if p_honeypot is not null and length(trim(p_honeypot)) > 0 then
    return jsonb_build_object('status', 'rejected', 'message', 'honeypot');
  end if;

  -- ── Required-field validation ────────────────────────────────────────
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

  v_email_normalized := lower(trim(p_email));

  -- Email lock acquired here, now that we have the normalized value —
  -- as early as practical within this function's own data dependencies.
  perform pg_advisory_xact_lock(2, hashtext(v_email_normalized));

  -- ── Published-product validation (mirrors the RLS policy this RPC ───
  -- ── bypasses for its own internal insert) ────────────────────────────
  if p_product_id is not null and not exists (
    select 1 from public.products
    where id = p_product_id and status = 'published'::public.product_status
  ) then
    return jsonb_build_object('status', 'rejected', 'message', 'invalid or unpublished product');
  end if;

  -- ── Basic velocity-based rate limiting ───────────────────────────────
  -- Threshold: at most 5 attempts per visitor_id (and separately, per
  -- client IP) in a rolling 10-minute window; the 6th attempt is
  -- rate-limited. Reads inquiry_rate_limit_log, which already includes
  -- the row this same call inserted above.
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

  -- Separately, at most 3 successfully-created inquiries (not attempts —
  -- this counts rows in public.inquiries itself) from the same email in
  -- the last hour. Uses >= 3, not > 3: this count runs BEFORE the current
  -- inquiry is inserted (the insert happens much later in this function),
  -- so with 3 already-existing rows, ">3" would let a 4th through and only
  -- block a 5th — an off-by-one that silently doubled the intended cap.
  -- ">=3" correctly blocks the 4th attempt, matching "at most 3" exactly.
  select count(*) into v_recent_email_count
  from public.inquiries
  where email_normalized = v_email_normalized and created_at > now() - interval '1 hour';

  if v_recent_email_count >= 3 then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  -- ── Determine qualification_stage from which fields were actually ───
  -- ── filled — never trusted directly from the caller. Uses TRUTH ──────
  -- ── semantics (coalesce(..., false)) for the two booleans, not a NULL
  -- ── check: a caller always sends false (never null) for an unchecked
  -- ── box, so "is not null" would be true for every ordinary submission
  -- ── and incorrectly advance every form to Stage 3.
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

  -- ── Lead scoring — reads admin-editable weights from ────────────────
  -- ── lead_scoring_rules (Module 2), never hardcoded here ──────────────
  v_is_free_email := v_email_normalized ~ '@(gmail|yahoo|hotmail|outlook|aol|icloud|protonmail)\.[a-z.]+$';

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
      else
        -- 'target_market_country', 'catalog_download', 'repeat_visit',
        -- and 'submission_velocity_anomaly' need data this RPC doesn't
        -- cleanly have yet — intentionally left unscored here rather
        -- than guessed at inaccurately. A future module can extend this.
        null;
    end case;
  end loop;

  v_score := greatest(0, least(100, v_score));

  -- ── Duplicate detection — still creates the inquiry, reported as a ──
  -- ── distinct status rather than silently identical to "accepted" ────
  select count(*) into v_duplicate_count
  from public.inquiries
  where email_normalized = v_email_normalized
    and created_at > now() - interval '90 days';

  v_status := case when v_duplicate_count > 0 then 'duplicate' else 'accepted' end;

  -- ── The insert itself. Sets the transaction-local trusted-scoring
  -- ── flag immediately before, so the guard trigger allows the
  -- ── computed lead_score through (see the scoring-support migration).
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

-- ══════════════════════════════════════════════════════════════════════
-- SECURITY BOUNDARY — service_role only, explicitly
-- ══════════════════════════════════════════════════════════════════════
--
-- This is the actual enforcement of everything described in this file's
-- header comment. Module 2's default-privilege lockdown (Module 3's
-- correction) already means a brand-new function like this one starts
-- with zero execute grants to anyone, including service_role — so
-- service_role needs an explicit grant here just as much as anon/
-- authenticated need an explicit revoke. Both are stated anyway, for a
-- reader who doesn't already know that default-privilege history: this
-- function's access list should be fully legible from this file alone.
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
