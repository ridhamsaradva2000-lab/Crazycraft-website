-- 20260725121000_create_guard_triggers.sql
--
-- Defense-in-depth column protection. Two distinct behaviors, per explicit
-- instruction:
--   INSERT — database-controlled defaults may safely overwrite/ignore
--            internal fields (a non-admin trying to smuggle status='won'
--            on insert just gets 'new' instead; no error, no leak).
--   UPDATE — silently overwriting is NOT acceptable. If a non-admin's
--            UPDATE statement attempts to change a protected field, the
--            trigger raises an exception and the whole transaction is
--            rejected. The caller finds out immediately, rather than
--            believing their (ignored) change succeeded.
--
-- These triggers fire regardless of write path (direct table access,
-- PostgREST, or an admin RPC calling the same UPDATE internally) because
-- private.has_admin_role() reads auth.uid() from the actual calling
-- session's JWT — it is unaffected by SECURITY DEFINER context. This is
-- what lets the admin RPCs (next migration) and direct admin table access
-- both work, while a buyer or anon caller is rejected either way.

-- ── buyers ───────────────────────────────────────────────────────────────

create or replace function private.buyers_guard_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not private.has_admin_role('sales'::public.admin_role) then
    new.verified := false;
  end if;
  new.created_at := now();
  return new;
end;
$$;

create trigger trg_buyers_guard_insert
  before insert on buyers
  for each row execute function private.buyers_guard_insert();

create or replace function private.buyers_guard_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.verified is distinct from old.verified
     and not private.has_admin_role('sales'::public.admin_role) then
    raise exception
      'Only an authorized admin may change the verified status of a buyer account'
      using errcode = '42501';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'created_at cannot be modified' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger trg_buyers_guard_update
  before update on buyers
  for each row execute function private.buyers_guard_update();

-- ── inquiries ────────────────────────────────────────────────────────────

create or replace function private.inquiries_guard_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not private.has_admin_role('sales'::public.admin_role) then
    new.status := 'new'::public.lead_status;
    new.lead_score := 0;
    new.assigned_to := null;
    new.follow_up_at := null;
  end if;
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_inquiries_guard_insert
  before insert on inquiries
  for each row execute function private.inquiries_guard_insert();

create or replace function private.inquiries_guard_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not private.has_admin_role('sales'::public.admin_role) then
    if new.status is distinct from old.status
       or new.lead_score is distinct from old.lead_score
       or new.assigned_to is distinct from old.assigned_to
       or new.follow_up_at is distinct from old.follow_up_at then
      raise exception
        'Only an authorized admin may modify status, lead_score, assigned_to, or follow_up_at on an inquiry'
        using errcode = '42501';
    end if;
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'created_at cannot be modified' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger trg_inquiries_guard_update
  before update on inquiries
  for each row execute function private.inquiries_guard_update();

-- ── quote_requests ───────────────────────────────────────────────────────

create or replace function private.quote_requests_guard_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not private.has_admin_role('sales'::public.admin_role) then
    new.status := 'new'::public.lead_status;
    new.lead_score := 0;
    new.assigned_to := null;
    new.follow_up_at := null;
    new.notes := null;
  end if;
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_quote_requests_guard_insert
  before insert on quote_requests
  for each row execute function private.quote_requests_guard_insert();

create or replace function private.quote_requests_guard_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not private.has_admin_role('sales'::public.admin_role) then
    if new.status is distinct from old.status
       or new.lead_score is distinct from old.lead_score
       or new.assigned_to is distinct from old.assigned_to
       or new.follow_up_at is distinct from old.follow_up_at
       or new.notes is distinct from old.notes then
      raise exception
        'Only an authorized admin may modify status, lead_score, assigned_to, follow_up_at, or notes on a quote request'
        using errcode = '42501';
    end if;
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'created_at cannot be modified' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger trg_quote_requests_guard_update
  before update on quote_requests
  for each row execute function private.quote_requests_guard_update();

-- ── samples ──────────────────────────────────────────────────────────────

create or replace function private.samples_guard_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not private.has_admin_role('sales'::public.admin_role) then
    new.sample_charge := 0;
    new.currency := 'USD';
    new.payment_status := 'unpaid'::public.payment_status;
    new.shipping_country := null;
    new.shipping_address := null;
    new.shipping_port := null;
    new.courier_name := null;
    new.tracking_number := null;
    new.sample_status := 'requested'::public.sample_status;
    new.assigned_to := null;
  end if;
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_samples_guard_insert
  before insert on samples
  for each row execute function private.samples_guard_insert();

create or replace function private.samples_guard_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not private.has_admin_role('sales'::public.admin_role) then
    if new.sample_charge is distinct from old.sample_charge
       or new.currency is distinct from old.currency
       or new.payment_status is distinct from old.payment_status
       or new.shipping_country is distinct from old.shipping_country
       or new.shipping_address is distinct from old.shipping_address
       or new.shipping_port is distinct from old.shipping_port
       or new.courier_name is distinct from old.courier_name
       or new.tracking_number is distinct from old.tracking_number
       or new.sample_status is distinct from old.sample_status
       or new.assigned_to is distinct from old.assigned_to then
      raise exception
        'Only an authorized admin may modify payment, shipping, tracking, status, or assignment fields on a sample request'
        using errcode = '42501';
    end if;
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'created_at cannot be modified' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger trg_samples_guard_update
  before update on samples
  for each row execute function private.samples_guard_update();

-- ── lead_activity_log ────────────────────────────────────────────────────
-- Unconditional — unlike every other guard function above, this one does
-- NOT have an admin exception. The whole point is that authorship and
-- timestamp can never be forged, including by another admin: a sales
-- admin acting maliciously (or a compromised admin session) must not be
-- able to attribute an activity-log entry to a different admin, or
-- backdate one. auth.uid() always reflects the actual calling session's
-- verified JWT, so it cannot be spoofed regardless of what a caller
-- attempts to pass in the INSERT statement (which, per the grants
-- migration, cannot even name created_by/created_at at all — this trigger
-- is the second, independent layer).
create or replace function private.lead_activity_log_guard_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.created_by := auth.uid();
  new.created_at := now();
  return new;
end;
$$;

create trigger trg_lead_activity_log_guard_insert
  before insert on lead_activity_log
  for each row execute function private.lead_activity_log_guard_insert();
