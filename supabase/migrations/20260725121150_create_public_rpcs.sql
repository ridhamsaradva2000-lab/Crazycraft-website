-- 20260725121150_create_public_rpcs.sql
--
-- Replaces the previous (broken) design where anon inserted directly into
-- quote_requests then quote_request_items, and had no way to even read
-- back the generated id (no anon SELECT policy on quote_requests exists,
-- nor should one). submit_quote_request() creates the header and every
-- item in one transaction and returns only the new id — nothing else.
--
-- This is the ONLY sanctioned way to create a quote_request with items.
-- Direct INSERT grants on quote_requests and quote_request_items are
-- removed for anon/authenticated in the grants migration — even an
-- authenticated buyer goes through this same function, which computes
-- buyer_id from auth.uid() itself rather than trusting caller input, so
-- ownership is always verified by the database, never asserted by the client.

create or replace function public.submit_quote_request(
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
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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

    -- Product must exist and be published — application-level check,
    -- backed by the products FK regardless.
    if not exists (
      select 1 from public.products
      where id = v_product_id and status = 'published'::public.product_status
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

revoke all on function public.submit_quote_request(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text, uuid, jsonb
) from public;
grant execute on function public.submit_quote_request(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text, uuid, jsonb
) to anon, authenticated;

-- ══════════════════════════════════════════════════════════════════════
-- submit_sample_request()
-- ══════════════════════════════════════════════════════════════════════
--
-- The direct INSERT grant on samples (grants migration) deliberately
-- excludes inquiry_id and quote_request_id entirely — neither can be named
-- in a raw INSERT statement by anon or authenticated. This function is the
-- only way to set quote_request_id, and it verifies ownership itself:
--
--   - inquiry_id is not accepted as a parameter AT ALL. inquiries has no
--     buyer/owner column of any kind, so there is no way to verify a
--     caller's right to link to one — accepting it from an untrusted
--     public caller would let anyone attach a sample to any inquiry they
--     can guess the UUID of. That linkage is deferred to a future
--     admin/server-side path, once one exists.
--   - quote_request_id, if provided, is only accepted from an
--     authenticated caller whose own buyers row owns that specific
--     quote_request (quote_requests.buyer_id = auth.uid()). A guest
--     (anon, or authenticated with no matching buyers row) supplying any
--     quote_request_id is rejected outright — there's no session identity
--     to verify a guest's claim against.
create or replace function public.submit_sample_request(
  p_name text,
  p_email text,
  p_phone text,
  p_company_name text,
  p_country text,
  p_product_id uuid,
  p_requested_quantity integer,
  p_quote_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
    where id = p_product_id and status = 'published'::public.product_status
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

revoke all on function public.submit_sample_request(
  text, text, text, text, text, uuid, integer, uuid
) from public;
grant execute on function public.submit_sample_request(
  text, text, text, text, text, uuid, integer, uuid
) to anon, authenticated;
