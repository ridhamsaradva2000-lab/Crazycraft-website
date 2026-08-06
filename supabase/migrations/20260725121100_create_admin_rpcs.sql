-- 20260725121100_create_admin_rpcs.sql
--
-- Protected RPCs for admin-controlled fields. These are the sanctioned
-- write path for Module 5's CRM UI (called via supabase.rpc(), using the
-- normal publishable-key client from the logged-in admin's own session —
-- never the secret key, and never exposed to the browser as a raw table
-- write). Each function re-checks private.has_admin_role() itself, so it
-- is safe even if called directly. The guard triggers from the previous
-- migration still fire on the UPDATE these functions issue internally —
-- the RPC does not bypass that check, it simply gives admin tooling a
-- clean, explicit API instead of hand-built .update() calls.

create or replace function public.admin_verify_buyer(
  p_buyer_id uuid,
  p_verified boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_admin_role('sales'::public.admin_role) then
    raise exception 'Only an authorized admin may verify a buyer account' using errcode = '42501';
  end if;

  update public.buyers
  set verified = p_verified
  where id = p_buyer_id;

  if not found then
    raise exception 'Buyer % not found', p_buyer_id using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.admin_verify_buyer(uuid, boolean) from public;
grant execute on function public.admin_verify_buyer(uuid, boolean) to authenticated;

create or replace function public.admin_update_inquiry(
  p_inquiry_id uuid,
  p_status public.lead_status,
  p_lead_score integer,
  p_assigned_to uuid,
  p_follow_up_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_admin_role('sales'::public.admin_role) then
    raise exception 'Only an authorized admin may update inquiry management fields' using errcode = '42501';
  end if;

  if p_lead_score < 0 or p_lead_score > 100 then
    raise exception 'lead_score must be between 0 and 100' using errcode = '23514';
  end if;

  update public.inquiries
  set
    status = p_status,
    lead_score = p_lead_score,
    assigned_to = p_assigned_to,
    follow_up_at = p_follow_up_at
  where id = p_inquiry_id;

  if not found then
    raise exception 'Inquiry % not found', p_inquiry_id using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.admin_update_inquiry(uuid, public.lead_status, integer, uuid, timestamptz) from public;
grant execute on function public.admin_update_inquiry(uuid, public.lead_status, integer, uuid, timestamptz) to authenticated;

create or replace function public.admin_update_quote_request(
  p_quote_request_id uuid,
  p_status public.lead_status,
  p_lead_score integer,
  p_assigned_to uuid,
  p_follow_up_at timestamptz,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_admin_role('sales'::public.admin_role) then
    raise exception 'Only an authorized admin may update quote request management fields' using errcode = '42501';
  end if;

  if p_lead_score < 0 or p_lead_score > 100 then
    raise exception 'lead_score must be between 0 and 100' using errcode = '23514';
  end if;

  update public.quote_requests
  set
    status = p_status,
    lead_score = p_lead_score,
    assigned_to = p_assigned_to,
    follow_up_at = p_follow_up_at,
    notes = p_notes
  where id = p_quote_request_id;

  if not found then
    raise exception 'Quote request % not found', p_quote_request_id using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.admin_update_quote_request(uuid, public.lead_status, integer, uuid, timestamptz, text) from public;
grant execute on function public.admin_update_quote_request(uuid, public.lead_status, integer, uuid, timestamptz, text) to authenticated;

create or replace function public.admin_update_sample_status(
  p_sample_id uuid,
  p_sample_status public.sample_status,
  p_payment_status public.payment_status,
  p_assigned_to uuid,
  p_courier_name text,
  p_tracking_number text,
  p_sample_charge numeric,
  p_currency text,
  p_shipping_country text,
  p_shipping_address text,
  p_shipping_port text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_admin_role('sales'::public.admin_role) then
    raise exception 'Only an authorized admin may update sample management fields' using errcode = '42501';
  end if;

  if p_sample_charge < 0 then
    raise exception 'sample_charge must be >= 0' using errcode = '23514';
  end if;

  if p_currency !~ '^[A-Z]{3}$' then
    raise exception 'currency must be a 3-letter uppercase ISO code' using errcode = '23514';
  end if;

  update public.samples
  set
    sample_status = p_sample_status,
    payment_status = p_payment_status,
    assigned_to = p_assigned_to,
    courier_name = p_courier_name,
    tracking_number = p_tracking_number,
    sample_charge = p_sample_charge,
    currency = p_currency,
    shipping_country = p_shipping_country,
    shipping_address = p_shipping_address,
    shipping_port = p_shipping_port
  where id = p_sample_id;

  if not found then
    raise exception 'Sample % not found', p_sample_id using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.admin_update_sample_status(uuid, public.sample_status, public.payment_status, uuid, text, text, numeric, text, text, text, text) from public;
grant execute on function public.admin_update_sample_status(uuid, public.sample_status, public.payment_status, uuid, text, text, numeric, text, text, text, text) to authenticated;
