-- 20260726090000_module4_scoring_support.sql
--
-- MODULE 4 ADDITION — the one documented, necessary change to Module 2
-- behavior this module requires. Everything else in Module 2/3 is
-- untouched.
--
-- Why this is needed: the lead-scoring engine (public.submit_inquiry(),
-- next migration) must write a computed lead_score at insert time. The
-- existing trg_inquiries_guard_insert trigger (Module 2) unconditionally
-- forces lead_score to 0 unless the CALLING SESSION is an admin
-- (private.has_admin_role('sales')) — but a genuine public form
-- submission never is, even when the write happens inside a SECURITY
-- DEFINER RPC (SECURITY DEFINER bypasses GRANT checks, not triggers, and
-- auth.uid()/has_admin_role() still resolve based on the actual calling
-- session's JWT regardless of definer context).
--
-- Fix: a transaction-local GUC flag that ONLY submit_inquiry() sets,
-- immediately before its own internal INSERT, checked by the trigger as
-- an ADDITIONAL bypass condition for lead_score specifically —
-- status/assigned_to/follow_up_at remain forced to their safe defaults
-- regardless of this flag. Since the flag is transaction-local
-- (set_config(..., true)), it cannot leak beyond the RPC's own
-- transaction, and no other code path in this project ever sets it, so a
-- direct table INSERT (bypassing the RPC) still gets lead_score forced
-- to 0 exactly as before.

create or replace function private.inquiries_guard_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not private.has_admin_role('sales'::public.admin_role) then
    new.status := 'new'::public.lead_status;
    new.assigned_to := null;
    new.follow_up_at := null;

    -- lead_score is the one exception: allowed through only when the
    -- trusted scoring-engine RPC has explicitly flagged this specific
    -- transaction. Every other caller (including a direct table insert
    -- that bypasses the RPC entirely) still gets forced to 0.
    if current_setting('app.trusted_scoring_context', true) is distinct from 'on' then
      new.lead_score := 0;
    end if;
  end if;

  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

-- Lightweight rate-limit tracking for public inquiry submissions.
-- Deliberately minimal (no FK, no RLS-protected relationship to other
-- tables) — this table exists purely to answer "how many submissions
-- from this visitor/IP in the recent window", not to store anything
-- sensitive or query-able beyond that.
create table public.inquiry_rate_limit_log (
  id uuid primary key default gen_random_uuid(),
  visitor_id text,
  client_ip inet,
  created_at timestamptz not null default now()
);

create index idx_inquiry_rate_limit_log_visitor_id on public.inquiry_rate_limit_log(visitor_id);
create index idx_inquiry_rate_limit_log_client_ip on public.inquiry_rate_limit_log(client_ip);
create index idx_inquiry_rate_limit_log_created_at on public.inquiry_rate_limit_log(created_at desc);

comment on table public.inquiry_rate_limit_log is
  'Written to by submit_inquiry() on every attempt (including rejected ones) to support rate limiting. Not user-facing, no RLS policies needed beyond RLS being enabled with zero grants (default-deny), matching the capi_events pattern — only the SECURITY DEFINER RPC ever touches this table.';

alter table public.inquiry_rate_limit_log enable row level security;
-- No policies at all, matching capi_events' pattern: total default-deny
-- for anon/authenticated. Only submit_inquiry() (SECURITY DEFINER)
-- writes here, bypassing RLS for its own internal statements.
