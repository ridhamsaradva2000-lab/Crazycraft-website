-- ============================================================================
-- Module 8 Stage 3 -- public catalog visibility wiring
--
-- Goals:
--   * Public categories require effective active visibility.
--   * Public products require published status + effective active category.
--   * product_collections cannot expose relationships for hidden products.
--   * Public product-submission RPCs reject hidden-category products.
--   * The category-visibility SECURITY DEFINER helper moves out of the
--     exposed public schema into private.
--
-- Existing admin policies remain unchanged.
-- Existing product_images / product_variants public policies remain unchanged:
-- their EXISTS subqueries read public.products as the calling role, so the
-- tightened products RLS policy composes into those checks automatically.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Canonical private RLS helper.
--    Semantics are intentionally identical to the Stage 1 public helper.
-- ----------------------------------------------------------------------------
CREATE FUNCTION private.is_category_effectively_active(p_category_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    CASE
      WHEN p_category_id IS NULL THEN false
      ELSE COALESCE(
        (
          SELECT
            c.is_active
            AND (
              c.parent_id IS NULL
              OR COALESCE(p.is_active, false)
            )
          FROM public.categories AS c
          LEFT JOIN public.categories AS p
            ON p.id = c.parent_id
          WHERE c.id = p_category_id
        ),
        false
      )
    END;
$$;

COMMENT ON FUNCTION private.is_category_effectively_active(uuid) IS
  'Module 8 Stage 3: returns true only if the category is an active Main Category, or an active Subcategory whose Main Category is also active. Returns false for NULL/nonexistent ids. SECURITY DEFINER with search_path='''' for safe RLS/submission validation use.';

REVOKE ALL ON FUNCTION private.is_category_effectively_active(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_category_effectively_active(uuid) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. Tighten existing public catalog policies in place.
--    Policy names are preserved to minimize schema churn.
-- ----------------------------------------------------------------------------
ALTER POLICY "public can view categories"
  ON public.categories
  TO anon, authenticated
  USING (
    private.is_category_effectively_active(id)
  );

ALTER POLICY "public can view published products"
  ON public.products
  TO anon, authenticated
  USING (
    status = 'published'::public.product_status
    AND private.is_category_effectively_active(category_id)
  );

ALTER POLICY "public can view product_collections"
  ON public.product_collections
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.products
      WHERE products.id = product_collections.product_id
    )
  );

-- ----------------------------------------------------------------------------
-- 3. Public inquiry submission.
--    Existing anti-abuse, qualification, scoring, duplicate, attribution,
--    and insert behavior is preserved. Only the product-validity predicate
--    gains effective category visibility.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_inquiry(
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
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
    where id = p_product_id
      and status = 'published'::public.product_status
      and private.is_category_effectively_active(category_id)
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

-- ----------------------------------------------------------------------------
-- 4. RFQ submission.
--    Existing validation/ownership/variant/quantity behavior is preserved.
--    Only product validity gains effective category visibility.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_quote_request(
  p_company_name text,
  p_email text,
  p_phone text,
  p_country text,
  p_visitor_id text,
  p_utm_source text,
  p_utm_medium text,
  p_utm_campaign text,
  p_first_touch_source text,
  p_first_touch_medium text,
  p_last_touch_source text,
  p_last_touch_medium text,
  p_fbp text,
  p_fbc text,
  p_event_id uuid,
  p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
declare
  v_buyer_id uuid;
  v_quote_request_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_variant_id uuid;
  v_quantity integer;
  v_customization_notes text;
begin
  -- ── Basic header validation ────────────────────────────────────────
  if p_email is null or length(trim(p_email)) = 0 then
    raise exception 'email is required' using errcode = '22023';
  end if;

  if p_country is null or length(trim(p_country)) = 0 then
    raise exception 'country is required' using errcode = '22023';
  end if;

  -- ── Reject malformed / empty items payloads up front ───────────────
  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'items must be a JSON array' using errcode = '22023';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'at least one item is required' using errcode = '22023';
  end if;

  -- ── Determine buyer_id ourselves — never trust caller input. ───────
  -- Only attach to a real, existing buyers row for the current session.
  -- An authenticated caller with no buyers row (or an anon caller) is
  -- treated as a guest submission (buyer_id = null). This also means a
  -- caller can never "insert items into an existing guest quote belonging
  -- to another submission" — every call to this function creates a brand
  -- new quote_requests row; there is no parameter that accepts an existing
  -- quote_request_id to append to.
  if auth.uid() is not null and exists (
    select 1 from public.buyers where id = auth.uid()
  ) then
    v_buyer_id := auth.uid();
  else
    v_buyer_id := null;
  end if;

  insert into public.quote_requests (
    buyer_id, company_name, email, phone, country,
    visitor_id, utm_source, utm_medium, utm_campaign,
    first_touch_source, first_touch_medium, last_touch_source, last_touch_medium,
    fbp, fbc, event_id
  ) values (
    v_buyer_id, p_company_name, p_email, p_phone, p_country,
    p_visitor_id, p_utm_source, p_utm_medium, p_utm_campaign,
    p_first_touch_source, p_first_touch_medium, p_last_touch_source, p_last_touch_medium,
    p_fbp, p_fbc, p_event_id
  )
  returning id into v_quote_request_id;
  -- Note: the guard-insert trigger on quote_requests still fires here and
  -- forces status/lead_score/assigned_to/follow_up_at/notes to their safe
  -- defaults regardless — this function does not rely on that alone (it
  -- never sets those columns at all), but the trigger remains as defense
  -- in depth for this INSERT path too.

  -- ── Validate and insert every item ──────────────────────────────────
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) is distinct from 'object' then
      raise exception 'each item must be a JSON object' using errcode = '22023';
    end if;

    if not (v_item ? 'product_id') or v_item->>'product_id' is null then
      raise exception 'each item requires product_id' using errcode = '22023';
    end if;

    begin
      v_product_id := (v_item->>'product_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'product_id must be a valid UUID' using errcode = '22023';
    end;

    v_variant_id := null;
    if (v_item ? 'product_variant_id') and v_item->>'product_variant_id' is not null then
      begin
        v_variant_id := (v_item->>'product_variant_id')::uuid;
      exception when invalid_text_representation then
        raise exception 'product_variant_id must be a valid UUID' using errcode = '22023';
      end;
    end if;

    if not (v_item ? 'quantity') then
      raise exception 'each item requires quantity' using errcode = '22023';
    end if;

    begin
      v_quantity := (v_item->>'quantity')::integer;
    exception when invalid_text_representation then
      raise exception 'quantity must be an integer' using errcode = '22023';
    end;

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'quantity must be greater than 0' using errcode = '22023';
    end if;

    v_customization_notes := v_item->>'customization_notes';

    -- Product must exist, be published, and belong to an effectively
    -- active category — application-level check, backed by the products
    -- FK regardless.
    if not exists (
      select 1 from public.products
      where id = v_product_id
        and status = 'published'::public.product_status
        and private.is_category_effectively_active(category_id)
    ) then
      raise exception 'product % does not exist or is not published', v_product_id using errcode = '23503';
    end if;

    -- Variant, if provided, must belong to the same product —
    -- application-level check here PLUS the composite FK on
    -- quote_request_items (product_variant_id, product_id) enforces this
    -- again at the storage layer regardless of write path.
    if v_variant_id is not null and not exists (
      select 1 from public.product_variants
      where id = v_variant_id and product_id = v_product_id
    ) then
      raise exception 'product_variant_id % does not belong to product_id %', v_variant_id, v_product_id using errcode = '23503';
    end if;

    insert into public.quote_request_items (
      quote_request_id, product_id, product_variant_id, quantity, customization_notes
    ) values (
      v_quote_request_id, v_product_id, v_variant_id, v_quantity, v_customization_notes
    );
  end loop;

  return v_quote_request_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Sample submission.
--    Existing buyer/quote ownership and lifecycle safeguards are preserved.
--    Only product validity gains effective category visibility.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_sample_request(
  p_name text,
  p_email text,
  p_phone text,
  p_company_name text,
  p_country text,
  p_product_id uuid,
  p_requested_quantity integer,
  p_quote_request_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
declare
  v_buyer_id uuid;
  v_sample_id uuid;
begin
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'name is required' using errcode = '22023';
  end if;

  if p_email is null or length(trim(p_email)) = 0 then
    raise exception 'email is required' using errcode = '22023';
  end if;

  if p_country is null or length(trim(p_country)) = 0 then
    raise exception 'country is required' using errcode = '22023';
  end if;

  if p_product_id is null then
    raise exception 'product_id is required' using errcode = '22023';
  end if;

  if p_requested_quantity is null or p_requested_quantity <= 0 then
    raise exception 'requested_quantity must be greater than 0' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.products
    where id = p_product_id
      and status = 'published'::public.product_status
      and private.is_category_effectively_active(category_id)
  ) then
    raise exception 'product % does not exist or is not published', p_product_id using errcode = '23503';
  end if;

  -- Determine buyer_id ourselves — same rule as submit_quote_request().
  if auth.uid() is not null and exists (
    select 1 from public.buyers where id = auth.uid()
  ) then
    v_buyer_id := auth.uid();
  else
    v_buyer_id := null;
  end if;

  -- Verify quote_request ownership before ever accepting the linkage.
  -- Checked against auth.uid() directly (not the derived v_buyer_id
  -- below) — auth.uid() is null if and only if there is truly no JWT at
  -- all (a genuine anonymous caller). v_buyer_id is a separate concept:
  -- it's null both for a true anonymous caller AND for an authenticated
  -- caller with no matching buyers row yet, which would incorrectly let
  -- the latter case fall through this check for the wrong reason.
  if p_quote_request_id is not null then
    if auth.uid() is null then
      raise exception 'Only an authenticated buyer may link a sample request to a quote request' using errcode = '42501';
    end if;

    if not exists (
      select 1 from public.quote_requests
      where id = p_quote_request_id and buyer_id = auth.uid()
    ) then
      raise exception 'You may only link a sample request to your own quote request' using errcode = '42501';
    end if;
  end if;

  insert into public.samples (
    buyer_id, name, email, phone, company_name, country,
    product_id, requested_quantity, quote_request_id
  ) values (
    v_buyer_id, p_name, p_email, p_phone, p_company_name, p_country,
    p_product_id, p_requested_quantity, p_quote_request_id
  )
  returning id into v_sample_id;
  -- The guard-insert trigger on samples still fires here and forces every
  -- lifecycle field (payment/shipping/tracking/status/assigned_to) to its
  -- safe default regardless — this function never sets those columns
  -- either, but the trigger remains as defense in depth on this INSERT
  -- path too.

  return v_sample_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. Remove the superseded public helper.
--
-- Pre-flight confirmed:
--   * no database dependency references it;
--   * no runtime source code calls it;
--   * only the generated public Database type and Stage 1 migration mention it.
-- The generated type will be refreshed after this migration is validated.
-- ----------------------------------------------------------------------------
DROP FUNCTION public.is_category_effectively_active(uuid);
